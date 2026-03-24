import type { SessionData } from "../../types/absences.types";

interface SessionStatus {
    label: string;
    color: string;
    icon: string;
}

interface Props {
    loading: boolean;
    sessions: SessionData[];
    selectedSessionId: string | null;
    sessionSearch: string;
    sessionFilter: "all" | "active";
    filteredSessions: SessionData[];
    paginatedSessions: SessionData[];
    currentPage: number;
    sessionsPerPage: number;
    paginationButtons: (number | string)[];
    totalPages: number;
    onSearchChange: (value: string) => void;
    onSessionFilterChange: (value: "all" | "active") => void;
    onSessionSelect: (sessionId: string) => void;
    onPageChange: (page: number) => void;
    getSessionStatus: (session: SessionData) => SessionStatus;
}

const SessionSelector = ({
    loading,
    sessions,
    selectedSessionId,
    sessionSearch,
    sessionFilter,
    filteredSessions,
    paginatedSessions,
    currentPage,
    sessionsPerPage,
    paginationButtons,
    totalPages,
    onSearchChange,
    onSessionFilterChange,
    onSessionSelect,
    onPageChange,
    getSessionStatus,
}: Props) => {
    return (
        <div className="backdrop-blur-2xl bg-secondary/50 rounded-2xl border border-white/10 p-6 shadow-lg shadow-black/10">
            <h2 className="text-xl font-semibold text-white mb-4">Select Session</h2>

            {loading && !selectedSessionId ? (
                <p className="text-white/60">Loading sessions...</p>
            ) : sessions.length === 0 ? (
                <p className="text-white/60">
                    No sessions found. Create a session first to manage absences.
                </p>
            ) : (
                <>
                    <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex-1 max-w-sm">
                            <input
                                type="text"
                                value={sessionSearch}
                                onChange={(event) => onSearchChange(event.target.value)}
                                placeholder="Search by session ID"
                                className="w-full px-4 py-2 rounded-lg bg-white/10 text-white placeholder:text-white/40 border border-white/10 focus:outline-none focus:border-accent"
                            />
                        </div>
                        <div className="flex gap-2">
                            {(["all", "active"] as const).map((f) => (
                                <button
                                    key={f}
                                    onClick={() => onSessionFilterChange(f)}
                                    className={`px-4 py-2 rounded-lg text-sm transition cursor-pointer ${sessionFilter === f
                                            ? "bg-accent text-white"
                                            : "bg-white/10 text-white/60 hover:bg-white/20"
                                        }`}
                                >
                                    {f === "all" && "All Sessions"}
                                    {f === "active" && "Active Only"}
                                </button>
                            ))}
                        </div>
                    </div>

                    {filteredSessions.length === 0 ? (
                        <p className="text-white/60 text-center py-8">
                            No active sessions available. Switch to "All Sessions" to view ended sessions.
                        </p>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {paginatedSessions.map((session) => {
                                    const status = getSessionStatus(session);
                                    return (
                                        <button
                                            key={session.sessionId}
                                            onClick={() => onSessionSelect(session.sessionId)}
                                            className={`p-4 rounded-lg border-2 transition cursor-pointer ${selectedSessionId === session.sessionId
                                                    ? "border-accent bg-accent/10"
                                                    : "border-white/20 hover:border-white/40"
                                                } ${!session.isActive ? "opacity-70" : ""
                                                }`}
                                        >
                                            <div className="text-left space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <p className="font-semibold text-white font-mono text-sm">
                                                        {session.sessionId}
                                                    </p>
                                                    <span className={`px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 ${status.color}`}>
                                                        {status.icon} {status.label}
                                                    </span>
                                                </div>

                                                <div className="flex justify-between items-start text-xs">
                                                    <span className="text-white/50">Started:</span>
                                                    <span className="text-white/70 text-right">
                                                        {session.createdAt ? new Date(session.createdAt).toLocaleString() : "N/A"}
                                                    </span>
                                                </div>

                                                {!session.isActive && (
                                                    <div className="flex justify-between items-start text-xs">
                                                        <span className="text-white/50">Ended:</span>
                                                        <span className="text-white/70 text-right">
                                                            {session.endTime ? new Date(session.endTime).toLocaleString() : "N/A"}
                                                        </span>
                                                    </div>
                                                )}

                                                <div className="flex justify-between items-start text-xs">
                                                    <span className="text-white/50">Duration:</span>
                                                    <span className="text-white/70">
                                                        {session.duration} {session.duration === 1 ? "minute" : "minutes"}
                                                    </span>
                                                </div>

                                                <div className="flex justify-between items-start text-xs pt-1 border-t border-white/10">
                                                    <span className="text-white/50">Attendance:</span>
                                                    <span className="text-green-300 font-semibold">
                                                        {(() => {
                                                            const checkedIn = Number(session.checkedInCount ?? session.attendanceCount ?? 0);
                                                            const totalMember = Math.max(Number(session.totalMember ?? 0), checkedIn);
                                                            const rate = totalMember > 0 ? Math.round((checkedIn / totalMember) * 100) : 0;
                                                            return `${checkedIn}/${totalMember} (${rate}%)`;
                                                        })()}
                                                    </span>
                                                </div>

                                                {session.createdByName && (
                                                    <div className="flex justify-between items-start text-xs">
                                                        <span className="text-white/50">Created by:</span>
                                                        <span className="text-white/70 text-right">
                                                            {session.createdByName}
                                                            {session.createdByEmail ? ` (${session.createdByEmail})` : ""}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {filteredSessions.length > sessionsPerPage && (
                                <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/20">
                                    <p className="text-sm text-white/60">
                                        Showing {(currentPage - 1) * sessionsPerPage + 1} - {Math.min(currentPage * sessionsPerPage, filteredSessions.length)} of {filteredSessions.length} sessions
                                    </p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                                            disabled={currentPage === 1}
                                            className="px-4 py-2 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition"
                                        >
                                            ← Previous
                                        </button>
                                        <div className="flex gap-1 flex-wrap">
                                            {paginationButtons.map((btn, idx) => {
                                                if (btn === "...") {
                                                    return (
                                                        <div
                                                            key={`dots-${idx}`}
                                                            className="w-10 h-10 flex items-center justify-center text-white/40 font-semibold"
                                                        >
                                                            •••
                                                        </div>
                                                    );
                                                }
                                                return (
                                                    <button
                                                        key={btn}
                                                        onClick={() => onPageChange(btn as number)}
                                                        className={`w-10 h-10 rounded-lg transition cursor-pointer font-medium ${currentPage === btn
                                                                ? "bg-accent text-white shadow-lg shadow-accent/50"
                                                                : "bg-white/10 text-white/60 hover:bg-white/20"
                                                            }`}
                                                    >
                                                        {btn}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <button
                                            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                                            disabled={currentPage === totalPages}
                                            className="px-4 py-2 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition"
                                        >
                                            Next →
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    );
};

export default SessionSelector;
