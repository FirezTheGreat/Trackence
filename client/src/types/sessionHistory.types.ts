export interface SessionHistoryItem {
    sessionId: string;
    startTime: string;
    endTime: string;
    duration: number;
    isActive: boolean;
    attendanceCount?: number;
    checkedInCount?: number;
    totalFaculty?: number;
    createdBy?: string;
    createdByName?: string | null;
    createdByEmail?: string | null;
}

export interface AttendanceRecord {
    attendanceId: string;
    userId: string;
    name?: string;
    email?: string;
    markedAt: string;
}

export type SortField = "name" | "email" | "markedAt";
export type SortDir = "asc" | "desc";
