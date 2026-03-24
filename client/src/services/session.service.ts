import { useAuthStore } from "../stores/auth.store";

const API_URL = import.meta.env.VITE_BACKEND_URL;

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export type SessionFilter = "all" | "active" | "ended";

export type SessionListQuery = {
  page?: number;
  limit?: number;
  filter?: SessionFilter;
  search?: string;
};

export type SessionListResponse<T = any> = {
  sessions: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  filters: {
    filter: SessionFilter;
    search: string | null;
  };
};

const withOrgContext = (endpoint: string) => {
  const user = useAuthStore.getState().user;
  const orgId = user?.currentOrganizationId || user?.organizationIds?.[0];
  if (!orgId) return endpoint;
  const separator = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${separator}orgId=${encodeURIComponent(orgId)}`;
};

// Helper function to handle fetch requests
const fetchAPI = async (endpoint: string, options: RequestInit = {}) => {
  const endpointWithOrg = withOrgContext(endpoint);
  const url = `${API_URL}${endpointWithOrg}`;
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorPayload: any = null;
    try {
      errorPayload = await response.clone().json();
    } catch {
      // Ignore non-JSON error bodies
    }

    const message =
      errorPayload?.message ||
      errorPayload?.error ||
      `API error: ${response.status} ${response.statusText}`;

    throw new ApiError(message, response.status, errorPayload?.code, errorPayload);
  }

  return response.json();
};

// Admin Session APIs
export const sessionAPI = {
  // Create a new QR session
  createSession: async (
    duration: number,
    refreshInterval?: number,
    notification?: {
      recipients: string[];
      useDefaultRecipients: boolean;
      useOrgDefaultRecipients: boolean;
      includeCreator: boolean;
      sendSessionEndEmail: boolean;
      sendAbsenceEmail: boolean;
      attachReport: boolean;
      saveAsDefaults?: boolean;
      saveAsOrgDefaults?: boolean;
    }
  ) => {
    return fetchAPI("/api/admin/session/create", {
      method: "POST",
      body: JSON.stringify({
        duration,
        refreshInterval: refreshInterval || 10,
        notification,
      }),
    });
  },

  getOrganizationNotificationDefaults: async (orgId: string) => {
    return fetchAPI(`/api/admin/organizations/${encodeURIComponent(orgId)}/notification-defaults`);
  },

  updateOrganizationNotificationDefaults: async (
    orgId: string,
    payload: {
      recipients: string[];
      sendSessionEndEmail: boolean;
      sendAbsenceEmail: boolean;
      attachReport: boolean;
    }
  ) => {
    return fetchAPI(`/api/admin/organizations/${encodeURIComponent(orgId)}/notification-defaults`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  getNotificationHistory: async (query?: { page?: number; limit?: number; eventType?: string; status?: string }) => {
    const search = new URLSearchParams();
    if (query?.page) search.set("page", String(query.page));
    if (query?.limit) search.set("limit", String(query.limit));
    if (query?.eventType) search.set("eventType", query.eventType);
    if (query?.status) search.set("status", query.status);

    const suffix = search.toString() ? `?${search.toString()}` : "";
    return fetchAPI(`/api/admin/notifications/history${suffix}`);
  },

  // Get all active sessions
  getActiveSessions: async () => {
    const data = await fetchAPI("/api/admin/sessions");
    return data.sessions;
  },

  // Get paginated sessions (active and ended)
  getAllSessionsPaginated: async (query: SessionListQuery = {}): Promise<SessionListResponse> => {
    const search = new URLSearchParams();

    if (query.page) search.set("page", String(query.page));
    if (query.limit) search.set("limit", String(query.limit));
    if (query.filter) search.set("filter", query.filter);
    if (query.search && query.search.trim().length > 0) {
      search.set("search", query.search.trim());
    }

    const suffix = search.toString() ? `?${search.toString()}` : "";
    return fetchAPI(`/api/admin/sessions/all${suffix}`);
  },

  // Get all sessions (compatibility helper for screens that still need full list)
  getAllSessions: async () => {
    const allSessions: any[] = [];
    const limit = 100;
    let page = 1;
    let hasNext = true;

    while (hasNext) {
      const response = await sessionAPI.getAllSessionsPaginated({ page, limit, filter: "all" });
      allSessions.push(...(response.sessions || []));
      hasNext = response.pagination?.hasNext === true;
      page += 1;

      if (page > 1000) {
        throw new Error("Session pagination exceeded safe guard limit.");
      }
    }

    return allSessions;
  },

  // Get session status with attendance count
  getSessionStatus: async (sessionId: string) => {
    const data = await fetchAPI(`/api/admin/session/${sessionId}`);
    return data.session;
  },

  // Get QR image (structured payload) for session
  getSessionQR: async (sessionId: string): Promise<{ qrImage: string; expiresAt: number }> => {
    return fetchAPI(`/api/admin/session/${sessionId}/qr`);
  },

  // Get live attendance for a session
  getLiveAttendance: async (sessionId: string) => {
    return fetchAPI(`/api/admin/session/${sessionId}/attendance`);
  },

  // End a session manually
  endSession: async (sessionId: string) => {
    return fetchAPI(`/api/admin/session/${sessionId}/end`, {
      method: "POST",
    });
  },

  // Update session details (duration, refreshInterval)
  updateSession: async (sessionId: string, updates: { duration?: number; refreshInterval?: number }) => {
    return fetchAPI(`/api/admin/session/${sessionId}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
  },

  // Permanently delete a session and all its records
  deleteSession: async (sessionId: string) => {
    return fetchAPI(`/api/admin/session/${sessionId}`, {
      method: "DELETE",
    });
  },

  // Export attendance as CSV download
  exportSessionCSV: async (sessionId: string) => {
    const endpointWithOrg = withOrgContext(`/api/admin/session/${sessionId}/export`);
    const url = `${API_URL}${endpointWithOrg}`;
    const response = await fetch(url, {
      credentials: "include",
    });
    if (!response.ok) throw new Error("Export failed");
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `attendance-${sessionId}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(downloadUrl);
  },

  // Faculty: Get current active session
  getActiveSession: async () => {
    return fetchAPI("/api/attendance/active-session");
  },

  // Faculty: Mark attendance with QR payload (sessionId, qrToken, issuedAt, expiresAt)
  markAttendance: async (payload: {
    sessionId: string;
    qrToken: string;
    issuedAt?: number;
    expiresAt?: number;
  }) => {
    return fetchAPI("/api/attendance/mark", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};