import { useEffect, useState, useCallback } from "react";
import {
  Calendar,
  Clock,
  TrendingUp,
  Search,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import { useAuthStore } from "../stores/auth.store";
import { memberAPI } from "../services/member.service";
import { Badge, Button, EmptyState } from "../components/ui";
import { SkeletonStats, SkeletonRow } from "../components/ui/Skeleton";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

interface AttendanceRecord {
  historyId: string;
  attendanceId: string;
  absenceId?: string | null;
  sessionId: string;
  markedAt: string;
  status: "attended" | "absent" | "excused";
  reason?: string | null;
  session: {
    startTime: string;
    endTime: string;
    duration: number;
    isActive: boolean;
    organizationId: string;
  } | null;
}

interface AttendanceStats {
  totalAttended: number;
  totalSessions: number;
  attendanceRate: number;
}

const PAGE_SIZE = 10;

export default function MyAttendance() {
  const user = useAuthStore((s) => s.user);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  const fetchHistory = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const data = await memberAPI.getMyHistory(p, PAGE_SIZE);
      setRecords(data.attendance as AttendanceRecord[]);
      setTotalPages(data.totalPages);
      setTotal(data.total);
      setPage(data.page);
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const data = await memberAPI.getMyStats();
      setStats(data as AttendanceStats);
    } catch {
      // Silent
    }
  }, []);

  useEffect(() => {
    fetchHistory(1);
    fetchStats();
  }, [fetchHistory, fetchStats, user?.currentOrganizationId]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-IN", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });

  // Client-side search filter
  const filtered = debouncedSearch.trim()
    ? records.filter((r) =>
        r.sessionId.toLowerCase().includes(debouncedSearch.toLowerCase())
      )
    : records;

  return (
    <div className="px-4 sm:px-8 md:px-16 pt-6 sm:pt-10 flex flex-col gap-6 sm:gap-8 pb-16 animate-fade-in-up">
        {/* ── Header ──────────────── */}
        <section className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl px-6 sm:px-8 py-6 shadow-lg shadow-black/10">
          <h1 className="text-2xl md:text-3xl font-bold text-white font-satoshi tracking-tight">My Attendance</h1>
          <p className="text-white/50 text-sm mt-1">
            Your attendance history for the active organization
          </p>
        </section>

        {/* ── Stats ──────────────── */}
        {!stats && loading ? (
          <SkeletonStats count={3} />
        ) : stats ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              icon={<CheckCircle2 className="w-5 h-5 text-green-400" />}
              label="Sessions Attended"
              value={stats.totalAttended}
            />
            <StatCard
              icon={<Calendar className="w-5 h-5 text-blue-400" />}
              label="Total Sessions"
              value={stats.totalSessions}
            />
            <StatCard
              icon={<TrendingUp className="w-5 h-5 text-accent" />}
              label="Attendance Rate"
              value={`${stats.attendanceRate}%`}
              highlight={
                stats.attendanceRate >= 75
                  ? "text-green-400"
                  : stats.attendanceRate >= 50
                  ? "text-amber-400"
                  : "text-red-400"
              }
            />
          </div>
        ) : null}

        {/* ── Search + Controls ──── */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by session ID..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-secondary/45 backdrop-blur-md border border-white/20 text-white placeholder:text-white/30 focus:outline-none focus:border-accent/60 text-sm"
            />
          </div>
          <p className="text-white/40 text-sm">
            {total} total record{total !== 1 ? "s" : ""}
          </p>
        </div>

        {/* ── Records List ─────── */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="📋"
            title="No Attendance Records"
            description={
              search
                ? "No records match your search. Try a different session ID."
                : "You haven't marked attendance for any sessions yet. Scan a QR code to get started."
            }
          />
        ) : (
          <div className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl shadow-lg shadow-black/10 overflow-hidden divide-y divide-white/10">
            {filtered.map((record) => (
              <div
                key={record.historyId}
                className="flex items-center gap-4 px-5 py-4 hover:bg-white/5 transition-colors"
              >
                {/* Check icon */}
                <div className={`w-10 h-10 rounded-full border flex items-center justify-center shrink-0 ${
                  record.status === "attended"
                    ? "bg-green-500/15 border-green-500/30"
                    : record.status === "excused"
                    ? "bg-yellow-500/15 border-yellow-500/30"
                    : "bg-red-500/15 border-red-500/30"
                }`}>
                  {record.status === "attended" ? (
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                  ) : (
                    <span className={`text-sm font-bold ${record.status === "excused" ? "text-yellow-400" : "text-red-400"}`}>
                      {record.status === "excused" ? "!" : "✕"}
                    </span>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-white font-medium text-sm font-geist-mono truncate">
                      {record.sessionId}
                    </p>
                    <Badge
                      variant={record.status === "attended" ? "success" : record.status === "excused" ? "warning" : "danger"}
                      size="sm"
                    >
                      {record.status === "attended" ? "Attended" : record.status === "excused" ? "Excused" : "Absent"}
                    </Badge>
                    {record.session?.isActive && (
                      <Badge variant="success" size="sm" dot pulse>
                        Live
                      </Badge>
                    )}
                  </div>
                  <p className="text-white/40 text-xs mt-0.5 flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(record.markedAt)}
                    </span>
                    {record.session && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {record.session.duration} min session
                      </span>
                    )}
                    {record.reason && record.status !== "attended" && (
                      <span className="text-white/35">Reason: {record.reason}</span>
                    )}
                  </p>
                </div>

                {/* Time */}
                <div className="text-right shrink-0">
                  <p className="text-white/70 text-sm font-medium">
                    {formatTime(record.markedAt)}
                  </p>
                  <p className="text-white/30 text-xs">marked</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Pagination ──────── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <p className="text-white/40 text-sm">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                onClick={() => fetchHistory(page - 1)}
                disabled={page <= 1}
                variant="secondary"
                size="sm"
                className="cursor-pointer flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>
              <Button
                onClick={() => fetchHistory(page + 1)}
                disabled={page >= totalPages}
                variant="secondary"
                size="sm"
                className="cursor-pointer flex items-center gap-1"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
    </div>
  );
}

/* ─── Sub-component ─────────────────── */

function StatCard({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  highlight?: string;
}) {
  return (
    <div className="backdrop-blur-2xl bg-secondary/45 border border-white/20 rounded-2xl p-6 shadow-lg shadow-black/10 hover:border-white/30 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-white/50 text-sm">{label}</span>
      </div>
      <p className={`text-3xl font-bold ${highlight || "text-white"} font-satoshi`}>
        {value}
      </p>
    </div>
  );
}
