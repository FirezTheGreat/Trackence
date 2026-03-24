import { apiGet } from "./api";

export interface AttendanceHistoryRecord {
    historyId: string;
    attendanceId: string | null;
    absenceId: string | null;
    sessionId: string;
    markedAt: string;
    status: "attended" | "absent" | "excused";
    reason: string | null;
    session: {
        startTime: string;
        endTime: string;
        duration: number;
        isActive: boolean;
        organizationId?: string | null;
    } | null;
}

export interface AttendanceHistoryResponse {
    attendance: AttendanceHistoryRecord[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface AttendanceStatsResponse {
    totalAttended: number;
    totalSessions: number;
    attendanceRate: number;
    recent: any[];
}

export const memberAPI = {
    /**
     * Get member's attendance history (paginated)
     */
    getMyHistory: async (page = 1, limit = 10): Promise<AttendanceHistoryResponse> => {
        return apiGet<AttendanceHistoryResponse>(`/api/attendance/my-history?page=${page}&limit=${limit}`);
    },

    /**
     * Get member's overall attendance statistics
     */
    getMyStats: async (): Promise<AttendanceStatsResponse> => {
        return apiGet<AttendanceStatsResponse>("/api/attendance/my-stats");
    }
};
