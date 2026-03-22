import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { CalendarClock, CheckCircle2, Clock3, QrCode, RefreshCw, Users } from "lucide-react";
import { sessionAPI } from "../services/session.service";
import {
  connectSessionSocket,
  disconnectSessionSocket,
} from "../services/socket.service";

type SessionInfo = {
  sessionId: string;
  startTime: string;
  endTime: string;
  duration: number;
  refreshInterval: number;
  isActive: boolean;
  attendanceCount?: number;
  checkedInCount?: number;
  totalFaculty?: number;
  attendanceRate?: number;
  createdByName?: string | null;
  createdByEmail?: string | null;
};

type AttendancePerson = {
  attendanceId: string;
  userId: string;
  name?: string;
  email?: string;
  markedAt: string;
};

type LiveAttendance = {
  totalFaculty: number;
  totalMarked: number;
  attendance: AttendancePerson[];
  recentCheckIns: AttendancePerson[];
};

const QRFullscreen = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [qrData, setQrData] = useState<{ image: string; expiresAt: number } | null>(null);
  const [qrTimeLeft, setQrTimeLeft] = useState<number>(0);
  const [sessionTimeLeft, setSessionTimeLeft] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [liveAttendance, setLiveAttendance] = useState<LiveAttendance | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const maskSessionId = (id?: string) => {
    if (!id) return "";
    if (id.length <= 8) return id;
    return `${id.slice(0, 4)}****${id.slice(-4)}`;
  };

  const loadQR = useCallback(async () => {
    if (!sessionId) return;
    
    try {
      const data = await sessionAPI.getSessionQR(sessionId);
      setQrData({ image: data.qrImage, expiresAt: data.expiresAt });
      setError(null);
    } catch (err: any) {
      const errorMessage = String(err?.message || "").toLowerCase();
      const status = err?.response?.status;

      if (status === 503 || errorMessage.includes("service unavailable")) {
        console.log("QR not ready yet, will retry...");
      } else if (status === 404 || status === 410 || errorMessage.includes("not found") || errorMessage.includes("gone")) {
        setQrData(null);
      } else {
        setError(err.response?.data?.message || "Failed to load QR code");
      }
    }
  }, [sessionId]);

  const loadSessionInfo = useCallback(async () => {
    if (!sessionId) return;
    
    try {
      const session = await sessionAPI.getSessionStatus(sessionId);
      setSessionInfo(session as SessionInfo);
    } catch (err: any) {
      console.error("Failed to load session info:", err);
    }
  }, [sessionId]);

  const loadLiveAttendance = useCallback(async () => {
    if (!sessionId) return;

    try {
      const attendance = await sessionAPI.getLiveAttendance(sessionId);
      setLiveAttendance(attendance as LiveAttendance);
      setLastUpdatedAt(new Date());
    } catch (err: any) {
      console.error("Failed to load live attendance:", err);
    }
  }, [sessionId]);

  // Initial load
  useEffect(() => {
    if (!sessionId) {
      navigate("/admin/sessions");
      return;
    }
    
    loadQR();
    loadSessionInfo();
    loadLiveAttendance();
  }, [sessionId, loadQR, loadSessionInfo, loadLiveAttendance, navigate]);

  // QR countdown timer
  useEffect(() => {
    if (!qrData) return;

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((qrData.expiresAt - now) / 1000) - 1);
      setQrTimeLeft(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [qrData]);

  // Session time countdown
  useEffect(() => {
    if (!sessionInfo?.endTime) return;

    const updateSessionTimer = () => {
      const now = Date.now();
      const endTimeMs = new Date(sessionInfo.endTime).getTime();
      const remaining = Math.max(0, Math.ceil((endTimeMs - now) / 1000));
      setSessionTimeLeft(remaining);
    };

    updateSessionTimer();
    const interval = setInterval(updateSessionTimer, 1000);

    return () => clearInterval(interval);
  }, [sessionInfo]);

  // WebSocket for real-time QR rotation
  useEffect(() => {
    if (!sessionId) return;

    connectSessionSocket(sessionId, {
      onQRRotated: (data) => {
        if (data.sessionId !== sessionId) return;
        console.log("QR rotated (fullscreen):", sessionId);
        setQrData({ image: data.qrImage, expiresAt: data.expiresAt });
      },
      onAttendanceUpdate: () => {
        loadSessionInfo();
        loadLiveAttendance();
      },
      onSessionEnded: (data) => {
        if (data.sessionId !== sessionId) return;
        console.log("Session ended:", sessionId);
        setSessionInfo((prev) => (prev ? { ...prev, isActive: false } : prev));
        setQrData(null);
        loadSessionInfo();
        loadLiveAttendance();
      },
    });

    return () => {
      disconnectSessionSocket(sessionId);
    };
  }, [sessionId, loadSessionInfo, loadLiveAttendance]);

  // Polling fallback — only while session is active
  useEffect(() => {
    if (!sessionId || sessionInfo?.isActive === false) return;

    const interval = setInterval(() => {
      loadSessionInfo();
      loadLiveAttendance();
    }, 8000);

    return () => clearInterval(interval);
  }, [sessionId, sessionInfo?.isActive, loadSessionInfo, loadLiveAttendance]);

  const checkedInCount = Number(
    liveAttendance?.totalMarked ??
    sessionInfo?.checkedInCount ??
    sessionInfo?.attendanceCount ??
    0
  );

  const totalFaculty = Math.max(
    Number(liveAttendance?.totalFaculty ?? sessionInfo?.totalFaculty ?? 0),
    checkedInCount
  );

  const pendingCount = Math.max(totalFaculty - checkedInCount, 0);
  const attendanceRate = totalFaculty > 0 ? Math.round((checkedInCount / totalFaculty) * 100) : 0;

  const recentCheckIns = useMemo(() => {
    return (liveAttendance?.recentCheckIns || []).slice(0, 6);
  }, [liveAttendance]);

  const formatTimeLeft = (seconds: number) => {
    if (seconds <= 0) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  const handleClose = () => {
    window.close();
    setTimeout(() => {
      navigate("/admin/sessions");
    }, 120);
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary">
        <div className="text-center p-8">
          <p className="text-red-400 text-2xl font-bold font-geist-mono mb-4">{error}</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => {
                setError(null);
                loadQR();
                loadSessionInfo();
                loadLiveAttendance();
              }}
              className="px-6 py-3 bg-secondary/70 border border-white/20 hover:bg-secondary/90 text-white font-semibold rounded-xl transition cursor-pointer"
            >
              Retry
            </button>
            <button
              onClick={() => navigate("/admin/sessions")}
              className="px-6 py-3 bg-accent/20 border border-accent/40 hover:bg-accent/30 text-accent font-semibold rounded-xl transition cursor-pointer"
            >
              Back to Sessions
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-primary px-6 md:px-10 py-8">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        <section className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl px-6 md:px-8 py-6 shadow-lg shadow-black/10">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-white font-satoshi tracking-tight">
                Live QR Attendance
              </h1>
              <p className="text-white/60 text-sm md:text-base mt-1 font-geist-mono">
                Session {maskSessionId(sessionId)}
              </p>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <span
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                  sessionInfo?.isActive
                    ? "bg-green-500/15 text-green-300 border-green-500/40"
                    : "bg-white/10 text-white/70 border-white/20"
                }`}
              >
                {sessionInfo?.isActive ? "🟢 LIVE" : "⚫ ENDED"}
              </span>
              {lastUpdatedAt && (
                <span className="text-xs text-white/50">
                  Updated {lastUpdatedAt.toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-2 text-white/50 text-xs mb-1">
              <Users className="w-4 h-4" />
              Total Faculty
            </div>
            <p className="text-2xl font-bold text-white">{totalFaculty}</p>
          </div>

          <div className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-2 text-white/50 text-xs mb-1">
              <CheckCircle2 className="w-4 h-4" />
              Checked In
            </div>
            <p className="text-2xl font-bold text-green-400">{checkedInCount}</p>
          </div>

          <div className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-2 text-white/50 text-xs mb-1">
              <Clock3 className="w-4 h-4" />
              Pending
            </div>
            <p className="text-2xl font-bold text-amber-400">{pendingCount}</p>
          </div>

          <div className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-2 text-white/50 text-xs mb-1">
              <RefreshCw className="w-4 h-4" />
              Attendance Rate
            </div>
            <p className="text-2xl font-bold text-accent">{attendanceRate}%</p>
          </div>
        </section>

        <section className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl p-4 md:p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-white/70 text-sm">Check-in Progress</p>
            <p className="text-white font-semibold text-sm">
              {checkedInCount}/{totalFaculty}
            </p>
          </div>
          <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-500"
              style={{ width: `${Math.min(attendanceRate, 100)}%` }}
            />
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl p-6 shadow-lg shadow-black/10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-white/80 font-semibold">
                <QrCode className="w-5 h-5 text-accent" />
                Attendance QR
              </div>
              {sessionInfo?.isActive && (
                <span className="text-xs text-white/60">
                  Rotates every {sessionInfo.refreshInterval || 10}s
                </span>
              )}
            </div>

            <div className="relative flex justify-center pb-12">
              {sessionInfo?.isActive === false ? (
                /* ── Session Ended: graceful placeholder ── */
                <div className="w-[320px] md:w-105 flex flex-col items-center justify-center gap-4 py-16 bg-white/5 rounded-2xl border border-white/10">
                  <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-green-400" />
                  </div>
                  <div className="text-center px-6">
                    <p className="text-white text-lg font-semibold">Session Complete</p>
                    <p className="text-white/50 text-sm mt-1">
                      This session ended at{" "}
                      {sessionInfo?.endTime
                        ? new Date(sessionInfo.endTime).toLocaleTimeString()
                        : "--:--"}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-2 text-center">
                    <div>
                      <p className="text-2xl font-bold text-green-400">{checkedInCount}</p>
                      <p className="text-white/40 text-xs">Checked In</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-white">{totalFaculty}</p>
                      <p className="text-white/40 text-xs">Total Members</p>
                    </div>
                  </div>
                  <p className="text-accent font-semibold text-sm mt-1">{attendanceRate}% Attendance</p>
                </div>
              ) : qrData ? (
                <div className="p-6 bg-white rounded-2xl border border-white/20">
                  <img src={qrData.image} alt="Session QR Code" className="w-[320px] h-80 md:w-105 md:h-105" />
                </div>
              ) : (
                <div className="w-[320px] h-80 md:w-105 md:h-105 flex items-center justify-center bg-white/10 rounded-2xl border border-white/20">
                  <div className="animate-spin rounded-full h-12 w-12 border-2 border-accent border-t-transparent" />
                </div>
              )}

              {qrData && sessionInfo?.isActive && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 px-5 py-2 rounded-full bg-accent/20 border border-accent/40 text-accent text-sm font-semibold whitespace-nowrap">
                  {qrTimeLeft > 0 ? `Refreshes in ${qrTimeLeft}s` : "Refreshing QR..."}
                </div>
              )}
            </div>

            <div className="mt-4 text-center">
              {sessionInfo?.isActive !== false ? (
                <>
                  <p className="text-white/70 text-sm md:text-base">
                    Faculty should scan this QR code to mark attendance.
                  </p>
                  <p className="text-white/40 text-xs md:text-sm mt-1">
                    Keep this page open until the session ends.
                  </p>
                </>
              ) : (
                <p className="text-white/50 text-sm">
                  You can now close this page or return to the dashboard.
                </p>
              )}
            </div>
          </div>

          <div className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl p-5 shadow-lg shadow-black/10 flex flex-col gap-5">
            <div>
              <h3 className="text-white font-semibold mb-3">Session Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between text-white/60">
                  <span className="flex items-center gap-2"><CalendarClock className="w-4 h-4" /> Duration</span>
                  <span className="text-white font-medium">{sessionInfo?.duration || 0} min</span>
                </div>
                <div className="flex items-center justify-between text-white/60">
                  <span className="flex items-center gap-2"><Clock3 className="w-4 h-4" /> Time Left</span>
                  <span className="text-white font-medium">
                    {sessionInfo?.isActive === false ? "Ended" : formatTimeLeft(sessionTimeLeft)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-white/60">
                  <span>Started</span>
                  <span className="text-white font-medium">
                    {sessionInfo?.startTime ? new Date(sessionInfo.startTime).toLocaleTimeString() : "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-white/60">
                  <span>Ends</span>
                  <span className="text-white font-medium">
                    {sessionInfo?.endTime ? new Date(sessionInfo.endTime).toLocaleTimeString() : "-"}
                  </span>
                </div>
                <div className="pt-2 border-t border-white/10 text-white/60">
                  <p>Created by</p>
                  <p className="text-white text-sm font-medium truncate">
                    {sessionInfo?.createdByName || "-"}
                  </p>
                  {sessionInfo?.createdByEmail && (
                    <p className="text-white/40 text-xs truncate">{sessionInfo.createdByEmail}</p>
                  )}
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-white font-semibold mb-3">Recent Check-ins</h3>
              {recentCheckIns.length === 0 ? (
                <p className="text-white/40 text-sm">No check-ins yet.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {recentCheckIns.map((att) => (
                    <div
                      key={att.attendanceId}
                      className="rounded-xl bg-white/5 border border-white/10 px-3 py-2"
                    >
                      <p className="text-white text-sm font-medium truncate">{att.name || att.userId}</p>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-white/40 text-xs truncate">{att.email || att.userId}</p>
                        <p className="text-white/50 text-xs">{new Date(att.markedAt).toLocaleTimeString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="flex justify-center">
          <button
            onClick={handleClose}
            className="px-7 py-3 rounded-xl bg-white/10 border border-white/20 text-white/90 hover:bg-white/15 transition cursor-pointer font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default QRFullscreen;
