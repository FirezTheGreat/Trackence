export interface SessionItem {
    sessionId: string;
    createdAt: string;
    startTime?: string;
    endedAt?: string;
    endTime?: string;
    duration: number;
    refreshInterval?: number;
    isActive: boolean;
    checkedInCount?: number;
    attendanceCount?: number;
    totalFaculty?: number;
    createdByName?: string | null;
    createdByEmail?: string | null;
}

export interface LiveAttendanceData {
    totalFaculty?: number;
    totalMarked?: number;
    attendance?: Array<{
        attendanceId?: string;
        name: string;
        email: string;
        markedAt: string;
    }>;
    recentCheckIns?: Array<{
        name: string;
        markedAt: string;
    }>;
}

export interface QrEntry {
    image: string;
    expiresAt: number;
}
