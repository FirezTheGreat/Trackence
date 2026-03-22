import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, ChevronLeft, QrCode, AlertCircle, ScanLine, RefreshCw, KeyRound, MonitorCheck, Users } from "lucide-react";
import { ApiError, sessionAPI } from "../services/session.service";
import { useAuthStore } from "../stores/auth.store";
import { connectSessionSocket, disconnectSessionSocket } from "../services/socket.service";

const QRScanner = () => {
  const user = useAuthStore((state) => state.user);
  const role = user?.role;
  const activeOrgId = user?.currentOrganizationId || user?.organizationIds?.[0] || null;
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sessionTimeLeft, setSessionTimeLeft] = useState<Record<string, number>>({});
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const recentScanRef = useRef<{ raw: string; at: number } | null>(null);

  // For demo: allow manual QR input
  const [manualQRToken, setManualQRToken] = useState("");
  const [useManualMode, setUseManualMode] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(false);

  const normalizeDetectedPayload = (
    rawValue: string,
    fallbackSessionId?: string
  ): { sessionId: string; qrToken: string; issuedAt?: number; expiresAt?: number } | null => {
    const trimmed = String(rawValue || "").trim();
    if (!trimmed) return null;

    try {
      const parsed = JSON.parse(trimmed) as {
        sessionId?: string;
        qrToken?: string;
        issuedAt?: number;
        expiresAt?: number;
      };

      if (parsed.sessionId && parsed.qrToken) {
        return {
          sessionId: parsed.sessionId,
          qrToken: parsed.qrToken,
          issuedAt: parsed.issuedAt,
          expiresAt: parsed.expiresAt,
        };
      }
    } catch {
      // Non-JSON payloads are treated as raw tokens tied to the selected session.
    }

    if (!fallbackSessionId) return null;
    return {
      sessionId: fallbackSessionId,
      qrToken: trimmed,
    };
  };

  // Helper function to mask session ID
  const maskSessionId = (sessionId: string) => {
    if (!sessionId) return "";
    if (sessionId.length <= 8) return sessionId;
    return `${sessionId.slice(0, 4)}****${sessionId.slice(-4)}`;
  };

  // Load active sessions initially and whenever active organization changes
  useEffect(() => {
    setSelectedSession(null);
    setError(null);
    setSuccess(null);
    setManualQRToken("");
    setUseManualMode(false);
    loadActiveSessions();
  }, [activeOrgId]);

  // Start camera when a session is selected
  useEffect(() => {
    if (videoElement && !useManualMode && selectedSession) {
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: "environment" } })
        .then((stream) => {
          streamRef.current = stream; // Store stream in ref
          if (videoElement) {
            videoElement.srcObject = stream;
            
            // Detect if front camera is being used
            const videoTrack = stream.getVideoTracks()[0];
            const settings = videoTrack.getSettings();
            setIsFrontCamera(settings.facingMode === 'user');
          }

          if (scanIntervalRef.current) {
            window.clearInterval(scanIntervalRef.current);
            scanIntervalRef.current = null;
          }

          scanIntervalRef.current = window.setInterval(() => {
            if (!videoElement || !canvasRef.current || loading) return;
            const video = videoElement;
            const canvas = canvasRef.current;

            if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

            const width = video.videoWidth;
            const height = video.videoHeight;
            if (!width || !height) return;

            canvas.width = width;
            canvas.height = height;

            const context = canvas.getContext("2d", { willReadFrequently: true });
            if (!context) return;

            context.drawImage(video, 0, 0, width, height);
            const imageData = context.getImageData(0, 0, width, height);
            const decoded = jsQR(imageData.data, width, height);
            const raw = decoded?.data?.trim();
            if (!raw) return;

            const now = Date.now();
            if (
              recentScanRef.current &&
              recentScanRef.current.raw === raw &&
              now - recentScanRef.current.at < 2000
            ) {
              return;
            }

            const payload = normalizeDetectedPayload(raw, selectedSession.sessionId);
            if (!payload) {
              setError("Scanned QR format is invalid for attendance.");
              return;
            }

            recentScanRef.current = { raw, at: now };
            handleMarkAttendance(payload);
          }, 450);
        })
        .catch(() => {
          setError("Camera access denied. Use manual input instead.");
          setUseManualMode(true);
        });
    } else {
      // Stop camera when selectedSession is null or manual mode is enabled
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoElement) {
        videoElement.srcObject = null;
      }
      if (scanIntervalRef.current) {
        window.clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    }

    // Cleanup: stop camera when dependencies change
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoElement) {
        videoElement.srcObject = null;
      }
      if (scanIntervalRef.current) {
        window.clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    };
  }, [useManualMode, selectedSession, loading, videoElement]);

  // Additional cleanup on component unmount to ensure camera is stopped
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoElement) {
        videoElement.srcObject = null;
      }
      if (scanIntervalRef.current) {
        window.clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }

      disconnectSessionSocket();
    };
  }, [videoElement]);

  // Live countdown timer for all active sessions
  useEffect(() => {
    if (activeSessions.length === 0) {
      setSessionTimeLeft({});
      return;
    }

    const updateSessionTimers = () => {
      const now = Date.now();

      setSessionTimeLeft((prev) => {
        const newTimeLeft: Record<string, number> = {};
        let hasExpired = false;

        activeSessions.forEach((session) => {
          if (session.isActive && session.endTime) {
            const endTimeMs = new Date(session.endTime).getTime();
            const remaining = Math.max(0, Math.ceil((endTimeMs - now) / 1000));
            newTimeLeft[session.sessionId] = remaining;

            // Check if any session just expired (hit 0)
            if (remaining === 0 && (prev[session.sessionId] ?? 0) > 0) {
              hasExpired = true;
            }
          }
        });

        // Auto-reload sessions when any timer expires
        if (hasExpired) {
          setTimeout(() => loadActiveSessions(), 1000);
        }

        return newTimeLeft;
      });
    };

    updateSessionTimers();
    const interval = setInterval(updateSessionTimers, 1000);

    return () => clearInterval(interval);
  }, [activeSessions]);

  // WebSocket: Listen for session ended events
  useEffect(() => {
    if (activeSessions.length === 0) {
      disconnectSessionSocket();
      return;
    }

    activeSessions.forEach((session) => {
      connectSessionSocket(session.sessionId, {
        onAttendanceUpdate: () => {},
        onSessionEnded: () => {
          loadActiveSessions();
          if (selectedSession?.sessionId === session.sessionId) {
            setSelectedSession(null);
          }
        },
        onQRRotated: () => {},
      });
    });

    return () => {
      // Cleanup handled by socket service
    };
  }, [activeSessions, selectedSession]);

  const loadActiveSessions = async () => {
    try {
      if (role === "faculty") {
        const activeSession = await sessionAPI.getActiveSession();
        const sessionData = activeSession as { refreshInterval?: number } | null;
        const normalized = activeSession
          ? [{
              ...activeSession,
              isActive: true,
              refreshInterval: sessionData?.refreshInterval || 10,
            }]
          : [];
        setActiveSessions(normalized);
      } else {
        const sessions = await sessionAPI.getActiveSessions();
        setActiveSessions(sessions);
      }
      setError(null);
    } catch {
      setActiveSessions([]);
    }
  };

  const handleMarkAttendance = async (payload: { sessionId: string; qrToken: string; issuedAt?: number; expiresAt?: number }) => {
    if (!payload.sessionId || !payload.qrToken) {
      setError("Session and token required");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await sessionAPI.markAttendance(payload);
      setSuccess(`✅ Attendance marked! ID: ${result.attendance.attendanceId}`);
      setManualQRToken("");

      await loadActiveSessions();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 409 && /already marked attendance/i.test(err.message)) {
          setError("You have already marked attendance for this session.");
        } else if (err.status === 401 && /already been used/i.test(err.message)) {
          setError("This QR token has already been used. Please scan the latest rotating QR.");
        } else if (err.status === 429) {
          setError("Too many attempts. Limit is 10 attendance tries per minute.");
        } else {
          setError(`[${err.status}] ${err.message}`);
        }
      } else if (err instanceof Error && err.message) {
        setError(err.message);
      } else {
        setError("Failed to mark attendance");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = () => {
    if (!selectedSession?.sessionId || !manualQRToken.trim()) {
      setError("No session selected or token entered");
      return;
    }
    handleMarkAttendance({
      sessionId: selectedSession.sessionId,
      qrToken: manualQRToken.trim(),
    });
  };

  const pageVariants: any = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        staggerChildren: 0.1,
        ease: [0.22, 1, 0.36, 1]
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  if (role !== "faculty" && role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="backdrop-blur-2xl bg-red-500/10 border border-red-500/30 p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-4"
        >
          <AlertCircle className="w-12 h-12 text-red-400" />
          <p className="text-white text-xl font-bold">Access Denied. Faculty only.</p>
        </motion.div>
      </div>
    );
  }

  const activeSessionList = activeSessions.filter((session) => {
    const timeLeft = sessionTimeLeft[session.sessionId];
    return session.isActive && timeLeft !== undefined && timeLeft > 0;
  });

  return (
    <div className="px-3 sm:px-4 md:px-16 pt-6 sm:pt-10 pb-24 flex flex-col gap-6 sm:gap-8 min-h-screen relative overflow-hidden overflow-y-auto">
      {/* Ambient Orbs */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[-10%] right-[-5%] w-[40vw] h-[40vw] bg-accent/20 rounded-full blur-[120px] opacity-60 mix-blend-screen animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-secondary/30 rounded-full blur-[150px] opacity-50 mix-blend-screen" />
      </div>

      <AnimatePresence mode="wait">
      {selectedSession ? (
        <motion.div 
          key="scanning-view"
          variants={pageVariants}
          initial="hidden"
          animate="visible"
          exit={{ opacity: 0, y: -20 }}
          className="flex flex-col gap-8 max-w-4xl mx-auto w-full"
        >
          {/* BACK BUTTON & HEADER */}
          <motion.div variants={itemVariants} className="flex items-center gap-3 sm:gap-4">
            <button
              onClick={() => {
                setSelectedSession(null);
                setError(null);
                setSuccess(null);
                setManualQRToken("");
                setUseManualMode(false);
              }}
              className="p-2 sm:p-3 bg-secondary/45 border border-white/10 rounded-xl hover:bg-white/10 hover:border-white/30 transition-all duration-300 group cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 text-white/70 group-hover:text-white transition-colors" />
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white font-satoshi tracking-tight">
                Active Session
              </h1>
              <p className="text-white/50 text-xs sm:text-sm">Scan or manually approve attendance</p>
            </div>
          </motion.div>

          {/* SESSION STATUS CARD */}
          <motion.section 
            variants={itemVariants}
            className="relative overflow-hidden backdrop-blur-2xl bg-secondary/30 rounded-2xl border border-white/10 p-4 sm:p-6 flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-6"
          >
            <div className="absolute inset-0 bg-linear-to-r from-accent/10 via-transparent to-transparent opacity-50 pointer-events-none" />
            <div className="flex items-center gap-3 sm:gap-4 z-10 w-full md:w-auto">
              <div className="p-3 sm:p-4 bg-accent/20 rounded-xl border border-accent/30 shrink-0">
                <MonitorCheck className="w-6 h-6 sm:w-8 sm:h-8 text-accent" />
              </div>
              <div className="min-w-0 pr-2">
                <p className="text-white/60 text-xs sm:text-sm mb-0.5 sm:mb-1">Session ID</p>
                <p className="text-lg sm:text-xl text-white font-bold font-geist-mono tracking-wider truncate">
                  {maskSessionId(selectedSession.sessionId)}
                </p>
              </div>
            </div>

            <div className="px-4 sm:px-6 py-3 sm:py-4 bg-black/40 rounded-xl border border-white/5 flex flex-col items-center w-full md:w-auto md:min-w-35 z-10">
              <p className="text-white/50 text-[10px] sm:text-xs uppercase tracking-wider mb-1">Time Left</p>
              <p className="text-xl sm:text-2xl font-bold text-accent font-geist-mono">
                {Math.floor((sessionTimeLeft[selectedSession.sessionId] || 0) / 60)}:{(sessionTimeLeft[selectedSession.sessionId] || 0) % 60 < 10 ? '0' : ''}{(sessionTimeLeft[selectedSession.sessionId] || 0) % 60}
              </p>
            </div>
          </motion.section>

          {/* FEEDBACK MESSAGES */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-3 text-red-200 shadow-lg shadow-red-900/20"
              >
                <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
                <span className="text-sm font-medium">{error}</span>
              </motion.div>
            )}
            {success && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="p-4 rounded-xl bg-green-500/10 border border-green-500/30 flex items-center gap-3 text-green-200 shadow-lg shadow-green-900/20"
              >
                <CheckCircle2 className="w-5 h-5 shrink-0 text-green-400" />
                <span className="text-sm font-medium">{success}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* SCANNER OR MANUAL INPUT */}
          <motion.div variants={itemVariants} className="flex-1">
            {!useManualMode ? (
              <div className="relative overflow-hidden backdrop-blur-2xl bg-secondary/40 rounded-3xl border border-white/10 p-4 sm:p-8 flex flex-col items-center justify-center min-h-[300px] shadow-2xl">
                <div className="absolute inset-0 bg-linear-to-b from-white/5 to-transparent pointer-events-none" />
                
                <AnimatePresence mode="wait">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative w-full max-w-sm aspect-square rounded-2xl overflow-hidden border border-white/20 shadow-2xl bg-black/50 mb-6 sm:mb-8 z-10"
                  >
                    <video
                      ref={setVideoElement}
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover"
                      style={{ transform: isFrontCamera ? 'scaleX(-1)' : 'none' }}
                    />
                    <canvas ref={canvasRef} className="hidden" />
                    
                    {/* Scanning UI Overlay */}
                    <div className="absolute inset-0 pointer-events-none">
                      {/* Grid overlay */}
                      <div className="w-full h-full opacity-20 bg-[linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-size-[20px_20px]" />
                      
                      {/* Corner markers */}
                      <div className="absolute top-4 left-4 sm:top-8 sm:left-8 w-8 h-8 sm:w-12 sm:h-12 border-t-4 border-l-4 border-accent rounded-tl-lg" />
                      <div className="absolute top-4 right-4 sm:top-8 sm:right-8 w-8 h-8 sm:w-12 sm:h-12 border-t-4 border-r-4 border-accent rounded-tr-lg" />
                      <div className="absolute bottom-4 left-4 sm:bottom-8 sm:left-8 w-8 h-8 sm:w-12 sm:h-12 border-b-4 border-l-4 border-accent rounded-bl-lg" />
                      <div className="absolute bottom-4 right-4 sm:bottom-8 sm:right-8 w-8 h-8 sm:w-12 sm:h-12 border-b-4 border-r-4 border-accent rounded-br-lg" />
                      
                      {/* Animated scanning line */}
                      <motion.div 
                        animate={{ y: ["0%", "300px", "0%"] }}
                        transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                        className="absolute top-4 sm:top-8 left-4 right-4 sm:left-8 sm:right-8 h-0.5 bg-accent shadow-[0_0_15px_rgba(255,107,0,0.8)]"
                      />
                    </div>
                  </motion.div>
                </AnimatePresence>

                <div className="text-center z-10 flex flex-col items-center">
                  <div className="flex items-center gap-2 mb-4 bg-accent/20 px-4 py-2 rounded-full border border-accent/30">
                    <ScanLine className="w-4 h-4 text-accent animate-pulse" />
                    <span className="text-sm font-medium text-accent">Live Tracking Active</span>
                  </div>
                  <p className="text-white/60 text-sm mb-6 max-w-xs">
                    Align the QR code within the frame markers. Attendance is validated instantly.
                  </p>
                  <button
                    onClick={() => setUseManualMode(true)}
                    className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 text-white text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <KeyRound className="w-4 h-4 text-white/60" />
                    Use Manual Entry
                  </button>
                </div>
              </div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="backdrop-blur-2xl bg-secondary/40 rounded-3xl border border-white/10 p-5 sm:p-8 shadow-2xl relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-transparent via-accent to-transparent opacity-50" />
                
                <div className="flex items-center gap-4 mb-6 sm:mb-8">
                  <div className="p-2 sm:p-3 bg-white/5 rounded-xl border border-white/10">
                    <KeyRound className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-white">Manual Override</h2>
                    <p className="text-white/50 text-xs sm:text-sm">Enter the exact QR string or Session ID</p>
                  </div>
                </div>

                <div className="space-y-5 sm:space-y-6">
                  <div>
                    <label className="block text-white/70 text-xs sm:text-sm font-medium mb-2 sm:mb-3">
                      Identity Token payload or Session Reference
                    </label>
                    <input
                      type="text"
                      value={manualQRToken}
                      onChange={(e) => setManualQRToken(e.target.value)}
                      placeholder="e.g. SES-4F2A or JSON string"
                      className="w-full px-5 py-4 rounded-xl bg-black/40 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/60 transition-all font-geist-mono"
                    />
                  </div>

                  <div className="flex gap-4">
                    <button
                      onClick={() => setUseManualMode(false)}
                      className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white font-medium rounded-xl transition cursor-pointer flex items-center justify-center gap-2"
                    >
                      <QrCode className="w-5 h-5 opacity-60" />
                      Camera View
                    </button>
                    <button
                      onClick={() => {
                        const payload = normalizeDetectedPayload(manualQRToken, selectedSession?.sessionId);
                        if (payload) {
                          handleMarkAttendance(payload);
                          return;
                        }
                        handleManualSubmit();
                      }}
                      disabled={loading || !manualQRToken}
                      className="flex-1 py-4 bg-accent hover:bg-accent/90 text-white font-bold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(255,107,0,0.3)] hover:shadow-[0_0_30px_rgba(255,107,0,0.5)] cursor-pointer flex items-center justify-center gap-2"
                    >
                      {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                      {loading ? "Validating..." : "Authorize"}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      ) : (
        <motion.div 
          key="selection-view"
          variants={pageVariants}
          initial="hidden"
          animate="visible"
          exit={{ opacity: 0, y: -20 }}
          className="flex flex-col gap-10 max-w-6xl mx-auto w-full"
        >
          {/* HERO HEADER */}
          <motion.div variants={itemVariants} className="text-center flex flex-col items-center max-w-2xl mx-auto px-4 sm:px-0">
            <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-white/5 rounded-full border border-white/10 mb-4 sm:mb-6 backdrop-blur-md">
              <QrCode className="w-3 h-3 sm:w-4 sm:h-4 text-accent" />
              <span className="text-[10px] sm:text-xs font-medium text-white/80 uppercase tracking-widest">
                Validation System Active
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-linear-to-br from-white to-white/60 tracking-tight mb-3 sm:mb-4 leading-tight">
              Connect to Session
            </h1>
            <p className="text-sm sm:text-lg text-white/50 px-2">
              Select a currently active organizational session to begin the real-time scanning feed.
            </p>
          </motion.div>

          {/* CONTROLS */}
          <motion.div variants={itemVariants} className="flex justify-end">
            <button
              onClick={loadActiveSessions}
              className="group px-5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-all font-medium flex items-center gap-2 text-sm cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
              Sync Live Feeds
            </button>
          </motion.div>

          {/* SESSION GRID */}
          <motion.div variants={itemVariants}>
            {activeSessionList.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeSessionList.map((session, i) => {
                  const timeLeft = sessionTimeLeft[session.sessionId] || 0;
                  const isExpiringSoon = timeLeft < 60;
                  
                  return (
                    <motion.button
                      key={session.sessionId}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.1, duration: 0.4 }}
                      whileHover={{ y: -8, scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedSession(session)}
                      className="relative text-left flex flex-col h-full bg-secondary/30 backdrop-blur-xl border border-white/10 rounded-3xl p-6 group cursor-pointer overflow-hidden shadow-xl"
                    >
                      {/* Card Hover Effect */}
                      <div className="absolute inset-0 bg-linear-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                      
                      {/* Accents */}
                      <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-transparent via-accent/50 to-transparent transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 ease-out" />
                      
                      <div className="flex justify-between items-start mb-6 z-10">
                        <div className="p-3 bg-white/5 rounded-2xl border border-white/5 group-hover:bg-accent/20 group-hover:border-accent/30 transition-colors duration-300">
                          <Users className="w-6 h-6 text-white group-hover:text-accent transition-colors" />
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-bold font-geist-mono \
                          ${isExpiringSoon ? 'bg-red-500/20 text-red-300 border border-red-500/30 animate-pulse' : 'bg-green-500/20 text-green-300 border border-green-500/30'}\
                        `}>
                          {Math.floor(timeLeft / 60)}:{timeLeft % 60 < 10 ? '0' : ''}{timeLeft % 60}
                        </div>
                      </div>

                      <div className="mt-auto z-10">
                        <p className="text-white/40 text-xs uppercase tracking-wider mb-2">Session ID</p>
                        <h3 className="text-xl text-white font-bold mb-4 font-geist-mono tracking-wide group-hover:text-accent transition-colors">
                          {maskSessionId(session.sessionId)}
                        </h3>
                        <div className="flex items-center gap-2 text-white/50 text-sm">
                          <RefreshCw className="w-4 h-4 opacity-50" />
                          <span>Refreshes every {session.refreshInterval || 10}s</span>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            ) : (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="backdrop-blur-2xl bg-white/5 rounded-3xl border border-white/10 p-16 text-center shadow-max flex flex-col items-center justify-center"
              >
                <div className="w-20 h-20 mb-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                  <AlertCircle className="w-10 h-10 text-white/30" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">No Secure Tunnels Active</h3>
                <p className="text-white/50 max-w-md mx-auto leading-relaxed">
                  The system detected no open sessions. A faculty administrator must broadcast a new session to begin accepting attendance signals.
                </p>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
};

export default QRScanner;