import { RefreshCw, Download, CheckCircle, ShieldAlert } from "lucide-react";

interface Summary {
    total: number;
    attended: number;
    attendancePercentage: number;
    absent: number;
    absencePercentage: number;
    excused: number;
}

interface SelectedSessionMeta {
    duration?: number;
    createdByName?: string | null;
    createdByEmail?: string | null;
}

interface Props {
    selectedSessionId: string | null;
    sessionSummary: Summary | null;
    selectedSession: SelectedSessionMeta | null;
    loadingAbsences: boolean;
    loading: boolean;
    hasAbsenceData: boolean;
    excuseReason: string;
    selectedPendingCount: number;
    onExcuseReasonChange: (value: string) => void;
    onExportReport: () => void;
    onRefresh: () => void;
    onBulkExcuse: () => void;
    onBulkMarkAttended: () => void;
}

const SummaryActions = ({
    selectedSessionId,
    sessionSummary,
    selectedSession,
    loadingAbsences,
    loading,
    hasAbsenceData,
    excuseReason,
    selectedPendingCount,
    onExcuseReasonChange,
    onExportReport,
    onRefresh,
    onBulkExcuse,
    onBulkMarkAttended,
}: Props) => {
    if (selectedSessionId && loadingAbsences) {
        return (
            <div className="backdrop-blur-2xl bg-secondary/50 rounded-2xl border border-white/10 p-12 shadow-lg shadow-black/10">
                <div className="flex flex-col items-center justify-center space-y-4">
                    <div className="relative">
                        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-accent"></div>
                        <div className="absolute top-0 left-0 animate-ping rounded-full h-16 w-16 border-4 border-accent/30"></div>
                    </div>
                    <p className="text-white/80 text-lg font-medium">Loading absence details...</p>
                    <p className="text-white/50 text-sm">Detecting absences and generating summary</p>
                </div>
            </div>
        );
    }

    if (!selectedSessionId || !sessionSummary || loadingAbsences) {
        return null;
    }

    const formatDuration = (minutes?: number) => {
        if (typeof minutes !== "number" || Number.isNaN(minutes)) return "N/A";
        if (minutes < 60) return `${minutes}m`;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours}h ${mins}m`;
    };

    const creatorText = `${selectedSession?.createdByName || "N/A"}${
        selectedSession?.createdByEmail ? ` (${selectedSession.createdByEmail})` : ""
    }`;

    return (
        <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
            {/* Dashboard Summary UI */}
            <div className="backdrop-blur-2xl bg-secondary/45 rounded-[20px] border border-white/20 p-6 shadow-md flex flex-col justify-between">
                <div>
                    <h3 className="text-xl font-jetbrains-sans font-semibold text-[#ad431a] mb-5 tracking-wide flex items-center gap-2">
                        📊 Session Overview
                    </h3>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Stat Card 1 */}
                        <div className="bg-black/20 p-4 rounded-[14px] border border-white/5 flex flex-col justify-center items-center">
                            <span className="text-white/60 font-outfit text-sm tracking-widest uppercase mb-1 text-center">Total Members</span>
                            <div className="flex items-end gap-1 font-geist-mono mt-1">
                                <span className="text-white text-3xl font-bold">{sessionSummary.total}</span>
                                <span className="text-lg text-white/40 mb-1">👨‍🏫</span>
                            </div>
                        </div>

                        {/* Stat Card 2 */}
                        <div className="bg-black/20 p-4 rounded-[14px] border border-white/5 flex flex-col justify-center items-center">
                            <span className="text-white/60 font-outfit text-sm tracking-widest uppercase mb-1">Attended</span>
                            <div className="flex flex-col items-center gap-1 font-geist-mono">
                                <div className="flex items-end gap-1 mt-1">
                                    <span className="text-green-400 text-3xl font-bold">{sessionSummary.attended}</span>
                                </div>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 border border-green-500/30">
                                    {sessionSummary.attendancePercentage}%
                                </span>
                            </div>
                        </div>

                        {/* Stat Card 3 */}
                        <div className="bg-black/20 p-4 rounded-[14px] border border-white/5 flex flex-col justify-center items-center">
                            <span className="text-white/60 font-outfit text-sm tracking-widest uppercase mb-1">Absent</span>
                            <div className="flex flex-col items-center gap-1 font-geist-mono">
                                <div className="flex items-end gap-1 mt-1">
                                    <span className="text-red-400 text-3xl font-bold">{sessionSummary.absent}</span>
                                </div>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                                    {sessionSummary.absencePercentage}%
                                </span>
                            </div>
                        </div>

                        {/* Stat Card 4 */}
                        <div className="bg-black/20 p-4 rounded-[14px] border border-white/5 flex flex-col justify-center items-center">
                            <span className="text-white/60 font-outfit text-sm tracking-widest uppercase mb-1">Excused</span>
                            <div className="flex items-end gap-1 font-geist-mono mt-1">
                                <span className="text-yellow-400 text-3xl font-bold">{sessionSummary.excused}</span>
                                <span className="text-lg px-2 rounded-full mb-1">🛡️</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-6 space-y-2 bg-black/20 p-4 rounded-[14px] border border-white/5">
                    <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-white/60 font-outfit tracking-wide">⏱️ Duration</span>
                        <span className="text-white font-geist-mono">{formatDuration(selectedSession?.duration)}</span>
                    </div>
                    <div className="flex items-start justify-between gap-3 text-sm">
                        <span className="text-white/60 font-outfit tracking-wide">👤 Created By</span>
                        <span className="text-white font-geist-mono text-right break-all">{creatorText}</span>
                    </div>
                </div>
            </div>

            <div className="backdrop-blur-2xl bg-secondary/45 rounded-[20px] border border-white/20 p-6 shadow-md flex flex-col justify-between">
                <h3 className="text-xl font-jetbrains-sans font-semibold text-[#ad431a] mb-5 tracking-wide flex items-center gap-2">
                    ⚡ Quick Actions
                </h3>
                
                <div className="flex flex-col gap-5">
                    {/* Reason Input */}
                    <div className="bg-black/20 p-4 rounded-[14px] border border-white/5">
                        <label className="text-sm font-outfit text-white/80 mb-2 flex items-center gap-2">
                            📝 <span className="tracking-wide">Excuse Reason</span>
                        </label>
                        <textarea
                            value={excuseReason}
                            onChange={(event) => onExcuseReasonChange(event.target.value)}
                            placeholder="Brief reason (e.g. Medical, Approved leave)..."
                            rows={2}
                            className="w-full px-4 py-3 rounded-xl bg-white/5 text-white font-geist-mono text-sm placeholder:text-white/30 border border-white/10 focus:outline-none focus:border-[#ad431a]/50 focus:bg-white/10 transition-all duration-200 resize-none"
                        />
                        <p className="text-xs text-white/40 mt-2 font-outfit italic">
                            * Attached to the audit log for accountability
                        </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-3 mt-auto">
                        <button
                            onClick={onExportReport}
                            disabled={loading || !hasAbsenceData}
                            className="flex items-center justify-center gap-2 px-4 py-3 bg-secondary/60 hover:bg-[#ad431a]/80 text-white font-outfit font-medium rounded-xl border border-white/10 hover:border-white/30 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
                        >
                            <Download className="w-5 h-5 text-white/80" />
                            <span className="tracking-wide">Export Data</span>
                        </button>
                        
                        <button
                            onClick={onRefresh}
                            disabled={loadingAbsences}
                            className="flex items-center justify-center gap-2 px-4 py-3 bg-secondary/60 hover:bg-blue-600/60 text-white font-outfit font-medium rounded-xl border border-white/10 hover:border-white/30 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
                        >
                            {loadingAbsences ? (
                                <>
                                    <RefreshCw className="w-5 h-5 animate-spin text-white/80" />
                                    <span className="tracking-wide">Syncing...</span>
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="w-5 h-5 text-white/80" />
                                    <span className="tracking-wide">Sync Data</span>
                                </>
                            )}
                        </button>

                        <button
                            onClick={onBulkExcuse}
                            disabled={loading || selectedPendingCount === 0}
                            className="flex items-center justify-center gap-2 px-4 py-3 bg-secondary/60 hover:bg-yellow-600/80 text-white font-outfit font-medium rounded-xl border border-white/10 hover:border-white/30 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
                        >
                            <span className="text-lg">✨</span>
                            <span className="tracking-wide">Excuse Selected ({selectedPendingCount})</span>
                        </button>

                        <button
                            onClick={onBulkMarkAttended}
                            disabled={loading || selectedPendingCount === 0}
                            className="flex items-center justify-center gap-2 px-4 py-3 bg-secondary/60 hover:bg-green-600/80 text-white font-outfit font-medium rounded-xl border border-white/10 hover:border-white/30 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
                        >
                            <span className="text-lg">✅</span>
                            <span className="tracking-wide">Attended ({selectedPendingCount})</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SummaryActions;
