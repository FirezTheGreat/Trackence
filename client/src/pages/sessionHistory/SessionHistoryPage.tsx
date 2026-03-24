import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "../../stores/toast.store";
import { sessionAPI } from "../../services/session.service";
import { useAuthStore } from "../../stores/auth.store";
import { connectAdminSocket, disconnectAdminSocket } from "../../services/socket.service";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { exportSessionReport } from "../../utils/excelExport";
import type { AttendanceRecord, SessionHistoryItem, SortDir, SortField } from "../../types/sessionHistory.types";
import SessionHistoryHeader from "./SessionHistoryHeader";
import SessionHistoryFilters from "./SessionHistoryFilters";
import SessionCard from "./SessionCard";
import SessionsPagination from "./SessionsPagination";
import SessionDetailModal from "./SessionDetailModal";

export default function SessionHistoryPage() {
  const hasLoadedOnceRef = useRef(false);
  const lastSilentRefreshAtRef = useRef(0);
  const silentRefreshTimerRef = useRef<number | null>(null);
  const silentRefreshQueuedRef = useRef(false);
  const user = useAuthStore((state) => state.user);
  const [orgName, setOrgName] = useState<string>("");

  const [sessions, setSessions] = useState<SessionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionFilter, setSessionFilter] = useState<"all" | "active">("all");
  const [sessionSearch, setSessionSearch] = useState("");
  const debouncedSessionSearch = useDebouncedValue(sessionSearch, 300);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalSessions, setTotalSessions] = useState(0);
  const SESSIONS_PER_PAGE = 3;

  const [selectedSession, setSelectedSession] = useState<SessionHistoryItem | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [attendanceTotalMember, setAttendanceTotalMember] = useState(0);
  const [attendanceTotalMarked, setAttendanceTotalMarked] = useState(0);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [attendancePage, setAttendancePage] = useState(1);
  const [sortField, setSortField] = useState<SortField>("markedAt");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [attendanceSearch, setAttendanceSearch] = useState("");

  const fetchAttendance = async (sessionId: string) => {
    try {
      setLoadingAttendance(true);
      const data = await sessionAPI.getLiveAttendance(sessionId);
      setAttendanceRecords(data.attendance || []);
      setAttendanceTotalMember(data.totalMember || 0);
      setAttendanceTotalMarked(data.totalMarked || 0);
    } catch {
      toast.error("Failed to load attendance details");
    } finally {
      setLoadingAttendance(false);
    }
  };

  const openSessionDetail = async (session: SessionHistoryItem) => {
    setSelectedSession(session);
    setAttendanceRecords([]);
    setAttendancePage(1);
    setAttendanceSearch("");
    setSortField("markedAt");
    setSortDir("asc");
    await fetchAttendance(session.sessionId);
  };

  const closeDetail = () => {
    setSelectedSession(null);
    setAttendanceRecords([]);
  };

  const getSortedFilteredAttendance = () => {
    let filtered = [...attendanceRecords];
    if (attendanceSearch.trim()) {
      const q = attendanceSearch.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          (r.name || "").toLowerCase().includes(q) ||
          (r.email || "").toLowerCase().includes(q) ||
          r.userId.toLowerCase().includes(q)
      );
    }
    filtered.sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") {
        cmp = (a.name || "").localeCompare(b.name || "");
      } else if (sortField === "email") {
        cmp = (a.email || "").localeCompare(b.email || "");
      } else {
        cmp = new Date(a.markedAt).getTime() - new Date(b.markedAt).getTime();
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return filtered;
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const exportToExcel = async (session: SessionHistoryItem) => {
    try {
      let records: AttendanceRecord[];
      let totalMember: number;
      let checkedIn: number;

      if (selectedSession?.sessionId === session.sessionId && attendanceRecords.length > 0) {
        records = getSortedFilteredAttendance();
        totalMember = attendanceTotalMember;
        checkedIn = attendanceTotalMarked;
      } else {
        const data = await sessionAPI.getLiveAttendance(session.sessionId);
        records = data.attendance || [];
        totalMember = data.totalMember || 0;
        checkedIn = data.totalMarked || 0;
      }

      await exportSessionReport({
        sessionId: session.sessionId,
        startTime: session.startTime,
        endTime: session.endTime || undefined,
        duration: session.duration,
        isActive: session.isActive,
        createdByName: session.createdByName,
        createdByEmail: session.createdByEmail,
        orgName,
        totalMember,
        checkedIn,
        attendanceRecords: records,
        formatDuration,
      });
      toast.success("Report exported successfully");
    } catch (err) {
      console.error("Export failed:", err);
      toast.error("Failed to export report");
    }
  };

  const fetchOrgName = useCallback(async () => {
    if (!user?.organizationIds?.length) return;
    const orgId = user.currentOrganizationId || user.organizationIds[0];
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/admin/organizations/${orgId}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setOrgName(data.organization?.name || "");
      }
    } catch {
      // Silent fail
    }
  }, [user?.currentOrganizationId, user?.organizationIds]);

  useEffect(() => {
    fetchOrgName();
  }, [fetchOrgName]);

  const loadSessions = useCallback(
    async (options?: { silent?: boolean }) => {
      try {
        const isSilent = options?.silent;
        if (!isSilent && !hasLoadedOnceRef.current) {
          setLoading(true);
        }
        setError(null);

        const response = await sessionAPI.getAllSessionsPaginated({
          page: currentPage,
          limit: SESSIONS_PER_PAGE,
          filter: sessionFilter,
          search: debouncedSessionSearch.trim() || undefined,
        });

        setSessions(response.sessions || []);
        setTotalPages(Math.max(1, response.pagination?.totalPages || 1));
        setTotalSessions(Math.max(0, response.pagination?.total || 0));

        if ((response.pagination?.total || 0) === 0 && currentPage !== 1) {
          setCurrentPage(1);
          return;
        }

        if (currentPage > (response.pagination?.totalPages || 1)) {
          setCurrentPage(Math.max(1, response.pagination?.totalPages || 1));
        }
      } catch (err: any) {
        setError(err.message || "Failed to load session history");
        toast.error("Failed to load session history");
      } finally {
        hasLoadedOnceRef.current = true;
        setLoading(false);
      }
    },
    [currentPage, sessionFilter, debouncedSessionSearch]
  );

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const requestSilentRefresh = useCallback(() => {
    if (silentRefreshQueuedRef.current) {
      return;
    }

    silentRefreshQueuedRef.current = true;

    const flush = () => {
      const now = Date.now();
      const elapsed = now - lastSilentRefreshAtRef.current;
      if (elapsed < 1000) {
        silentRefreshTimerRef.current = window.setTimeout(flush, 1000 - elapsed);
        return;
      }

      silentRefreshTimerRef.current = null;
      silentRefreshQueuedRef.current = false;
      lastSilentRefreshAtRef.current = Date.now();
      loadSessions({ silent: true });
    };

    silentRefreshTimerRef.current = window.setTimeout(flush, 500);
  }, [loadSessions]);

  useEffect(() => {
    const socketConnectTimeout = window.setTimeout(() => {
      connectAdminSocket({
        onSessionCreated: () => {
          console.log("[SessionHistory] Session created event received, refreshing...");
          requestSilentRefresh();
        },
        onSessionEnded: () => {
          console.log("[SessionHistory] Session ended event received, refreshing...");
          requestSilentRefresh();
        },
      });
    }, 0);

    const pollInterval = setInterval(() => {
      requestSilentRefresh();
    }, 10000);

    return () => {
      window.clearTimeout(socketConnectTimeout);
      if (silentRefreshTimerRef.current) {
        window.clearTimeout(silentRefreshTimerRef.current);
      }
      disconnectAdminSocket();
      clearInterval(pollInterval);
    };
  }, [requestSilentRefresh]);

  const getPaginationButtons = () => {
    const buttons: (number | string)[] = [];

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i += 1) {
        buttons.push(i);
      }
    } else {
      buttons.push(1);

      if (currentPage > 3) {
        buttons.push("...");
      }

      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i += 1) {
        if (!buttons.includes(i)) {
          buttons.push(i);
        }
      }

      if (currentPage < totalPages - 2) {
        buttons.push("...");
      }

      if (!buttons.includes(totalPages)) {
        buttons.push(totalPages);
      }
    }

    return buttons;
  };

  const handleCardExport = async (session: SessionHistoryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await exportToExcel(session);
    } catch {
      toast.error("Failed to export attendance");
    }
  };

  const allSorted = selectedSession ? getSortedFilteredAttendance() : [];

  if (loading) {
    return (
      <div className="px-4 sm:px-8 md:px-16 pt-6 sm:pt-10 flex flex-col gap-6 sm:gap-8 pb-16 animate-fade-in-up">
        <div className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl p-4 sm:p-5 shadow-lg shadow-black/10">
          <h1 className="text-2xl md:text-3xl font-bold text-white font-satoshi tracking-tight">Session History</h1>
        </div>
        <div className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl p-6 shadow-lg shadow-black/10">
          <p className="text-white/60 text-center py-8">Loading sessions...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="px-4 sm:px-8 md:px-16 pt-6 sm:pt-10 flex flex-col gap-6 sm:gap-8 pb-16 animate-fade-in-up">
      <SessionHistoryHeader orgName={orgName} onRefresh={() => loadSessions()} />

      {error && <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300">{error}</div>}

      <SessionHistoryFilters
          sessionSearch={sessionSearch}
          setSessionSearch={setSessionSearch}
          setCurrentPage={setCurrentPage}
          sessionFilter={sessionFilter}
          setSessionFilter={setSessionFilter}
        />

        {sessions.length === 0 ? (
          <div className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl p-6 shadow-lg shadow-black/10">
            <p className="text-white/60 text-center py-8">No sessions found for the current filters.</p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {sessions.map((session) => (
                <SessionCard
                  key={session.sessionId}
                  session={session}
                  onOpen={openSessionDetail}
                  onExport={handleCardExport}
                  formatDate={formatDate}
                  formatDuration={formatDuration}
                />
              ))}
            </div>

            <SessionsPagination
              totalPages={totalPages}
              totalSessions={totalSessions}
              currentPage={currentPage}
              sessionsPerPage={SESSIONS_PER_PAGE}
              getPaginationButtons={getPaginationButtons}
              setCurrentPage={setCurrentPage}
            />
          </>
        )}
      </div>

      {selectedSession && (
        <SessionDetailModal
          selectedSession={selectedSession}
          closeDetail={closeDetail}
          formatDate={formatDate}
          formatDuration={formatDuration}
          orgName={orgName}
          attendanceTotalMarked={attendanceTotalMarked}
          attendanceTotalMember={attendanceTotalMember}
          allSorted={allSorted}
          attendanceRecords={attendanceRecords}
          loadingAttendance={loadingAttendance}
          attendanceSearch={attendanceSearch}
          setAttendanceSearch={setAttendanceSearch}
          attendancePage={attendancePage}
          setAttendancePage={setAttendancePage}
          sortField={sortField}
          sortDir={sortDir}
          toggleSort={toggleSort}
          onExportSelected={async (e) => {
            e.stopPropagation();
            await exportToExcel(selectedSession);
          }}
        />
      )}
    </>
  );
}
