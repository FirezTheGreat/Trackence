import type { SessionItem, QrEntry } from "../../types/adminSessions.types";

interface Props {
  sessions: SessionItem[];
  selectedSessionId: string | null;
  sessionSearch: string;
  sessionFilter: "all" | "active" | "ended";
  totalSessions: number;
  totalPages: number;
  currentPage: number;
  refreshLoading: boolean;
  sessionTimeLeft: Record<string, number>;
  qrData: Record<string, QrEntry>;
  qrTimeLeft: Record<string, number>;
  endingSessionId: string | null;
  deletingSessionId: string | null;
  getPaginationButtons: () => (number | string)[];
  onSearchChange: (value: string) => void;
  onFilterChange: (filter: "all" | "active" | "ended") => void;
  onSetCurrentPage: (page: number) => void;
  onRefresh: () => void;
  onViewAttendance: (sessionId: string, refreshInterval?: number) => void;
  onEndSession: (sessionId: string, e: React.MouseEvent) => void;
  onOpenEdit: (session: SessionItem, e: React.MouseEvent) => void;
  onDeleteSession: (sessionId: string, e: React.MouseEvent) => void;
  sessionsPerPage: number;
}

const SessionsListPanel = ({
  sessions,
  selectedSessionId,
  sessionSearch,
  sessionFilter,
  totalSessions,
  totalPages,
  currentPage,
  refreshLoading,
  sessionTimeLeft,
  qrData,
  qrTimeLeft,
  endingSessionId,
  deletingSessionId,
  getPaginationButtons,
  onSearchChange,
  onFilterChange,
  onSetCurrentPage,
  onRefresh,
  onViewAttendance,
  onEndSession,
  onOpenEdit,
  onDeleteSession,
  sessionsPerPage,
}: Props) => {
  return (
    <section className="backdrop-blur-2xl bg-secondary/50 rounded-2xl border border-white/10 p-3 sm:p-5 md:p-6 lg:p-8 shadow-lg shadow-black/10">
      <h2 className="text-2xl font-bold text-white mb-6">All Sessions</h2>

      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 max-w-sm">
          <input
            type="text"
            value={sessionSearch}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by session ID"
            className="w-full px-4 py-2 rounded-lg bg-white/10 text-white placeholder:text-white/40 border border-white/10 focus:outline-none focus:border-accent"
          />
        </div>
          <div className="grid grid-cols-3 gap-2 w-full sm:w-auto">
          {(["all", "active", "ended"] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => onFilterChange(filter)}
              className={`px-3 py-2 rounded-lg text-sm transition cursor-pointer text-center ${sessionFilter === filter ? "bg-accent text-white" : "bg-white/10 text-white/60 hover:bg-white/20"}`}
            >
              {filter === "all" && "All"}
              {filter === "active" && "Active"}
              {filter === "ended" && "Ended"}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {sessions.length === 0 ? (
          <p className="text-white/50">
            {totalSessions === 0
              ? "No sessions created yet. Create one to get started!"
              : "No sessions found for this filter/search."}
          </p>
        ) : (
          <>
            <p className="text-white/70 text-sm mb-3">Click on any session to view its live attendance</p>
            {sessions.map((session) => (
              <div
                key={session.sessionId}
                onClick={() => onViewAttendance(session.sessionId, session.refreshInterval)}
                className={`p-5 rounded-lg border transition cursor-pointer ${
                  selectedSessionId === session.sessionId
                    ? "bg-[#ad431a]/10 border-[#ad431a]"
                    : "bg-white/5 border-white/10 hover:border-white/20"
                }`}
              >
                <div className="flex flex-col xl:flex-row xl:items-start gap-4">
                  <div className="flex-1 space-y-2 min-w-0">
                    <h3 className="text-white font-bold text-lg">{session.sessionId}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                      <p className="text-white/70">
                        <span className="font-semibold text-white/90">Started:</span>{" "}
                        {new Date(session.createdAt).toLocaleString()}
                      </p>
                      {!session.isActive && session.endedAt && (
                        <p className="text-white/70">
                          <span className="font-semibold text-white/90">Ended:</span>{" "}
                          {new Date(session.endedAt).toLocaleString()}
                        </p>
                      )}
                      <p className="text-white/70">
                        <span className="font-semibold text-white/90">Duration:</span> {session.duration} {session.duration === 1 ? "min" : "mins"}
                      </p>
                      <p className="text-white/70">
                        <span className="font-semibold text-white/90">Attendance:</span>{" "}
                        <span className={Number(session.checkedInCount || 0) === Math.max(Number(session.totalMember || 0), Number(session.checkedInCount || 0)) ? "text-green-400 font-bold" : ""}>
                          {Number(session.checkedInCount || 0)}/{Math.max(Number(session.totalMember || 0), Number(session.checkedInCount || 0))}
                        </span>
                        {Math.max(Number(session.totalMember || 0), Number(session.checkedInCount || 0)) > 0 && (
                          <span className="ml-1 text-white/50">
                            ({Math.round((Number(session.checkedInCount || 0) / Math.max(Number(session.totalMember || 0), Number(session.checkedInCount || 0))) * 100)}%)
                          </span>
                        )}
                      </p>
                      {session.createdByName && (
                        <p className="text-white/70 md:col-span-2 wrap-break-word">
                          <span className="font-semibold text-white/90">Created by:</span>{" "}
                          {session.createdByName}
                          {session.createdByEmail ? ` (${session.createdByEmail})` : ""}
                        </p>
                      )}
                      {session.refreshInterval && (
                        <p className="text-white/70">
                          <span className="font-semibold text-white/90">QR Refresh:</span> {session.refreshInterval}s
                        </p>
                      )}
                    </div>
                    {sessionTimeLeft[session.sessionId] !== undefined && sessionTimeLeft[session.sessionId] > 0 && (
                      <p className="text-[#ad431a] font-bold text-sm">
                        ⏳ Time left: {Math.floor(sessionTimeLeft[session.sessionId] / 60)}m {sessionTimeLeft[session.sessionId] % 60}s
                      </p>
                    )}
                  </div>

                  {session.isActive && qrData[session.sessionId] && (
                    <div className="flex flex-col items-start sm:items-center gap-2">
                      <div className="relative group">
                        <img
                          src={qrData[session.sessionId].image}
                          alt="QR Code"
                          className="w-20 h-20 rounded-lg border-2 border-[#ad431a]/50"
                        />
                        {qrTimeLeft[session.sessionId] !== undefined && (
                          <div className="absolute -bottom-1 -right-1 bg-[#ad431a] text-white text-[10px] font-bold px-1.5 py-0.5 rounded tabular-nums min-w-[2.35rem] text-center">
                            {qrTimeLeft[session.sessionId]}s
                          </div>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(`/sessions/scan/${session.sessionId}`, "_blank");
                        }}
                        className="text-xs px-2 py-1 bg-[#ad431a]/20 hover:bg-[#ad431a]/30 text-[#ad431a] border border-[#ad431a]/50 rounded transition cursor-pointer"
                      >
                        Open Full QR
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-1 gap-2 w-full xl:w-auto">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${session.isActive ? "bg-green-500/20 text-green-300" : "bg-gray-500/20 text-gray-300"}`}>
                      {session.isActive ? "Active" : "Ended"}
                    </span>
                    {session.isActive && (
                      <button
                        onClick={(e) => onEndSession(session.sessionId, e)}
                        disabled={endingSessionId === session.sessionId}
                        className="px-3 py-1 bg-red-500/20 border border-red-500/50 text-red-300 hover:bg-red-500/30 rounded-lg text-xs font-bold transition disabled:opacity-50 cursor-pointer w-full"
                      >
                        {endingSessionId === session.sessionId ? "Ending..." : "End Session"}
                      </button>
                    )}
                    <button
                      onClick={(e) => onOpenEdit(session, e)}
                      className="px-3 py-1 bg-blue-500/20 border border-blue-500/50 text-blue-300 hover:bg-blue-500/30 rounded-lg text-xs font-bold transition cursor-pointer w-full"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={(e) => onDeleteSession(session.sessionId, e)}
                      disabled={deletingSessionId === session.sessionId}
                      className="px-3 py-1 bg-red-500/20 border border-red-500/50 text-red-300 hover:bg-red-500/30 rounded-lg text-xs font-bold transition disabled:opacity-50 cursor-pointer w-full"
                    >
                      {deletingSessionId === session.sessionId ? "Deleting..." : "🗑️ Delete"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex flex-wrap justify-center items-center gap-2 mt-6">
          <button
            onClick={() => onSetCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            Previous
          </button>

          {getPaginationButtons().map((btn, idx) => (
            <button
              key={idx}
              onClick={() => typeof btn === "number" && onSetCurrentPage(btn)}
              disabled={btn === "..."}
              className={`px-4 py-2 rounded-lg transition cursor-pointer ${
                btn === currentPage
                  ? "bg-[#ad431a] text-white font-bold"
                  : btn === "..."
                  ? "bg-transparent text-white/50 cursor-default"
                  : "bg-white/10 hover:bg-white/20 text-white"
              } ${btn === "..." ? "disabled:cursor-default" : ""}`}
            >
              {btn}
            </button>
          ))}

          <button
            onClick={() => onSetCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            Next
          </button>
        </div>
      )}

      {totalSessions > 0 && (
        <p className="mt-3 text-center text-white/60 text-sm">
          Showing {(currentPage - 1) * sessionsPerPage + 1} - {Math.min(currentPage * sessionsPerPage, totalSessions)} of {totalSessions} sessions
        </p>
      )}

      <button
        onClick={onRefresh}
        disabled={refreshLoading}
        className="w-full mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition disabled:opacity-50 cursor-pointer"
      >
        {refreshLoading ? "Refreshing..." : "Refresh Sessions"}
      </button>
    </section>
  );
};

export default SessionsListPanel;
