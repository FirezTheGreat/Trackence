import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, ChevronLeft, QrCode, AlertCircle, ScanLine, RefreshCw, KeyRound, MonitorCheck, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ApiError, sessionAPI } from "../services/session.service";
import { useAuthStore } from "../stores/auth.store";
import { connectSessionSocket, disconnectSessionSocket } from "../services/socket.service";
import { shouldEnableIOSPerfMode } from "../utils/device";
import { perfMarkEnd, perfMarkStart } from "../utils/perf";
import { useRenderDiagnostics } from "../hooks/useRenderDiagnostics";
import { toast } from "../stores/toast.store";

const ATTENDANCE_REDIRECT_DELAY_MS = 1500;

type ZoomState = {
  min: number;
  max: number;
  step: number;
};

const QRScanner = () => {
  const navigate = useNavigate();
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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const prewarmedStreamRef = useRef<MediaStream | null>(null);
  const cameraWarmupInFlightRef = useRef(false);
  const scanRafRef = useRef<number | null>(null);
  const lastDecodeAtRef = useRef(0);
  const loadingRef = useRef(false);
  const recentScanRef = useRef<{ raw: string; at: number } | null>(null);
  const selectedSessionRef = useRef<any>(null);
  const invalidPayloadAtRef = useRef(0);
  const activeVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const redirectTimerRef = useRef<number | null>(null);
  const redirectScheduledRef = useRef(false);
  const isIOSPerfMode = shouldEnableIOSPerfMode();
  const decodeIntervalMs = isIOSPerfMode ? 850 : 600;

  // For demo: allow manual QR input
  const [manualQRToken, setManualQRToken] = useState("");
  const [useManualMode, setUseManualMode] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [zoomState, setZoomState] = useState<ZoomState | null>(null);
  const [zoomValue, setZoomValue] = useState<number | null>(null);
  const [cameraAttemptNonce, setCameraAttemptNonce] = useState(0);

  useRenderDiagnostics("QRScanner", {
    activeSessions: activeSessions.length,
    selectedSessionId: selectedSession?.sessionId || "none",
    loading,
    hasError: Boolean(error),
    hasSuccess: Boolean(success),
    useManualMode,
  });

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

  const isSameTimerMap = (prev: Record<string, number>, next: Record<string, number>): boolean => {
    const prevKeys = Object.keys(prev);
    const nextKeys = Object.keys(next);
    if (prevKeys.length !== nextKeys.length) return false;

    for (let i = 0; i < nextKeys.length; i += 1) {
      const key = nextKeys[i];
      if (prev[key] !== next[key]) {
        return false;
      }
    }

    return true;
  };

  const stopCameraAndScan = () => {
    if (prewarmedStreamRef.current) {
      prewarmedStreamRef.current.getTracks().forEach((track) => track.stop());
      prewarmedStreamRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (scanRafRef.current) {
      window.cancelAnimationFrame(scanRafRef.current);
      scanRafRef.current = null;
    }

    activeVideoTrackRef.current = null;
    canvasContextRef.current = null;
    setZoomState(null);
    setZoomValue(null);
    setCameraStarting(false);
  };

  const clearScheduledRedirect = () => {
    if (redirectTimerRef.current) {
      window.clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }
    redirectScheduledRef.current = false;
  };

  const describeCameraError = (err: unknown): string => {
    const domError = err as DOMException;
    if (domError?.name === "NotAllowedError") {
      return "Camera access denied. Allow camera permissions for Chrome in Settings, refresh, and tap Retry Camera.";
    }
    if (domError?.name === "NotFoundError") {
      return "No compatible camera found. On iPads/front-camera-only devices, try camera retry or manual entry.";
    }
    if (domError?.name === "OverconstrainedError") {
      return "Preferred camera unavailable on this device. Falling back to available camera...";
    }
    return "Unable to start camera. Try retrying camera access or use manual entry.";
  };

  const attachStreamToVideo = async (videoElement: HTMLVideoElement, stream: MediaStream) => {
    videoElement.srcObject = stream;
    videoElement.muted = true;
    videoElement.setAttribute("playsinline", "true");

    await new Promise<void>((resolve) => {
      const onLoadedMetadata = () => {
        videoElement.removeEventListener("loadedmetadata", onLoadedMetadata);
        resolve();
      };

      videoElement.addEventListener("loadedmetadata", onLoadedMetadata);
      if (videoElement.readyState >= HTMLMediaElement.HAVE_METADATA) {
        videoElement.removeEventListener("loadedmetadata", onLoadedMetadata);
        resolve();
      }
    });

    await videoElement.play().catch(() => undefined);
  };

  const getCameraStream = async (): Promise<MediaStream> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera API not available in this browser.");
    }

    const choosePreferredVideoInput = (devices: MediaDeviceInfo[]): MediaDeviceInfo | null => {
      const videoInputs = devices.filter((device) => device.kind === "videoinput");
      if (videoInputs.length === 0) return null;

      const rearPatterns = /(rear|back|environment|world|main)/i;
      const frontPatterns = /(front|user|facetime)/i;

      const rearMatch = videoInputs.find((device) => rearPatterns.test(device.label || ""));
      if (rearMatch) return rearMatch;

      const neutral = videoInputs.find((device) => !frontPatterns.test(device.label || ""));
      if (neutral) return neutral;

      return videoInputs[0] || null;
    };

    const attempts: MediaStreamConstraints[] = [
      { video: { facingMode: { ideal: "environment" } } },
      { video: { facingMode: "environment" } },
    ];

    let lastError: unknown = null;
    for (const constraints of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        lastError = err;
      }
    }

    let discoveryStream: MediaStream | null = null;
    try {
      discoveryStream = await navigator.mediaDevices.getUserMedia({ video: true });

      if (navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const preferredDevice = choosePreferredVideoInput(devices);
        const activeDeviceId = discoveryStream.getVideoTracks()[0]?.getSettings().deviceId;

        if (preferredDevice?.deviceId && preferredDevice.deviceId !== activeDeviceId) {
          try {
            const preferredStream = await navigator.mediaDevices.getUserMedia({
              video: { deviceId: { exact: preferredDevice.deviceId } },
            });
            discoveryStream.getTracks().forEach((track) => track.stop());
            return preferredStream;
          } catch (err) {
            lastError = err;
          }
        }
      }

      return discoveryStream;
    } catch (err) {
      lastError = err;
      if (discoveryStream) {
        discoveryStream.getTracks().forEach((track) => track.stop());
      }
    }

    try {
      return await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "user" } } });
    } catch (err) {
      lastError = err;
    }

    throw lastError || new Error("No available camera stream");
  };

  const configureZoomCapability = (videoTrack: MediaStreamTrack) => {
    const trackAny = videoTrack as MediaStreamTrack & {
      getCapabilities?: () => { zoom?: { min?: number; max?: number; step?: number } };
      getSettings: () => MediaTrackSettings & { zoom?: number };
    };

    const capabilities = trackAny.getCapabilities?.() as
      | { zoom?: { min?: number; max?: number; step?: number } }
      | undefined;
    const zoomCapability = capabilities?.zoom;

    if (!zoomCapability || typeof zoomCapability.min !== "number" || typeof zoomCapability.max !== "number") {
      setZoomState(null);
      setZoomValue(null);
      return;
    }

    const min = Number(zoomCapability.min);
    const max = Number(zoomCapability.max);
    const step = typeof zoomCapability.step === "number" && zoomCapability.step > 0 ? zoomCapability.step : 0.1;
    const settings = trackAny.getSettings?.();
    const current = typeof settings?.zoom === "number" ? settings.zoom : min;

    setZoomState({ min, max, step });
    setZoomValue(Math.min(max, Math.max(min, current)));
  };

  const applyZoom = async (nextZoom: number) => {
    const track = activeVideoTrackRef.current;
    const currentZoomState = zoomState;
    if (!track || !currentZoomState) return;

    const clamped = Math.min(currentZoomState.max, Math.max(currentZoomState.min, nextZoom));
    setZoomValue(clamped);

    try {
      await track.applyConstraints({ advanced: [{ zoom: clamped } as any] });
    } catch {
      // Ignore unsupported zoom constraint application on some browsers.
    }
  };

  const warmupCameraFromGesture = async (): Promise<boolean> => {
    if (cameraWarmupInFlightRef.current) {
      return false;
    }

    cameraWarmupInFlightRef.current = true;
    setCameraStarting(true);
    setError(null);

    try {
      const stream = await getCameraStream();
      if (prewarmedStreamRef.current) {
        prewarmedStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      prewarmedStreamRef.current = stream;
      setUseManualMode(false);
      setCameraAttemptNonce((prev) => prev + 1);
      return true;
    } catch (err) {
      setError(describeCameraError(err));
      return false;
    } finally {
      setCameraStarting(false);
      cameraWarmupInFlightRef.current = false;
    }
  };

  const handleReturnToCamera = async () => {
    setUseManualMode(false);
    await warmupCameraFromGesture();
  };

  // Helper function to mask session ID
  const maskSessionId = (sessionId: string) => {
    if (!sessionId) return "";
    if (sessionId.length <= 8) return sessionId;
    return `${sessionId.slice(0, 4)}****${sessionId.slice(-4)}`;
  };

  // Load active sessions initially and whenever active organization changes
  useEffect(() => {
    clearScheduledRedirect();
    setSelectedSession(null);
    setError(null);
    setSuccess(null);
    setManualQRToken("");
    setUseManualMode(false);
    loadActiveSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId]);

  useEffect(() => {
    if (!selectedSession) {
      clearScheduledRedirect();
    }
  }, [selectedSession]);

  // Start camera when a session is selected
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    selectedSessionRef.current = selectedSession;
  }, [selectedSession]);

  useEffect(() => {
    if (videoElement && !useManualMode && selectedSession) {
      let cancelled = false;

      const startCameraAndScan = async () => {
        setCameraStarting(true);
        setError(null);

        try {
          const stream = prewarmedStreamRef.current || (await getCameraStream());
          prewarmedStreamRef.current = null;
          if (cancelled) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }

          streamRef.current = stream;
          await attachStreamToVideo(videoElement, stream);

          const videoTrack = stream.getVideoTracks()[0];
          activeVideoTrackRef.current = videoTrack || null;
          if (videoTrack) {
            const settings = videoTrack.getSettings();
            const isUserFacing = settings.facingMode === "user";
            setIsFrontCamera(isUserFacing);
            configureZoomCapability(videoTrack);
          }

          if (scanRafRef.current) {
            window.cancelAnimationFrame(scanRafRef.current);
            scanRafRef.current = null;
          }

          const scanLoop = () => {
            if (!videoElement || !canvasRef.current || loadingRef.current || redirectScheduledRef.current) {
              scanRafRef.current = window.requestAnimationFrame(scanLoop);
              return;
            }

            if (document.visibilityState !== "visible") {
              scanRafRef.current = window.requestAnimationFrame(scanLoop);
              return;
            }

            const now = Date.now();
            if (now - lastDecodeAtRef.current < decodeIntervalMs) {
              scanRafRef.current = window.requestAnimationFrame(scanLoop);
              return;
            }

            const video = videoElement;
            const canvas = canvasRef.current;

            if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
              scanRafRef.current = window.requestAnimationFrame(scanLoop);
              return;
            }

            const width = video.videoWidth;
            const height = video.videoHeight;
            if (!width || !height) {
              scanRafRef.current = window.requestAnimationFrame(scanLoop);
              return;
            }

            if (canvas.width !== width) {
              canvas.width = width;
            }
            if (canvas.height !== height) {
              canvas.height = height;
            }

            let context = canvasContextRef.current;
            if (!context) {
              context = canvas.getContext("2d", { willReadFrequently: true });
              canvasContextRef.current = context;
            }
            if (!context) {
              scanRafRef.current = window.requestAnimationFrame(scanLoop);
              return;
            }

            lastDecodeAtRef.current = now;
            perfMarkStart("qr.decode");
            context.drawImage(video, 0, 0, width, height);
            const imageData = context.getImageData(0, 0, width, height);
            const decoded = jsQR(imageData.data, width, height);
            perfMarkEnd("qr.decode", {
              thresholdMs: isIOSPerfMode ? 12 : 18,
              sampleEvery: isIOSPerfMode ? 8 : 20,
              payload: { hasCode: !!decoded?.data },
            });
            const raw = decoded?.data?.trim();

            if (raw) {
              if (
                recentScanRef.current &&
                recentScanRef.current.raw === raw &&
                now - recentScanRef.current.at < 2000
              ) {
                scanRafRef.current = window.requestAnimationFrame(scanLoop);
                return;
              }

              const payload = normalizeDetectedPayload(raw, selectedSession.sessionId);
              if (!payload) {
                if (now - invalidPayloadAtRef.current >= 1500) {
                  invalidPayloadAtRef.current = now;
                  setError("Scanned QR format is invalid for attendance.");
                }
                scanRafRef.current = window.requestAnimationFrame(scanLoop);
                return;
              }

              recentScanRef.current = { raw, at: now };
              handleMarkAttendance(payload);
            }

            scanRafRef.current = window.requestAnimationFrame(scanLoop);
          };

          scanRafRef.current = window.requestAnimationFrame(scanLoop);
        } catch (err) {
          setError(describeCameraError(err));
        } finally {
          setCameraStarting(false);
        }
      };

      void startCameraAndScan();

      return () => {
        cancelled = true;
        stopCameraAndScan();
      };
    } else {
      stopCameraAndScan();
    }

    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decodeIntervalMs, useManualMode, selectedSession, videoElement, cameraAttemptNonce]);

  // Additional cleanup on component unmount to ensure camera is stopped
  useEffect(() => {
    return () => {
      stopCameraAndScan();
      clearScheduledRedirect();

      disconnectSessionSocket();
    };
  }, []);

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

        return isSameTimerMap(prev, newTimeLeft) ? prev : newTimeLeft;
      });
    };

    updateSessionTimers();
    const interval = setInterval(updateSessionTimers, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          if (selectedSessionRef.current?.sessionId === session.sessionId) {
            setSelectedSession(null);
          }
        },
        onQRRotated: () => {},
      });
    });

    return () => {
      // Cleanup handled by socket service
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessions]);

  // Auto-close scanner view when the selected session expires
  useEffect(() => {
    if (!selectedSession?.sessionId) return;

    const timeLeft = sessionTimeLeft[selectedSession.sessionId];
    if (timeLeft === undefined || timeLeft > 0) return;

    setSelectedSession(null);
    clearScheduledRedirect();
    setUseManualMode(false);
    setManualQRToken("");
    setError(null);
    setSuccess("Session expired. Please select another active session.");
    loadActiveSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSession, sessionTimeLeft]);

  const loadActiveSessions = async () => {
    try {
      if (role === "member") {
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
    if (redirectScheduledRef.current) {
      return;
    }

    if (!payload.sessionId || !payload.qrToken) {
      setError("Session and token required");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    perfMarkStart("qr.markAttendance.api");
    let requestOk = false;

    try {
      const result = await sessionAPI.markAttendance(payload);
      setSuccess(`Attendance marked! ID: ${result.attendance.attendanceId}`);
      setManualQRToken("");
      requestOk = true;

      redirectScheduledRef.current = true;
      stopCameraAndScan();
      if (redirectTimerRef.current) {
        window.clearTimeout(redirectTimerRef.current);
      }
      redirectTimerRef.current = window.setTimeout(() => {
        toast.success("Attendance marked successfully.");
        navigate("/dashboard", { replace: true });
      }, ATTENDANCE_REDIRECT_DELAY_MS);

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
      perfMarkEnd("qr.markAttendance.api", {
        thresholdMs: 150,
        payload: { ok: requestOk, sessionId: payload.sessionId },
      });
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

  if (role !== "member" && role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="backdrop-blur-2xl bg-red-500/10 border border-red-500/30 p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-4"
        >
          <AlertCircle className="w-12 h-12 text-red-400" />
          <p className="text-white text-xl font-bold">Access Denied. Member only.</p>
        </motion.div>
      </div>
    );
  }

  const activeSessionList = activeSessions.filter((session) => {
    const timeLeft = sessionTimeLeft[session.sessionId];
    return session.isActive && timeLeft !== undefined && timeLeft > 0;
  });

  return (
    <div className="px-3 sm:px-4 md:px-16 pt-6 sm:pt-10 pb-24 flex flex-col gap-4 sm:gap-6 md:gap-8 min-h-screen relative overflow-hidden overflow-y-auto">
      {/* Ambient Orbs */}
      {!isIOSPerfMode && (
        <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
          <div className="absolute top-[-10%] right-[-5%] w-[40vw] h-[40vw] bg-accent/20 rounded-full blur-[120px] opacity-60 mix-blend-screen animate-pulse" style={{ animationDuration: '4s' }} />
          <div className="absolute bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-secondary/30 rounded-full blur-[150px] opacity-50 mix-blend-screen" />
        </div>
      )}

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
                clearScheduledRedirect();
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

            <div className="px-3 sm:px-5 md:px-6 py-3 sm:py-4 bg-black/40 rounded-xl border border-white/5 flex flex-col items-center w-full md:w-auto md:min-w-35 z-10">
              <p className="text-white/50 text-[10px] sm:text-xs uppercase tracking-wider mb-1">Time Left</p>
              <p className="text-xl sm:text-2xl font-bold text-accent font-geist-mono tabular-nums min-w-[5.5ch] text-center">
                {Math.floor((sessionTimeLeft[selectedSession.sessionId] || 0) / 60)}:{(sessionTimeLeft[selectedSession.sessionId] || 0) % 60 < 10 ? '0' : ''}{(sessionTimeLeft[selectedSession.sessionId] || 0) % 60}
              </p>
            </div>
          </motion.section>

          {/* FEEDBACK MESSAGES */}
          <div className="min-h-19">
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-3 text-red-200 shadow-lg shadow-red-900/20"
                >
                  <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
                  <span className="text-sm font-medium flex-1">{error}</span>
                  <button
                    onClick={() => {
                      void handleReturnToCamera();
                    }}
                    className="px-3 py-1.5 rounded-lg border border-red-300/40 text-red-100 hover:bg-red-400/10 transition text-xs font-semibold cursor-pointer"
                  >
                    Retry Camera
                  </button>
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
          </div>

          {/* SCANNER OR MANUAL INPUT */}
          <motion.div variants={itemVariants} className="flex-1">
            {!useManualMode ? (
              <div className="relative overflow-hidden backdrop-blur-2xl bg-secondary/40 rounded-3xl border border-white/10 p-4 sm:p-8 flex flex-col items-center justify-center min-h-75 shadow-2xl">
                <div className="absolute inset-0 bg-linear-to-b from-white/5 to-transparent pointer-events-none" />
                
                <AnimatePresence mode="wait">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative w-full max-w-sm aspect-square rounded-2xl overflow-hidden border border-white/20 shadow-2xl bg-black/50 mb-6 sm:mb-8 z-10"
                  >
                    <video
                      ref={(node) => {
                        videoRef.current = node;
                        setVideoElement(node);
                      }}
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
                      {isIOSPerfMode ? (
                        <div className="absolute top-1/2 left-4 right-4 sm:left-8 sm:right-8 h-0.5 bg-accent/80" />
                      ) : (
                        <motion.div 
                          animate={{ y: ["0%", "300px", "0%"] }}
                          transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                          className="absolute top-4 sm:top-8 left-4 right-4 sm:left-8 sm:right-8 h-0.5 bg-accent shadow-[0_0_15px_rgba(255,107,0,0.8)]"
                        />
                      )}
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
                  {zoomState && zoomValue !== null && (
                    <div className="w-full max-w-xs mb-5 rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                      <div className="flex items-center justify-between text-xs text-white/70 mb-2">
                        <span>Zoom</span>
                        <span>{zoomValue.toFixed(1)}x</span>
                      </div>
                      <input
                        type="range"
                        min={zoomState.min}
                        max={zoomState.max}
                        step={zoomState.step}
                        value={zoomValue}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          void applyZoom(next);
                        }}
                        className="w-full accent-accent cursor-pointer"
                      />
                    </div>
                  )}
                  {cameraStarting && (
                    <p className="text-xs text-white/55 mb-4">Starting camera...</p>
                  )}
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
                      onClick={() => {
                        void handleReturnToCamera();
                      }}
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
              className="group px-3 sm:px-5 py-2 sm:py-2.5 backdrop-blur-xl perf-soft-glass bg-white/5 border border-white/20 rounded-lg text-white/85 hover:text-white hover:bg-white/10 transition-all font-medium flex items-center gap-2 text-xs sm:text-sm cursor-pointer touch-manipulation"
            >
              <RefreshCw className={`w-4 h-4 ${isIOSPerfMode ? "" : "group-hover:rotate-180 transition-transform duration-500"}`} />
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
                      whileHover={isIOSPerfMode ? undefined : { y: -8, scale: 1.02 }}
                      whileTap={isIOSPerfMode ? undefined : { scale: 0.98 }}
                      onClick={() => {
                        setSelectedSession(session);
                        void warmupCameraFromGesture();
                      }}
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
                        } tabular-nums min-w-[4.5rem] text-center`}>
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
                  The system detected no open sessions. A member administrator must broadcast a new session to begin accepting attendance signals.
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
