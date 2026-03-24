import type { LiveAttendanceData, QrEntry, SessionItem } from "../../types/adminSessions.types";

interface Props {
  selectedSessionId: string | null;
  selectedSession: SessionItem | null;
  liveAttendance: LiveAttendanceData | null;
  qrData: Record<string, QrEntry>;
  qrTimeLeft: Record<string, number>;
  selectedSessionRefreshInterval: number;
}

const LiveAttendancePanel = ({
  selectedSessionId,
  selectedSession,
  liveAttendance,
  qrData,
  qrTimeLeft,
  selectedSessionRefreshInterval,
}: Props) => {
  return (
    <section className="backdrop-blur-2xl bg-secondary/50 rounded-2xl border border-white/10 p-8 shadow-lg shadow-black/10">
      <h2 className="text-2xl font-bold text-white mb-6">Live Attendance</h2>

      {!selectedSessionId ? (
        <p className="text-white/50">Click on a session to view live attendance</p>
      ) : (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-white/5 border border-white/10">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-white/70 text-sm">Session ID:</p>
                <p className="text-white font-bold font-geist-mono text-lg">{selectedSessionId}</p>
              </div>
              {selectedSession?.isActive && (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-500/20 text-green-300">🟢 LIVE</span>
              )}
            </div>

            {liveAttendance && (() => {
              const totalMember = Number(liveAttendance.totalMember || 0);
              const totalMarked = Number(liveAttendance.totalMarked || 0);
              const denominator = Math.max(totalMember, totalMarked);
              const pendingCount = Math.max(denominator - totalMarked, 0);
              const attendanceRate = denominator > 0 ? Math.round((totalMarked / denominator) * 100) : 0;

              return (
                <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-white/10">
                  <div>
                    <p className="text-white/50 text-xs">Total Members</p>
                    <p className="text-white font-bold text-2xl">{totalMember}</p>
                  </div>
                  <div>
                    <p className="text-white/50 text-xs">Checked In</p>
                    <p className="text-green-500 font-bold text-2xl">{totalMarked}</p>
                  </div>
                  <div>
                    <p className="text-white/50 text-xs">Pending</p>
                    <p className="text-yellow-400 font-bold text-2xl">{pendingCount}</p>
                  </div>
                  <div>
                    <p className="text-white/50 text-xs">Attendance Rate</p>
                    <p className="text-white font-bold text-2xl">{attendanceRate}%</p>
                  </div>
                </div>
              );
            })()}
          </div>

          {selectedSessionId && selectedSession?.isActive ? (
            qrData[selectedSessionId] ? (
              <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-white/70 text-sm font-semibold">Live QR Code</p>
                  <button
                    onClick={() => window.open(`/sessions/scan/${selectedSessionId}`, "_blank")}
                    className="px-3 py-1.5 bg-[#ad431a] hover:bg-[#8a331a] text-white text-xs font-bold rounded-lg transition flex items-center gap-1 cursor-pointer"
                  >
                    <span>🖖</span> Open Fullscreen
                  </button>
                </div>
                <div className="text-center">
                  <img
                    src={qrData[selectedSessionId].image}
                    alt="Session QR"
                    className="mx-auto rounded-lg border-2 border-[#ad431a]/50"
                    style={{ width: 200, height: 200 }}
                  />
                  {qrTimeLeft[selectedSessionId] !== undefined && (
                    <p className="text-white/50 text-xs mt-3">
                      {qrTimeLeft[selectedSessionId] > 0 ? (
                        <span>
                          Next refresh in <span className="text-[#ad431a] font-bold">{qrTimeLeft[selectedSessionId]}s</span>{" "}
                          (rotates every {selectedSessionRefreshInterval}s)
                        </span>
                      ) : (
                        <span className="text-yellow-400 font-semibold">⏳ Refreshing QR code...</span>
                      )}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-center">
                <p className="text-white/70 text-sm mb-3">Loading QR code...</p>
                <div className="mx-auto my-4 w-48 h-48 rounded-lg border-2 border-white/10 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#ad431a]"></div>
                </div>
                <p className="text-white/50 text-xs">Please wait while QR is being generated</p>
              </div>
            )
          ) : selectedSessionId ? (
            <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-center">
              <p className="text-white/70 text-sm">QR is unavailable for ended sessions.</p>
            </div>
          ) : null}

          {liveAttendance?.recentCheckIns && liveAttendance.recentCheckIns.length > 0 && (
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
              <p className="text-green-300 font-semibold text-sm mb-2 flex items-center gap-2">
                <span>•</span> Recent Check-ins (last 5)
              </p>
              <div className="space-y-1">
                {liveAttendance.recentCheckIns.slice(0, 5).map((att, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <span className="text-green-400">•</span>
                    <span className="text-white font-medium">{att.name}</span>
                    <span className="text-white/50 ml-auto">{new Date(att.markedAt).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-white/70 text-sm font-semibold mb-2">
              All Attendees ({liveAttendance?.attendance?.length || 0})
            </p>
            <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
              {liveAttendance?.attendance?.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-white/50 text-sm">📋 No attendance marked yet</p>
                  <p className="text-white/40 text-xs mt-1">Waiting for member to scan QR code...</p>
                </div>
              ) : (
                liveAttendance?.attendance?.map((att, idx) => (
                  <div
                    key={att.attendanceId || idx}
                    className="p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="text-white font-bold text-sm flex items-center gap-2">
                          <span className="text-green-400">✓</span>
                          {att.name}
                        </p>
                        <p className="text-white/60 text-xs mt-0.5">{att.email}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-white/50 text-xs">{new Date(att.markedAt).toLocaleTimeString()}</p>
                        <p className="text-white/40 text-[10px] mt-0.5">{new Date(att.markedAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default LiveAttendancePanel;
