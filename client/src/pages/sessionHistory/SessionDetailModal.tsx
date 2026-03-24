import { useEffect } from "react";
import { X, Users, Clock, Calendar, Hash, UserCheck, ChevronDown, ChevronUp, FileSpreadsheet } from "lucide-react";
import type { AttendanceRecord, SessionHistoryItem, SortDir, SortField } from "../../types/sessionHistory.types";

interface SessionDetailModalProps {
  selectedSession: SessionHistoryItem;
  closeDetail: () => void;
  formatDate: (isoString: string) => string;
  formatDuration: (minutes: number) => string;
  orgName: string;
  attendanceTotalMarked: number;
  attendanceTotalMember: number;
  allSorted: AttendanceRecord[];
  attendanceRecords: AttendanceRecord[];
  loadingAttendance: boolean;
  attendanceSearch: string;
  setAttendanceSearch: (value: string) => void;
  attendancePage: number;
  setAttendancePage: React.Dispatch<React.SetStateAction<number>>;
  sortField: SortField;
  sortDir: SortDir;
  toggleSort: (field: SortField) => void;
  onExportSelected: (e: React.MouseEvent) => Promise<void>;
}

const SortIcon = ({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) => {
  if (sortField !== field) return <ChevronDown className="w-3 h-3 opacity-30" />;
  return sortDir === "asc" ? <ChevronUp className="w-3 h-3 text-accent" /> : <ChevronDown className="w-3 h-3 text-accent" />;
};

export default function SessionDetailModal({
  selectedSession,
  closeDetail,
  formatDate,
  formatDuration,
  orgName,
  attendanceTotalMarked,
  attendanceTotalMember,
  allSorted,
  attendanceRecords,
  loadingAttendance,
  attendanceSearch,
  setAttendanceSearch,
  attendancePage,
  setAttendancePage,
  sortField,
  sortDir,
  toggleSort,
  onExportSelected,
}: SessionDetailModalProps) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  const ATTENDANCE_PER_PAGE = 50;
  const attendanceTotalPages = Math.max(1, Math.ceil(allSorted.length / ATTENDANCE_PER_PAGE));
  const safePage = Math.min(attendancePage, attendanceTotalPages);
  const pageSlice = allSorted.slice((safePage - 1) * ATTENDANCE_PER_PAGE, safePage * ATTENDANCE_PER_PAGE);

  return (
    <div className="fixed inset-0 z-110 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={closeDetail} />

      <div className="relative w-full max-w-5xl max-h-[90vh] flex flex-col backdrop-blur-2xl bg-secondary/95 border border-white/15 rounded-2xl shadow-2xl shadow-black/30 animate-fade-in-up overflow-hidden">
        <div className="flex items-center justify-between px-6 md:px-8 py-5 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center shrink-0">
              <Hash className="w-4 h-4 text-accent" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-white font-satoshi tracking-tight">Session Details</h2>
              <p className="text-white/40 text-xs font-mono truncate">{selectedSession.sessionId}</p>
            </div>
          </div>
          <button
            onClick={closeDetail}
            className="w-8 h-8 rounded-lg hover:bg-white/10 transition-colors cursor-pointer flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>

        <div className="px-6 md:px-8 py-5 border-b border-white/10 shrink-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-white/50 text-xs"><Calendar className="w-3.5 h-3.5" />Started</div>
              <p className="text-white text-sm font-medium">{formatDate(selectedSession.startTime)}</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-white/50 text-xs"><Calendar className="w-3.5 h-3.5" />Ended</div>
              <p className="text-white text-sm font-medium">
                {selectedSession.endTime && !selectedSession.isActive
                  ? formatDate(selectedSession.endTime)
                  : selectedSession.isActive
                  ? "In Progress"
                  : "N/A"}
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-white/50 text-xs"><Clock className="w-3.5 h-3.5" />Duration</div>
              <p className="text-white text-sm font-medium">{formatDuration(selectedSession.duration)}</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-white/50 text-xs"><Users className="w-3.5 h-3.5" />Status</div>
              {selectedSession.isActive ? (
                <span className="inline-flex px-2.5 py-0.5 bg-green-500/20 border border-green-500/50 text-green-300 rounded-full text-xs font-medium">Active</span>
              ) : (
                <span className="inline-flex px-2.5 py-0.5 bg-white/10 border border-white/20 text-white/60 rounded-full text-xs font-medium">Ended</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 mt-4 pt-4 border-t border-white/5">
            {selectedSession.createdByName && (
              <div className="space-y-1">
                <p className="text-white/50 text-xs">Created By</p>
                <p className="text-white text-sm font-medium">{selectedSession.createdByName}</p>
                {selectedSession.createdByEmail && <p className="text-white/40 text-xs truncate">{selectedSession.createdByEmail}</p>}
              </div>
            )}
            {orgName && (
              <div className="space-y-1">
                <p className="text-white/50 text-xs">Organization</p>
                <p className="text-white text-sm font-medium">{orgName}</p>
              </div>
            )}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-white/50 text-xs"><UserCheck className="w-3.5 h-3.5" />Checked In</div>
              <p className="text-white text-sm font-medium">
                <span className="text-green-400">{attendanceTotalMarked}</span>
                <span className="text-white/40 mx-1">/</span>
                {attendanceTotalMember}
                {attendanceTotalMember > 0 && (
                  <span className="text-accent ml-1.5 text-xs font-normal">({Math.round((attendanceTotalMarked / attendanceTotalMember) * 100)}%)</span>
                )}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-white/50 text-xs">Absent</p>
              <p className="text-red-400 text-sm font-medium">{Math.max(0, attendanceTotalMember - attendanceTotalMarked)}</p>
            </div>
          </div>
        </div>

        <div className="px-6 md:px-8 py-3 border-b border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="text-white font-semibold text-sm">Attendance List</h3>
            <span className="text-white/40 text-xs">{allSorted.length} record{allSorted.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="text"
              value={attendanceSearch}
              onChange={(e) => {
                setAttendanceSearch(e.target.value);
                setAttendancePage(1);
              }}
              placeholder="Search attendees..."
              className="flex-1 sm:w-44 px-3 py-1.5 rounded-lg bg-white/5 text-white text-xs placeholder:text-white/40 border border-white/10 focus:outline-none focus:border-accent transition-colors"
            />
            <button
              onClick={onExportSelected}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/15 hover:bg-accent/25 border border-accent/30 text-accent hover:text-accent text-xs font-medium transition-all cursor-pointer shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Export Excel
            </button>
          </div>
        </div>

        <div className="overflow-auto" style={{ maxHeight: "420px" }}>
          {loadingAttendance ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-5 h-5 border-2 border-accent/60 border-t-transparent rounded-full animate-spin" />
              <span className="text-white/40 ml-3 text-sm">Loading attendance...</span>
            </div>
          ) : allSorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-white/40">
              <Users className="w-8 h-8 mb-3 opacity-30" />
              <p className="text-sm">{attendanceRecords.length === 0 ? "No attendance records for this session" : "No matching attendees found"}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-secondary/98 backdrop-blur-sm z-10">
                <tr className="border-b border-white/10">
                  <th className="text-left pl-6 md:pl-8 pr-2 py-2.5 text-white/50 font-medium text-xs w-12">#</th>
                  <th onClick={() => toggleSort("name")} className="text-left px-3 py-2.5 text-white/50 font-medium text-xs cursor-pointer hover:text-white/70 transition-colors select-none">
                    <span className="flex items-center gap-1">Name <SortIcon field="name" sortField={sortField} sortDir={sortDir} /></span>
                  </th>
                  <th onClick={() => toggleSort("email")} className="text-left px-3 py-2.5 text-white/50 font-medium text-xs cursor-pointer hover:text-white/70 transition-colors select-none">
                    <span className="flex items-center gap-1">Email <SortIcon field="email" sortField={sortField} sortDir={sortDir} /></span>
                  </th>
                  <th className="text-left px-3 py-2.5 text-white/50 font-medium text-xs hidden lg:table-cell">User ID</th>
                  <th onClick={() => toggleSort("markedAt")} className="text-left px-3 pr-6 md:pr-8 py-2.5 text-white/50 font-medium text-xs cursor-pointer hover:text-white/70 transition-colors select-none">
                    <span className="flex items-center gap-1">Check-in Time <SortIcon field="markedAt" sortField={sortField} sortDir={sortDir} /></span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageSlice.map((record, idx) => (
                  <tr key={record.attendanceId} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${idx % 2 === 1 ? "bg-white/2" : ""}`}>
                    <td className="pl-6 md:pl-8 pr-2 py-2.5 text-white/40 font-mono text-xs">{(safePage - 1) * ATTENDANCE_PER_PAGE + idx + 1}</td>
                    <td className="px-3 py-2.5 text-white font-medium">{record.name || "Unknown"}</td>
                    <td className="px-3 py-2.5 text-white/60 text-xs">{record.email || "Unknown"}</td>
                    <td className="px-3 py-2.5 text-white/40 font-mono text-xs hidden lg:table-cell">{record.userId}</td>
                    <td className="px-3 pr-6 md:pr-8 py-2.5 text-white/60 text-xs whitespace-nowrap">
                      {new Date(record.markedAt).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "medium",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-6 md:px-8 py-3 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <p className="text-white/40 text-xs">
            {allSorted.length > 0
              ? `Showing ${(safePage - 1) * ATTENDANCE_PER_PAGE + 1}–${Math.min(safePage * ATTENDANCE_PER_PAGE, allSorted.length)} of ${allSorted.length}`
              : `${attendanceTotalMarked} checked in · ${Math.max(0, attendanceTotalMember - attendanceTotalMarked)} absent`}
            {" · "}{attendanceTotalMember} total members
          </p>
          <div className="flex items-center gap-2">
            {attendanceTotalPages > 1 && (
              <>
                <button
                  onClick={() => setAttendancePage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/15 text-white/60 text-xs disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition"
                >
                  ← Prev
                </button>
                <span className="text-white/50 text-xs px-1">{safePage} / {attendanceTotalPages}</span>
                <button
                  onClick={() => setAttendancePage((p) => Math.min(attendanceTotalPages, p + 1))}
                  disabled={safePage === attendanceTotalPages}
                  className="px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/15 text-white/60 text-xs disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition"
                >
                  Next →
                </button>
              </>
            )}
            <button
              onClick={closeDetail}
              className="ml-2 px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-white/70 hover:text-white text-xs font-medium cursor-pointer transition-all"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
