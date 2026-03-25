import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { sessionAPI } from "../../services/session.service";
import {
  connectSessionSocket,
  disconnectSessionSocket,
} from "../../services/socket.service";
import { useAuthStore } from "../../stores/auth.store";
import { useModalStore } from "../../stores/modal.store";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import type { LiveAttendanceData, QrEntry, SessionItem } from "../../types/adminSessions.types";
import { authAPI } from "../../services/auth.service";
import EditSessionModal from "./EditSessionModal";
import SessionManagementHeader from "./SessionManagementHeader";
import CreateSessionCard from "./CreateSessionCard";
import SessionsListPanel from "./SessionsListPanel";
import LiveAttendancePanel from "./LiveAttendancePanel";
import NotificationHistoryPanel from "./NotificationHistoryPanel";
import { perfMarkEnd, perfMarkStart } from "../../utils/perf";

const AdminSessionManagementPage = () => {
  const user = useAuthStore((state) => state.user);
  const role = user?.role;
  const hasPlatformOwnerAccess = user?.platformRole === "platform_owner";

  const [orgName, setOrgName] = useState<string>("");
  const [activeSessions, setActiveSessions] = useState<SessionItem[]>([]);
  const [sessionTimeLeft, setSessionTimeLeft] = useState<Record<string, number>>({});
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [orgSavedRecipients, setOrgSavedRecipients] = useState<string[]>([]);
  const [liveAttendance, setLiveAttendance] = useState<LiveAttendanceData | null>(null);
  const [qrData, setQrData] = useState<Record<string, QrEntry>>({});
  const [qrTimeLeft, setQrTimeLeft] = useState<Record<string, number>>({});
  const [createLoading, setCreateLoading] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [endingSessionId, setEndingSessionId] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState<SessionItem | null>(null);
  const [editDuration, setEditDuration] = useState<number | "">(0);
  const [editRefreshInterval, setEditRefreshInterval] = useState<number | "">(10);
  const [editLoading, setEditLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sessionFilter, setSessionFilter] = useState<"all" | "active" | "ended">("all");
  const [sessionSearch, setSessionSearch] = useState("");
  const debouncedSessionSearch = useDebouncedValue(sessionSearch, 300);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalSessions, setTotalSessions] = useState(0);
  const SESSIONS_PER_PAGE = 4;

  const [duration, setDuration] = useState<number | "">(30);
  const [refreshInterval, setRefreshInterval] = useState<number | "">(10);
  const [selectedSessionRefreshInterval, setSelectedSessionRefreshInterval] = useState<number>(10);
  const [notificationRecipients, setNotificationRecipients] = useState("");
  const [useDefaultRecipients, setUseDefaultRecipients] = useState(true);
  const [useOrgDefaultRecipients, setUseOrgDefaultRecipients] = useState(true);
  const [includeCreator, setIncludeCreator] = useState(true);
  const [sendSessionEndEmail, setSendSessionEndEmail] = useState(true);
  const [sendAbsenceEmail, setSendAbsenceEmail] = useState(true);
  const [attachReport, setAttachReport] = useState(true);
  const [saveAsDefaults, setSaveAsDefaults] = useState(false);
  const [saveAsOrgDefaults, setSaveAsOrgDefaults] = useState(false);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [notificationHistory, setNotificationHistory] = useState<any[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyTotalItems, setHistoryTotalItems] = useState(0);
  const HISTORY_PER_PAGE = 3;
  const personalSavedRecipients = user?.notificationDefaults?.recipients || [];
  const [orgDefaultSettings, setOrgDefaultSettings] = useState({
    sendSessionEndEmail: true,
    sendAbsenceEmail: true,
    attachReport: true,
  });
  const lastSilentRefreshAtRef = useRef(0);
  const silentRefreshTimerRef = useRef<number | null>(null);
  const silentRefreshQueuedRef = useRef(false);
  const previousLiveSessionIdsRef = useRef<Set<string>>(new Set());
  const qrDataRef = useRef<Record<string, QrEntry>>({});
  const selectedSessionIdRef = useRef<string | null>(null);
  const liveAttendanceTimerRef = useRef<number | null>(null);
  const liveAttendanceQueuedRef = useRef(false);
  const liveAttendanceInFlightRef = useRef(false);
  const lastLiveAttendanceFetchAtRef = useRef(0);
  const liveAttendanceSignatureRef = useRef("");

  const buildLiveAttendanceSignature = (data: LiveAttendanceData | null): string => {
    if (!data) return "none";

    const attendance = data.attendance || [];
    const recent = data.recentCheckIns || [];
    const lastAttendance = attendance[attendance.length - 1];
    const recentFirst = recent[0];

    return [
      data.totalMarked || 0,
      data.totalMember || 0,
      attendance.length,
      recent.length,
      lastAttendance?.attendanceId || "",
      lastAttendance?.markedAt || "",
      recentFirst?.markedAt || "",
    ].join("|");
  };

  const applyLiveAttendance = useCallback((next: LiveAttendanceData | null) => {
    const nextSignature = buildLiveAttendanceSignature(next);
    if (nextSignature === liveAttendanceSignatureRef.current) {
      return;
    }

    liveAttendanceSignatureRef.current = nextSignature;
    setLiveAttendance(next);

    const selectedId = selectedSessionIdRef.current;
    if (selectedId) {
      perfMarkEnd(`admin.attendance.eventToPanel.${selectedId}`, {
        thresholdMs: 120,
        payload: {
          attendanceItems: next?.attendance?.length || 0,
          totalMarked: next?.totalMarked || 0,
        },
      });
    }
  }, []);

  const flushLiveAttendanceRefresh = useCallback(async () => {
    const sessionId = selectedSessionIdRef.current;
    if (!sessionId) {
      liveAttendanceQueuedRef.current = false;
      return;
    }

    const elapsed = Date.now() - lastLiveAttendanceFetchAtRef.current;
    if (elapsed < 350) {
      if (liveAttendanceTimerRef.current) {
        window.clearTimeout(liveAttendanceTimerRef.current);
      }

      liveAttendanceTimerRef.current = window.setTimeout(() => {
        liveAttendanceTimerRef.current = null;
        void flushLiveAttendanceRefresh();
      }, 350 - elapsed);
      return;
    }

    if (liveAttendanceInFlightRef.current) {
      liveAttendanceQueuedRef.current = true;
      return;
    }

    liveAttendanceInFlightRef.current = true;
    liveAttendanceQueuedRef.current = false;
    lastLiveAttendanceFetchAtRef.current = Date.now();
    perfMarkStart("admin.liveAttendance.fetch");

    try {
      const attendance = await sessionAPI.getLiveAttendance(sessionId);
      if (selectedSessionIdRef.current === sessionId) {
        applyLiveAttendance(attendance);
      }
    } catch {
      if (selectedSessionIdRef.current === sessionId) {
        applyLiveAttendance(null);
      }
    } finally {
      perfMarkEnd("admin.liveAttendance.fetch", {
        thresholdMs: 120,
        payload: { sessionId },
      });
      liveAttendanceInFlightRef.current = false;
      if (liveAttendanceQueuedRef.current) {
        void flushLiveAttendanceRefresh();
      }
    }
  }, [applyLiveAttendance]);

  const requestLiveAttendanceRefresh = useCallback((options?: { immediate?: boolean }) => {
    liveAttendanceQueuedRef.current = true;

    if (options?.immediate) {
      if (liveAttendanceTimerRef.current) {
        window.clearTimeout(liveAttendanceTimerRef.current);
        liveAttendanceTimerRef.current = null;
      }
      void flushLiveAttendanceRefresh();
      return;
    }

    if (liveAttendanceTimerRef.current) {
      return;
    }

    liveAttendanceTimerRef.current = window.setTimeout(() => {
      liveAttendanceTimerRef.current = null;
      void flushLiveAttendanceRefresh();
    }, 250);
  }, [flushLiveAttendanceRefresh]);

  const getPaginationButtons = () => {
    const buttons: (number | string)[] = [];

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        buttons.push(i);
      }
    } else {
      buttons.push(1);

      if (currentPage > 3) {
        buttons.push("...");
      }

      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) {
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

  const loadQRForSession = useCallback(async (sessionId: string) => {
    try {
      const data = await sessionAPI.getSessionQR(sessionId);
      setQrData(prev => ({
        ...prev,
        [sessionId]: { image: data.qrImage, expiresAt: data.expiresAt }
      }));
    } catch (err: any) {
      if (err.response?.status === 503) {
        console.log(`QR not ready for session ${sessionId}, will retry on next rotation`);
      } else {
        console.error(`Failed to load QR for session ${sessionId}:`, err);
      }
    }
  }, []);

  const loadActiveSessions = useCallback(async (options?: { silent?: boolean }) => {
    const isSilent = options?.silent;
    if (!isSilent) {
      setRefreshLoading(true);
    }
    try {
      const response = await sessionAPI.getAllSessionsPaginated({
        page: currentPage,
        limit: SESSIONS_PER_PAGE,
        filter: sessionFilter,
        search: debouncedSessionSearch.trim() || undefined,
      });
      setActiveSessions(response.sessions || []);
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
      setError(err.response?.data?.message || "Failed to load sessions");
    } finally {
      setRefreshLoading(false);
    }
  }, [currentPage, sessionFilter, debouncedSessionSearch]);

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
      loadActiveSessions({ silent: true });
    };

    silentRefreshTimerRef.current = window.setTimeout(flush, 500);
  }, [loadActiveSessions]);

  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId;
  }, [selectedSessionId]);

  useEffect(() => {
    qrDataRef.current = qrData;
  }, [qrData]);

  const liveSessions = useMemo(
    () => activeSessions.filter((session) => session.isActive),
    [activeSessions]
  );

  useEffect(() => {
    loadActiveSessions();
    fetchOrgName();
    loadNotificationHistory(1);
  }, [loadActiveSessions, user?.currentOrganizationId]);

  useEffect(() => {
    const defaults = user?.notificationDefaults;
    if (!defaults) return;

    setUseDefaultRecipients(true);
    setUseOrgDefaultRecipients(true);
    setIncludeCreator(defaults.includeSelf ?? true);
    setSendSessionEndEmail(defaults.sendSessionEndEmail ?? true);
    setSendAbsenceEmail(defaults.sendAbsenceEmail ?? true);
    setAttachReport(defaults.attachReport ?? true);
  }, [user?.notificationDefaults]);

  useEffect(() => {
    if (!sendSessionEndEmail) {
      if (sendAbsenceEmail) setSendAbsenceEmail(false);
      if (attachReport) setAttachReport(false);
    }
  }, [sendSessionEndEmail, sendAbsenceEmail, attachReport]);

  const loadNotificationHistory = async (page = historyPage) => {
    setHistoryLoading(true);
    try {
      const response = await sessionAPI.getNotificationHistory({ page, limit: HISTORY_PER_PAGE });
      const nextTotalPages = Math.max(1, response.pagination?.totalPages || 1);
      const nextPage = Math.max(1, response.pagination?.page || page);

      setNotificationHistory(response.items || []);
      setHistoryTotalPages(nextTotalPages);
      setHistoryTotalItems(Math.max(0, response.pagination?.total || 0));

      if (page > nextTotalPages) {
        setHistoryPage(nextTotalPages);
        if (nextTotalPages !== page) {
          await loadNotificationHistory(nextTotalPages);
          return;
        }
      } else {
        setHistoryPage(nextPage);
      }
    } catch {
      // Silent in UI; create flow already surfaces errors where needed
    } finally {
      setHistoryLoading(false);
    }
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
        setOrgSavedRecipients(data.organization?.notificationDefaults?.recipients || []);
        setOrgDefaultSettings({
          sendSessionEndEmail: data.organization?.notificationDefaults?.sendSessionEndEmail ?? true,
          sendAbsenceEmail: data.organization?.notificationDefaults?.sendAbsenceEmail ?? true,
          attachReport: data.organization?.notificationDefaults?.attachReport ?? true,
        });
      } else {
        setOrgSavedRecipients([]);
      }
    } catch {
      setOrgSavedRecipients([]);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [sessionFilter, sessionSearch]);

  useEffect(() => {
    if (liveSessions.length === 0) {
      setQrData((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }

    setQrData(prevQrData => {
      let hasChanges = false;
      const newSessions = liveSessions.filter(session => !prevQrData[session.sessionId]);
      newSessions.forEach(session => {
        loadQRForSession(session.sessionId);
      });

      const activeSessionIds = new Set(liveSessions.map(s => s.sessionId));
      const updated = { ...prevQrData };
      Object.keys(prevQrData).forEach(sessionId => {
        if (!activeSessionIds.has(sessionId)) {
          hasChanges = true;
          delete updated[sessionId];
        }
      });

      return hasChanges ? updated : prevQrData;
    });

    const retryInterval = setInterval(() => {
      const currentQrData = qrDataRef.current;
      liveSessions.forEach((session) => {
        if (!currentQrData[session.sessionId]) {
          loadQRForSession(session.sessionId);
        }
      });
    }, 5000);

    return () => clearInterval(retryInterval);
  }, [liveSessions, loadQRForSession]);

  useEffect(() => {
    if (liveSessions.length === 0) {
      setSessionTimeLeft({});
      setQrTimeLeft({});
      return;
    }

    const updateTimers = () => {
      const now = Date.now();

      setSessionTimeLeft((prev) => {
        const newTimeLeft: Record<string, number> = {};
        let hasExpired = false;

        liveSessions.forEach((session) => {
          if (session.isActive && session.endTime) {
            const endTimeMs = new Date(session.endTime).getTime();
            const remaining = Math.max(0, Math.ceil((endTimeMs - now) / 1000));
            newTimeLeft[session.sessionId] = remaining;

            if (remaining === 0 && (prev[session.sessionId] ?? 0) > 0) {
              hasExpired = true;
            }
          }
        });

        if (hasExpired) {
          setTimeout(() => requestSilentRefresh(), 1000);
        }

        return newTimeLeft;
      });

      const newQrTimeLeft: Record<string, number> = {};
      Object.entries(qrData).forEach(([sessionId, data]) => {
        const remaining = Math.max(0, Math.ceil((data.expiresAt - now) / 1000) - 1);
        newQrTimeLeft[sessionId] = remaining;
      });
      setQrTimeLeft(newQrTimeLeft);
    };

    updateTimers();
    const interval = setInterval(updateTimers, 1000);

    return () => clearInterval(interval);
  }, [liveSessions, qrData, requestSilentRefresh]);

  useEffect(() => {
    if (liveSessions.length === 0) {
      previousLiveSessionIdsRef.current.forEach((sessionId) => disconnectSessionSocket(sessionId));
      previousLiveSessionIdsRef.current = new Set();
      disconnectSessionSocket();
      return;
    }

    const nextLiveIds = new Set(liveSessions.map((session) => session.sessionId));
    previousLiveSessionIdsRef.current.forEach((sessionId) => {
      if (!nextLiveIds.has(sessionId)) {
        disconnectSessionSocket(sessionId);
      }
    });
    previousLiveSessionIdsRef.current = nextLiveIds;

    liveSessions.forEach((session) => {
      connectSessionSocket(session.sessionId, {
        onAttendanceUpdate: () => {
          if (session.sessionId === selectedSessionIdRef.current) {
            perfMarkStart(`admin.attendance.eventToPanel.${session.sessionId}`);
            requestLiveAttendanceRefresh();
          }
          requestSilentRefresh();
        },
        onSessionEnded: () => {
          requestSilentRefresh();
          if (session.sessionId === selectedSessionIdRef.current) {
            requestLiveAttendanceRefresh({ immediate: true });
          }
        },
        onQRRotated: (data) => {
          setQrData(prev => ({
            ...prev,
            [data.sessionId]: {
              image: data.qrImage,
              expiresAt: data.expiresAt,
            },
          }));
        },
      });
    });
  }, [liveSessions, requestLiveAttendanceRefresh, requestSilentRefresh]);

  useEffect(() => {
    return () => {
      if (silentRefreshTimerRef.current) {
        window.clearTimeout(silentRefreshTimerRef.current);
      }
      if (liveAttendanceTimerRef.current) {
        window.clearTimeout(liveAttendanceTimerRef.current);
      }
      disconnectSessionSocket();
    };
  }, []);

  useEffect(() => {
    if (selectedSessionId) {
      const selectedSession = activeSessions.find((s) => s.sessionId === selectedSessionId);
      if (selectedSession) {
        setSelectedSessionRefreshInterval(selectedSession.refreshInterval || 10);
      }
    }
  }, [selectedSessionId, activeSessions]);

  if (role !== "admin" && !hasPlatformOwnerAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white text-xl">Access Denied. Admin only.</p>
      </div>
    );
  }

  const clearSelection = () => {
    selectedSessionIdRef.current = null;
    setSelectedSessionId(null);
    applyLiveAttendance(null);
  };

  const removeRecipientFromList = (list: string[], email: string) => {
    const lower = email.trim().toLowerCase();
    return list.filter((item) => item.trim().toLowerCase() !== lower);
  };

  const handleRemovePersonalSavedRecipient = async (email: string) => {
    if (!user) return;

    const nextRecipients = removeRecipientFromList(personalSavedRecipients, email);
    const defaults = user.notificationDefaults;

    setSavingDefaults(true);
    setError(null);
    setSuccess(null);
    try {
      await authAPI.updateMyNotificationDefaults({
        recipients: nextRecipients,
        includeSelf: defaults?.includeSelf ?? includeCreator,
        sendSessionEndEmail: defaults?.sendSessionEndEmail ?? sendSessionEndEmail,
        sendAbsenceEmail: defaults?.sendAbsenceEmail ?? sendAbsenceEmail,
        attachReport: defaults?.attachReport ?? attachReport,
      });

      const me = await authAPI.getMe();
      useAuthStore.getState().setUser(me);
      setSuccess(`Removed ${email} from your saved recipients.`);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Failed to update personal saved recipients");
    } finally {
      setSavingDefaults(false);
    }
  };

  const handleRemoveOrgSavedRecipient = async (email: string) => {
    if (!user?.organizationIds?.length) return;
    const orgId = user.currentOrganizationId || user.organizationIds[0];
    if (!orgId) return;

    const nextRecipients = removeRecipientFromList(orgSavedRecipients, email);

    setSavingDefaults(true);
    setError(null);
    setSuccess(null);
    try {
      await sessionAPI.updateOrganizationNotificationDefaults(orgId, {
        recipients: nextRecipients,
        sendSessionEndEmail: orgDefaultSettings.sendSessionEndEmail,
        sendAbsenceEmail: orgDefaultSettings.sendAbsenceEmail,
        attachReport: orgDefaultSettings.attachReport,
      });

      setOrgSavedRecipients(nextRecipients);
      setSuccess(`Removed ${email} from organization saved recipients.`);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Failed to update organization saved recipients");
    } finally {
      setSavingDefaults(false);
    }
  };

  const handleCreateSession = async () => {
    clearSelection();
    setCreateLoading(true);
    setError(null);
    setSuccess(null);

    const validDuration = duration || 30;
    const validRefreshInterval = refreshInterval || 10;
    const manualRecipients = notificationRecipients
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const effectiveSendAbsenceEmail = sendSessionEndEmail ? sendAbsenceEmail : false;
    const effectiveAttachReport = sendSessionEndEmail ? attachReport : false;

    try {
      const result = await sessionAPI.createSession(validDuration, validRefreshInterval, {
        recipients: manualRecipients,
        useDefaultRecipients,
        useOrgDefaultRecipients,
        includeCreator,
        sendSessionEndEmail,
        sendAbsenceEmail: effectiveSendAbsenceEmail,
        attachReport: effectiveAttachReport,
        saveAsDefaults,
        saveAsOrgDefaults,
      });

      if (saveAsDefaults) {
        await authAPI.updateMyNotificationDefaults({
          recipients: manualRecipients,
          includeSelf: includeCreator,
          sendSessionEndEmail,
          sendAbsenceEmail: effectiveSendAbsenceEmail,
          attachReport: effectiveAttachReport,
        });

        const me = await authAPI.getMe();
        useAuthStore.getState().setUser(me);
      }

      setSuccess(`✅ Session created! ID: ${result.session.sessionId}`);
      setDuration(30);
      setRefreshInterval(10);
      setNotificationRecipients("");
      setSaveAsDefaults(false);
      setSaveAsOrgDefaults(false);
      await loadActiveSessions();
      await loadNotificationHistory(1);
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to create session");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleViewAttendance = async (sessionId: string, refreshIntervalArg?: number) => {
    setError(null);
    selectedSessionIdRef.current = sessionId;
    setSelectedSessionId(sessionId);
    if (refreshIntervalArg) {
      setSelectedSessionRefreshInterval(refreshIntervalArg);
    }

    requestLiveAttendanceRefresh({ immediate: true });
  };

  const handleEndSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    const confirmed = await useModalStore.getState().confirm(
      "End Session",
      "Are you sure you want to end this session?"
    );
    if (!confirmed) {
      return;
    }

    setEndingSessionId(sessionId);
    setError(null);
    setSuccess(null);

    try {
      await sessionAPI.endSession(sessionId);
      setSuccess(`✅ Session ended successfully!`);

      if (selectedSessionId === sessionId) {
        requestLiveAttendanceRefresh({ immediate: true });
      }

      await loadActiveSessions();
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to end session");
    } finally {
      setEndingSessionId(null);
    }
  };

  const handleOpenEdit = (session: SessionItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSession(session);
    setEditDuration(session.duration);
    setEditRefreshInterval(session.refreshInterval || 10);
    setError(null);
  };

  const handleSaveEdit = async () => {
    if (!editingSession) return;
    setEditLoading(true);
    setError(null);
    setSuccess(null);

    const updates: { duration?: number; refreshInterval?: number } = {};
    if (editDuration && editDuration !== editingSession.duration) {
      updates.duration = Number(editDuration);
    }
    if (editRefreshInterval && editRefreshInterval !== editingSession.refreshInterval) {
      updates.refreshInterval = Number(editRefreshInterval);
    }

    if (Object.keys(updates).length === 0) {
      setEditingSession(null);
      return;
    }

    try {
      await sessionAPI.updateSession(editingSession.sessionId, updates);
      setSuccess(`✅ Session ${editingSession.sessionId} updated successfully!`);
      setEditingSession(null);
      await loadActiveSessions();
    } catch (err: any) {
      setError(err.message || "Failed to update session");
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    const confirmed = await useModalStore.getState().confirm(
      "Delete Session",
      `⚠️ PERMANENTLY DELETE session ${sessionId}?\n\nThis will remove the session and ALL attendance/absence records associated with it. This action cannot be undone.`,
      { confirmText: "Delete" }
    );
    if (!confirmed) {
      return;
    }

    setDeletingSessionId(sessionId);
    setError(null);
    setSuccess(null);

    try {
      const result = await sessionAPI.deleteSession(sessionId);
      setSuccess(`✅ Session ${sessionId} permanently deleted. ${result.deletedRecords?.attendance || 0} attendance records removed.`);
      if (selectedSessionId === sessionId) {
        clearSelection();
      }
      await loadActiveSessions();
      await loadNotificationHistory(historyPage);
    } catch (err: any) {
      setError(err.message || "Failed to delete session");
    } finally {
      setDeletingSessionId(null);
    }
  };

  const selectedSession = selectedSessionId
    ? activeSessions.find((session) => session.sessionId === selectedSessionId) || null
    : null;

  return (
    <div className="px-4 sm:px-8 lg:px-12 xl:px-16 pt-8 sm:pt-10 flex flex-col gap-8 pb-16 animate-fade-in-up">
      <EditSessionModal
        editingSession={editingSession}
        editDuration={editDuration}
        editRefreshInterval={editRefreshInterval}
        editLoading={editLoading}
        onClose={() => setEditingSession(null)}
        onSave={handleSaveEdit}
        onDurationChange={setEditDuration}
        onRefreshIntervalChange={setEditRefreshInterval}
      />

      <SessionManagementHeader orgName={orgName} />

      <CreateSessionCard
        duration={duration}
        refreshInterval={refreshInterval}
        notificationRecipients={notificationRecipients}
        useDefaultRecipients={useDefaultRecipients}
        useOrgDefaultRecipients={useOrgDefaultRecipients}
        includeCreator={includeCreator}
        sendSessionEndEmail={sendSessionEndEmail}
        sendAbsenceEmail={sendAbsenceEmail}
        attachReport={attachReport}
        saveAsDefaults={saveAsDefaults}
        saveAsOrgDefaults={saveAsOrgDefaults}
        createLoading={createLoading}
        savingDefaults={savingDefaults}
        error={error}
        success={success}
        personalSavedRecipients={personalSavedRecipients}
        orgSavedRecipients={orgSavedRecipients}
        onDurationChange={(value) => {
          clearSelection();
          setDuration(value);
        }}
        onRefreshIntervalChange={(value) => {
          clearSelection();
          setRefreshInterval(value);
        }}
        onNotificationRecipientsChange={setNotificationRecipients}
        onUseDefaultRecipientsChange={setUseDefaultRecipients}
        onUseOrgDefaultRecipientsChange={setUseOrgDefaultRecipients}
        onIncludeCreatorChange={setIncludeCreator}
        onSendSessionEndEmailChange={(value) => {
          setSendSessionEndEmail(value);
          if (!value) {
            setSendAbsenceEmail(false);
            setAttachReport(false);
          }
        }}
        onSendAbsenceEmailChange={setSendAbsenceEmail}
        onAttachReportChange={setAttachReport}
        onSaveAsDefaultsChange={setSaveAsDefaults}
        onSaveAsOrgDefaultsChange={setSaveAsOrgDefaults}
        onRemovePersonalSavedRecipient={handleRemovePersonalSavedRecipient}
        onRemoveOrgSavedRecipient={handleRemoveOrgSavedRecipient}
        onCreate={handleCreateSession}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <SessionsListPanel
          sessions={activeSessions}
          selectedSessionId={selectedSessionId}
          sessionSearch={sessionSearch}
          sessionFilter={sessionFilter}
          totalSessions={totalSessions}
          totalPages={totalPages}
          currentPage={currentPage}
          refreshLoading={refreshLoading}
          sessionTimeLeft={sessionTimeLeft}
          qrData={qrData}
          qrTimeLeft={qrTimeLeft}
          endingSessionId={endingSessionId}
          deletingSessionId={deletingSessionId}
          getPaginationButtons={getPaginationButtons}
          onSearchChange={(value) => {
            clearSelection();
            setSessionSearch(value);
          }}
          onFilterChange={(filterValue) => {
            clearSelection();
            setSessionFilter(filterValue);
          }}
          onSetCurrentPage={setCurrentPage}
          onRefresh={() => loadActiveSessions()}
          onViewAttendance={handleViewAttendance}
          onEndSession={handleEndSession}
          onOpenEdit={handleOpenEdit}
          onDeleteSession={handleDeleteSession}
          sessionsPerPage={SESSIONS_PER_PAGE}
        />

        <LiveAttendancePanel
          selectedSessionId={selectedSessionId}
          selectedSession={selectedSession}
          liveAttendance={liveAttendance}
          qrData={qrData}
          qrTimeLeft={qrTimeLeft}
          selectedSessionRefreshInterval={selectedSessionRefreshInterval}
        />
      </div>

      <NotificationHistoryPanel
        loading={historyLoading}
        items={notificationHistory}
        page={historyPage}
        totalPages={historyTotalPages}
        totalItems={historyTotalItems}
        onPageChange={(page) => {
          if (page < 1 || page > historyTotalPages || page === historyPage) return;
          setHistoryPage(page);
          loadNotificationHistory(page);
        }}
        onRefresh={() => loadNotificationHistory(historyPage)}
      />
    </div>
  );
};

export default AdminSessionManagementPage;
