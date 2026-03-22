import { useState, useEffect } from "react";
import { absenceAPI } from "../../services/absence.service";
import { sessionAPI } from "../../services/session.service";
import { useAuthStore } from "../../stores/auth.store";
import { toast } from "../../stores/toast.store";
import { connectAdminSocket, disconnectAdminSocket } from "../../services/socket.service";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { exportAbsenceReport } from "../../utils/excelExport";
import type { AbsenceRecord, SessionData } from "../../types/absences.types";
import AbsenceReportHeader from "./AbsenceReportHeader";
import SessionSelector from "./SessionSelector";
import SummaryActions from "./SummaryActions";
import AbsenceTable from "./AbsenceTable";

const AbsenceReportPage = () => {
    const user = useAuthStore((state) => state.user);
    const role = user?.role;
    const isSuperAdmin = user?.platformRole === "superAdmin";

    const [orgName, setOrgName] = useState<string>("");
    const [sessions, setSessions] = useState<SessionData[]>([]);
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
    const [absenceData, setAbsenceData] = useState<any>(null);
    const [sessionSummary, setSessionSummary] = useState<any>(null);
    const [selectedAbsences, setSelectedAbsences] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [loadingAbsences, setLoadingAbsences] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [excuseReason, setExcuseReason] = useState<string>("");
    const [filter, setFilter] = useState<"all" | "pending" | "excused">("all");
    const [sessionFilter, setSessionFilter] = useState<"all" | "active">("all");
    const [sessionSearch, setSessionSearch] = useState("");
    const debouncedSessionSearch = useDebouncedValue(sessionSearch, 300);
    const [currentPage, setCurrentPage] = useState(1);
    const SESSIONS_PER_PAGE = 4;

    if (role !== "admin" && !isSuperAdmin) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-white text-xl">Access Denied. Admin only.</p>
            </div>
        );
    }

    useEffect(() => {
        loadSessions();
        fetchOrgName();
    }, [user?.currentOrganizationId]);

    const handleRetryCurrent = async () => {
        if (selectedSessionId) {
            await loadAbsenceDetailsForSession(selectedSessionId);
            return;
        }
        await loadSessions();
    };

    const fetchOrgName = async () => {
        if (!user?.organizationIds?.length) return;
        const orgId = user.currentOrganizationId || user.organizationIds[0];
        try {
            const res = await fetch(
                `${import.meta.env.VITE_BACKEND_URL}/api/admin/organizations/${orgId}`,
                { credentials: "include" }
            );
            if (res.ok) {
                const data = await res.json();
                setOrgName(data.organization?.name || "");
            }
        } catch {
            // Silent fail
        }
    };

    useEffect(() => {
        const socketConnectTimeout = window.setTimeout(() => {
            connectAdminSocket({
                onSessionCreated: () => {
                    loadSessions({ silent: true });
                },
                onSessionEnded: () => {
                    loadSessions({ silent: true });
                },
            });
        }, 0);

        return () => {
            window.clearTimeout(socketConnectTimeout);
            disconnectAdminSocket();
        };
    }, []);

    const loadSessions = async (options?: { silent?: boolean }) => {
        const isSilent = options?.silent;
        if (!isSilent) setLoading(true);
        setError(null);

        try {
            const result = await sessionAPI.getAllSessions();
            const sorted = (result || []).sort((a: any, b: any) => {
                const dateA = new Date(a.startedAt || a.createdAt || 0).getTime();
                const dateB = new Date(b.startedAt || b.createdAt || 0).getTime();
                return dateB - dateA;
            });
            setSessions(sorted);
        } catch (err: any) {
            setError(err.response?.data?.message || "Failed to load sessions");
        } finally {
            setLoading(false);
        }
    };

    const loadAbsenceDetailsForSession = async (sessionId: string) => {
        setLoadingAbsences(true);
        setError(null);
        setAbsenceData(null);
        setSessionSummary(null);

        try {
            await absenceAPI.detectAbsences(sessionId);
            const absences = await absenceAPI.getAllSessionAbsences(sessionId);
            setAbsenceData(absences);
            const summary = await absenceAPI.generateSessionSummary(sessionId);
            setSessionSummary(summary);
            setSelectedAbsences(new Set());
        } catch (err: any) {
            setError(err?.message || "Failed to load absences");
        } finally {
            setLoadingAbsences(false);
        }
    };

    const resetSelection = () => {
        setSelectedSessionId(null);
        setAbsenceData(null);
        setSessionSummary(null);
        setSelectedAbsences(new Set());
    };

    const handleSessionSelect = async (sessionId: string) => {
        if (selectedSessionId === sessionId) {
            resetSelection();
            return;
        }

        setSelectedSessionId(sessionId);
        await loadAbsenceDetailsForSession(sessionId);
    };

    const toggleAbsenceSelection = (absenceId: string) => {
        const newSet = new Set(selectedAbsences);
        if (newSet.has(absenceId)) {
            newSet.delete(absenceId);
        } else {
            newSet.add(absenceId);
        }
        setSelectedAbsences(newSet);
    };

    const renderErrorBanner = () => {
        if (!error) return null;

        return (
            <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 flex items-center justify-between gap-4">
                <span>{error}</span>
                <button
                    onClick={handleRetryCurrent}
                    className="px-3 py-1.5 rounded-lg bg-secondary/70 border border-white/20 text-white text-xs hover:bg-secondary/90 transition cursor-pointer"
                >
                    Retry
                </button>
            </div>
        );
    };

    const handleBulkExcuse = async () => {
        if (selectedAbsences.size === 0) {
            toast.error("Please select at least one absence");
            return;
        }

        const pendingAbsenceIds = Array.from(selectedAbsences).filter((absenceId) => {
            const record = absenceData?.records?.find((a: AbsenceRecord) => a._id === absenceId);
            return record && !record.isExcused;
        });

        if (pendingAbsenceIds.length === 0) {
            toast.error("No pending absences selected.");
            return;
        }

        const normalizedReason = excuseReason.trim();
        if (!normalizedReason) {
            toast.error("Please enter a reason for excusing.");
            return;
        }

        setLoading(true);

        try {
            await absenceAPI.bulkMarkAsExcused(pendingAbsenceIds, normalizedReason);
            if (selectedSessionId) {
                await loadAbsenceDetailsForSession(selectedSessionId);
            }
            setExcuseReason("");
            toast.success(`✅ ${pendingAbsenceIds.length} absences marked as excused`);
            setSelectedAbsences(new Set());
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Failed to bulk mark absences");
        } finally {
            setLoading(false);
        }
    };

    const handleBulkMarkAttended = async () => {
        if (selectedAbsences.size === 0) {
            toast.error("Please select at least one absence");
            return;
        }

        const pendingAbsenceIds = Array.from(selectedAbsences).filter((absenceId) => {
            const record = absenceData?.records?.find((a: AbsenceRecord) => a._id === absenceId);
            return record && !record.isExcused && !record.markedManually;
        });

        if (pendingAbsenceIds.length === 0) {
            toast.error("No valid pending absences selected.");
            return;
        }

        setLoading(true);

        try {
            let successCount = 0;
            // Execute sequentially to prevent race conditions or rate limits, 
            // alternatively could be Promise.all but might be too many requests
            for (const absenceId of pendingAbsenceIds) {
                const result = await absenceAPI.markAttendanceManually(absenceId);
                if (result?.attendanceCreated) {
                    successCount++;
                }
            }

            if (selectedSessionId && successCount > 0) {
                setSessions((prev) =>
                    prev.map((session) => {
                        if (session.sessionId !== selectedSessionId) return session;

                        const currentCheckedIn = Number(session.checkedInCount ?? session.attendanceCount ?? 0);
                        const totalFaculty = Math.max(Number(session.totalFaculty ?? 0), currentCheckedIn);
                        const nextCheckedIn = totalFaculty > 0
                            ? Math.min(totalFaculty, currentCheckedIn + successCount)
                            : currentCheckedIn + successCount;

                        return {
                            ...session,
                            checkedInCount: nextCheckedIn,
                            attendanceCount: nextCheckedIn,
                        };
                    })
                );
            }

            if (selectedSessionId) {
                await Promise.all([
                    loadAbsenceDetailsForSession(selectedSessionId),
                    loadSessions({ silent: true }),
                ]);
            }
            
            toast.success(`✅ ${successCount} absences marked as attended`);
            setSelectedAbsences(new Set());
        } catch (err: any) {
            toast.error(err.response?.data?.message || err?.message || "Failed to bulk mark as attended");
        } finally {
            setLoading(false);
        }
    };

    const getFilteredAbsences = () => {
        if (!absenceData?.records) return [];
        if (filter === "pending") return absenceData.records.filter((a: AbsenceRecord) => !a.isExcused);
        if (filter === "excused") return absenceData.records.filter((a: AbsenceRecord) => a.isExcused);
        return absenceData.records;
    };

    const getFilteredSessions = () => {
        const normalizedSearch = debouncedSessionSearch.trim().toLowerCase();
        const base = sessionFilter === "all" ? sessions : sessions.filter((s) => s.isActive);
        if (!normalizedSearch) return base;
        return base.filter((session) => session.sessionId?.toLowerCase().includes(normalizedSearch));
    };

    const getPaginatedSessions = () => {
        const filtered = getFilteredSessions();
        const startIndex = (currentPage - 1) * SESSIONS_PER_PAGE;
        return filtered.slice(startIndex, startIndex + SESSIONS_PER_PAGE);
    };

    const getTotalPages = () => Math.ceil(getFilteredSessions().length / SESSIONS_PER_PAGE);

    const getPaginationButtons = () => {
        const totalPages = getTotalPages();
        const buttons: (number | string)[] = [];

        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) buttons.push(i);
        } else {
            buttons.push(1);
            if (currentPage > 3) buttons.push("...");

            const start = Math.max(2, currentPage - 1);
            const end = Math.min(totalPages - 1, currentPage + 1);
            for (let i = start; i <= end; i++) {
                if (!buttons.includes(i)) buttons.push(i);
            }

            if (currentPage < totalPages - 2) buttons.push("...");
            if (!buttons.includes(totalPages)) buttons.push(totalPages);
        }

        return buttons;
    };

    useEffect(() => {
        const normalizedSearch = debouncedSessionSearch.trim().toLowerCase();
        const base = sessionFilter === "all" ? sessions : sessions.filter((session) => session.isActive);
        const filtered = normalizedSearch
            ? base.filter((session) => session.sessionId?.toLowerCase().includes(normalizedSearch))
            : base;
        const totalPages = Math.max(1, Math.ceil(filtered.length / SESSIONS_PER_PAGE));

        if (filtered.length === 0 && currentPage !== 1) {
            setCurrentPage(1);
            return;
        }

        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [sessions, sessionFilter, debouncedSessionSearch, currentPage]);

    const getSessionStatus = (session: SessionData) => {
        if (session.isActive) {
            return {
                label: "Active",
                color: "bg-green-500/20 text-green-300",
                icon: "🔴",
            };
        }

        const endTime = new Date(session.endTime).getTime();
        const now = Date.now();
        const hoursAgo = Math.floor((now - endTime) / (1000 * 60 * 60));
        const minutesAgo = Math.floor((now - endTime) / (1000 * 60));

        let timeLabel = "";
        if (hoursAgo > 0) {
            timeLabel = `${hoursAgo}h ago`;
        } else if (minutesAgo > 0) {
            timeLabel = `${minutesAgo}m ago`;
        } else {
            timeLabel = "Just ended";
        }

        return {
            label: `Ended (${timeLabel})`,
            color: "bg-gray-500/20 text-gray-300",
            icon: "⏹️",
        };
    };

    const formatDuration = (minutes: number) => {
        if (minutes < 60) return `${minutes}m`;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours}h ${mins}m`;
    };

    const exportToCSV = async () => {
        if (!absenceData?.records || absenceData.records.length === 0) {
            toast.info("No data to export");
            return;
        }

        const selectedSession = sessions.find((s) => s.sessionId === selectedSessionId);

        try {
            await exportAbsenceReport({
                sessionId: selectedSessionId || "N/A",
                orgName: orgName || "N/A",
                sessionStartTime: selectedSession?.startedAt || selectedSession?.createdAt,
                sessionEndTime: selectedSession?.endTime,
                duration: typeof selectedSession?.duration === "number" ? selectedSession.duration : undefined,
                formatDuration,
                createdByName: selectedSession?.createdByName,
                createdByEmail: selectedSession?.createdByEmail,
                summary: sessionSummary
                    ? {
                        total: sessionSummary.total,
                        attended: sessionSummary.attended,
                        attendancePercentage: sessionSummary.attendancePercentage,
                        absent: sessionSummary.absent,
                        absencePercentage: sessionSummary.absencePercentage,
                        excused: sessionSummary.excused,
                    }
                    : null,
                records: absenceData.records.map((record: AbsenceRecord) => ({
                    facultyName: record.facultyName,
                    facultyEmail: record.facultyEmail,
                    facultyId: record.facultyId,
                    reason: record.reason,
                    isExcused: record.isExcused,
                    createdAt: record.createdAt,
                })),
            });
            toast.success("Report exported successfully");
        } catch (err) {
            console.error("Export failed:", err);
            toast.error("Failed to export report");
        }
    };

    const filteredSessions = getFilteredSessions();
    const paginatedSessions = getPaginatedSessions();
    const totalPages = Math.max(1, getTotalPages());
    const paginationButtons = getPaginationButtons();
    const filteredAbsences = getFilteredAbsences();
    const selectedSession = sessions.find((session) => session.sessionId === selectedSessionId) || null;
    const pendingAbsences = filteredAbsences.filter((absence: AbsenceRecord) => !absence.isExcused && !absence.markedManually);
    const selectedPendingCount = Array.from(selectedAbsences).filter((absenceId) =>
        pendingAbsences.some((absence: AbsenceRecord) => absence._id === absenceId)
    ).length;

    const handleSearchChange = (value: string) => {
        setSessionSearch(value);
        setCurrentPage(1);
        resetSelection();
    };

    const handleSessionFilterChange = (value: "all" | "active") => {
        setSessionFilter(value);
        setCurrentPage(1);
        resetSelection();
    };

    const handlePageChange = (page: number) => {
        setCurrentPage(page);
        resetSelection();
    };

    const handleAbsenceFilterChange = (value: "all" | "pending" | "excused") => {
        setFilter(value);
        setSelectedAbsences(new Set());
    };

    const handleSelectAllPending = (checked: boolean) => {
        if (checked) {
            setSelectedAbsences(new Set(pendingAbsences.map((absence: AbsenceRecord) => absence._id)));
        } else {
            setSelectedAbsences(new Set());
        }
    };

    return (
        <div className="px-4 sm:px-8 md:px-16 pt-6 sm:pt-10 flex flex-col gap-6 sm:gap-8 pb-16 animate-fade-in-up">
            <AbsenceReportHeader orgName={orgName} />
            {renderErrorBanner()}

            <SessionSelector
                loading={loading}
                sessions={sessions}
                selectedSessionId={selectedSessionId}
                sessionSearch={sessionSearch}
                sessionFilter={sessionFilter}
                filteredSessions={filteredSessions}
                paginatedSessions={paginatedSessions}
                currentPage={currentPage}
                sessionsPerPage={SESSIONS_PER_PAGE}
                paginationButtons={paginationButtons}
                totalPages={totalPages}
                onSearchChange={handleSearchChange}
                onSessionFilterChange={handleSessionFilterChange}
                onSessionSelect={handleSessionSelect}
                onPageChange={handlePageChange}
                getSessionStatus={getSessionStatus}
            />

            <SummaryActions
                selectedSessionId={selectedSessionId}
                sessionSummary={sessionSummary}
                selectedSession={selectedSession}
                loadingAbsences={loadingAbsences}
                loading={loading}
                hasAbsenceData={!!absenceData}
                excuseReason={excuseReason}
                selectedPendingCount={selectedPendingCount}
                onExcuseReasonChange={setExcuseReason}
                onExportReport={exportToCSV}
                onRefresh={() => selectedSessionId && handleSessionSelect(selectedSessionId)}
                onBulkExcuse={handleBulkExcuse}
                onBulkMarkAttended={handleBulkMarkAttended}
            />

            <AbsenceTable
                absenceData={absenceData}
                loadingAbsences={loadingAbsences}
                filter={filter}
                filteredAbsences={filteredAbsences}
                pendingAbsences={pendingAbsences}
                selectedAbsences={selectedAbsences}
                onFilterChange={handleAbsenceFilterChange}
                onSelectAllPending={handleSelectAllPending}
                onToggleAbsence={toggleAbsenceSelection}
            />
        </div>
    );
};

export default AbsenceReportPage;
