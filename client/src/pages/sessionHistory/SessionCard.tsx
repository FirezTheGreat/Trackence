import { Download } from "lucide-react";
import type { SessionHistoryItem } from "../../types/sessionHistory.types";

interface SessionCardProps {
  session: SessionHistoryItem;
  onOpen: (session: SessionHistoryItem) => void;
  onExport: (session: SessionHistoryItem, e: React.MouseEvent) => Promise<void>;
  formatDate: (isoString: string) => string;
  formatDuration: (minutes: number) => string;
}

export default function SessionCard({ session, onOpen, onExport, formatDate, formatDuration }: SessionCardProps) {
  return (
    <div
      key={session.sessionId}
      onClick={() => onOpen(session)}
      className="backdrop-blur-2xl bg-secondary/45 border border-white/20 rounded-2xl p-6 shadow-lg shadow-black/10 hover:border-accent/40 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 cursor-pointer group"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1 space-y-3">
          {session.createdByName && (
            <p className="text-white/50 text-xs">
              Created by <span className="text-white/70">{session.createdByName}</span>
              {session.createdByEmail ? ` (${session.createdByEmail})` : ""}
            </p>
          )}
          <div className="flex items-center gap-3">
            <span className="font-mono text-white/80">{session.sessionId}</span>
            {session.isActive ? (
              <span className="px-3 py-1 bg-green-500/20 border border-green-500/50 text-green-300 rounded-full text-sm">Active</span>
            ) : (
              <span className="px-3 py-1 bg-white/10 border border-white/20 text-white/60 rounded-full text-sm">Ended</span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-white/50">Started</p>
              <p className="text-white">{formatDate(session.startTime)}</p>
            </div>
            {!session.isActive && (
              <div>
                <p className="text-white/50">Ended</p>
                <p className="text-white">{session.endTime ? formatDate(session.endTime) : "N/A"}</p>
              </div>
            )}
            <div>
              <p className="text-white/50">Duration</p>
              <p className="text-white">{formatDuration(session.duration)}</p>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm border-t border-white/10">
            <span className="text-white/50">Attendance</span>
            <span className="text-green-300 font-semibold">
              {(() => {
                const checkedIn = Number(session.checkedInCount ?? session.attendanceCount ?? 0);
                const totalFaculty = Math.max(Number(session.totalFaculty ?? 0), checkedIn);
                const rate = totalFaculty > 0 ? Math.round((checkedIn / totalFaculty) * 100) : 0;
                return `${checkedIn}/${totalFaculty} (${rate}%)`;
              })()}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <button
            onClick={(e) => onExport(session, e)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white text-xs font-medium transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Excel
          </button>
          <div className="flex items-center gap-1 text-white/30 group-hover:text-accent/60 transition-all duration-300">
            <span className="text-[11px] font-medium tracking-wide">View details</span>
            <svg className="w-3.5 h-3.5 transform group-hover:translate-x-0.5 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
