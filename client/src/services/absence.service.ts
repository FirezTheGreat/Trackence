const API_URL = import.meta.env.VITE_BACKEND_URL;

const fetchJson = async (path: string, options: RequestInit = {}) => {
    const url = `${API_URL}${path}`;
    const init: RequestInit = {
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
        ...options,
    };

    if (options.body && typeof options.body !== "string") {
        init.body = JSON.stringify(options.body);
    }

    const res = await fetch(url, init);
    if (!res.ok) {
        const text = await res.text();
        let message = text || res.statusText;
        try {
            const data = JSON.parse(text);
            if (data && data.error) message = data.error;
        } catch (e) {
            /* ignore */
        }
        throw new Error(message);
    }

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) return res.json();
    return res.text();
};

export const absenceAPI = {
    /**
     * Detect and create absence records for a session
     */
    detectAbsences: async (sessionId: string) => {
        return fetchJson(`/api/admin/absences/detect/${sessionId}`, {
            method: "POST",
        });
    },

    /**
     * Get all absences for a specific session
     */
    getSessionAbsences: async (sessionId: string, page?: number, limit?: number) => {
        const params = new URLSearchParams();
        if (page) params.set("page", String(page));
        if (limit) params.set("limit", String(limit));
        const query = params.toString();
        return fetchJson(`/api/admin/absences/session/${sessionId}${query ? `?${query}` : ""}`);
    },

    /**
     * Get all absences for a session across all pages
     */
    getAllSessionAbsences: async (sessionId: string) => {
        const limit = 100;
        let page = 1;
        let total = 0;
        const records: any[] = [];

        while (true) {
            const response = await absenceAPI.getSessionAbsences(sessionId, page, limit);
            total = Number(response?.total || 0);
            records.push(...(response?.records || []));

            if (records.length >= total || (response?.records || []).length === 0) {
                break;
            }

            page += 1;

            if (page > 1000) {
                throw new Error("Absence pagination exceeded safe guard limit.");
            }
        }

        const excused = records.filter((record) => record?.isExcused).length;
        return {
            total: records.length,
            excused,
            pending: Math.max(0, records.length - excused),
            page: 1,
            limit: records.length || limit,
            records,
        };
    },

    /**
     * Get pending absences (not excused)
     */
    getPendingAbsences: async (department?: string, limit?: number) => {
        const params = new URLSearchParams();
        if (department) params.append("department", department);
        if (limit !== undefined) params.append("limit", String(limit));
        const path = `/api/admin/absences/pending${params.toString() ? `?${params.toString()}` : ""}`;
        return fetchJson(path);
    },

    /**
     * Mark absence as excused
     */
    markAsExcused: async (absenceId: string, reason?: string) => {
        return fetchJson(`/api/admin/absences/${absenceId}/excuse`, {
            method: "PUT",
            body: { reason } as any,
        });
    },

    /**
     * Bulk mark absences as excused
     */
    bulkMarkAsExcused: async (absenceIds: string[], reason?: string) => {
        return fetchJson("/api/admin/absences/bulk-excuse", {
            method: "POST",
            body: { absenceIds, reason } as any,
        });
    },

    /**
     * Manually mark attendance for absent faculty
     */
    markAttendanceManually: async (absenceId: string) => {
        return fetchJson(`/api/admin/absences/${absenceId}/mark-attended`, {
            method: "POST",
        });
    },

    /**
     * Generate session summary with absence statistics
     */
    generateSessionSummary: async (sessionId: string) => {
        return fetchJson(`/api/admin/absences/summary/${sessionId}`);
    },

    /**
     * Get absence statistics by department
     */
    getAbsenceStats: async (sessionId: string) => {
        return fetchJson(`/api/admin/absences/stats/${sessionId}`);
    },
};
