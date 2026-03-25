const API_URL = import.meta.env.VITE_BACKEND_URL;

class MonitoringAPIError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "MonitoringAPIError";
        this.status = status;
    }
}

type FetchOptions = RequestInit & {
    body?: BodyInit | Record<string, unknown> | null;
};

const fetchJson = async <T>(path: string, options: FetchOptions = {}): Promise<T> => {
    const headers: HeadersInit = {
        "Content-Type": "application/json",
        ...(options.headers || {}),
    };

    const init: RequestInit = {
        credentials: "include",
        ...options,
        headers,
    };

    if (options.body && typeof options.body !== "string") {
        init.body = JSON.stringify(options.body);
    }

    const response = await fetch(`${API_URL}${path}`, init);
    if (!response.ok) {
        const text = await response.text();
        throw new MonitoringAPIError(response.status, text || response.statusText);
    }

    return response.json() as Promise<T>;
};

export type AuditLogRecord = {
    auditId: string;
    action: string;
    performedBy: string;
    performedByName?: string;
    performedByEmail?: string;
    targetId?: string;
    targetResourceType?: string;
    targetResourceName?: string;
    organizationId?: string;
    organizationName?: string;
    metadata?: Record<string, unknown>;
    details?: {
        affectedUsers?: string[];
        affectedUsersCount?: number;
        changesSummary?: string;
        sessionCode?: string;
        sessionStatus?: string;
        reason?: string;
        result?: string;
    };
    ipAddress?: string;
    userAgent?: string;
    timestamp: string;
};

export type AuditLogsResponse = {
    logs: AuditLogRecord[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
    filters: {
        action: string | null;
        userId: string | null;
        from: string | null;
        to: string | null;
    };
};

export type SystemHealthResponse = {
    status: "ok" | "degraded";
    uptime: number;
    systemUptime: number;
    mongodb: "connected" | "disconnected";
    redis: "connected" | "disconnected";
    runtime: {
        nodeVersion: string;
        environment: string;
        platform: string;
        arch: string;
        hostname: string;
        pid: number;
        timezone: string;
    };
    memoryUsage: {
        rss: number;
        heapTotal: number;
        heapUsed: number;
        external: number;
        arrayBuffers: number;
    };
    timestamp: number;
    timestampIso: string;
};

export type SystemMetricsResponse = {
    status: "ok";
    uptime: number;
    systemUptime: number;
    activeSessionsCount: number;
    connectedSocketClients: number;
    redis: {
        status: "connected" | "disconnected";
        memoryHuman: string | null;
        memoryBytes: number | null;
        pingMs: number | null;
        error: string | null;
    };
    eventLoopLagMs: number;
    apiResponseTime: {
        sampleSize: number;
        avgMs: number;
        p95Ms: number;
    };
    cpu: {
        userMs: number;
        systemMs: number;
        loadAverage1m: number;
        loadAverage5m: number;
        loadAverage15m: number;
        normalizedLoad1mPercent: number;
        normalizedLoad5mPercent: number;
        normalizedLoad15mPercent: number;
        loadAverageSupported: boolean;
        cores: number;
    };
    memoryUsage: {
        rss: number;
        heapTotal: number;
        heapUsed: number;
        external: number;
        arrayBuffers: number;
        heapUsagePercent: number;
    };
    systemMemory: {
        total: number;
        free: number;
        used: number;
        usedPercent: number;
    };
    runtime: {
        nodeVersion: string;
        environment: string;
        platform: string;
        arch: string;
        hostname: string;
        pid: number;
        timezone: string;
    };
    timestamp: number;
    timestampIso: string;
};

export const adminMonitoringAPI = {
    getAuditLogs: async (params: {
        page?: number;
        limit?: number;
        action?: string;
        userId?: string;
        from?: string;
        to?: string;
    }): Promise<AuditLogsResponse> => {
        const search = new URLSearchParams();

        if (params.page) search.set("page", String(params.page));
        if (params.limit) search.set("limit", String(params.limit));
        if (params.action) search.set("action", params.action);
        if (params.userId) search.set("userId", params.userId);
        if (params.from) search.set("from", params.from);
        if (params.to) search.set("to", params.to);

        return fetchJson<AuditLogsResponse>(
            `/api/admin/audit-logs${search.toString() ? `?${search.toString()}` : ""}`
        );
    },

    getSystemHealth: async (): Promise<SystemHealthResponse> => {
        return fetchJson<SystemHealthResponse>("/api/system/health");
    },

    getSystemMetrics: async (): Promise<SystemMetricsResponse> => {
        return fetchJson<SystemMetricsResponse>("/api/system/metrics");
    },

    getAllAdmins: async (): Promise<{ admins: Array<{ userId: string; name: string; email: string; role: string }> }> => {
        return fetchJson("/api/admin/admins");
    },
};
