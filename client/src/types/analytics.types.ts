export interface EnhancedData {
    attendanceBreakdown: {
        attended: number;
        absent: number;
        excused: number;
        rate: number;
    };
    weeklyComparison: {
        sessions: { current: number; previous: number; change: number };
        attendance: { current: number; previous: number; change: number };
        absences: { current: number; previous: number; change: number };
    };
    summary: {
        totalMembers: number;
        activeMembers: number;
        totalSessions: number;
        thisMonthSessions: number;
        lastMonthSessions: number;
        monthlyChange: number;
        activeSessions: number;
        peakHour: string;
        avgSessionsPerDay: number;
    };
    sparklines: {
        attendance: Array<{ date: string; value: number }>;
    };
}

export interface HealthData {
    status: "healthy" | "warning";
    score: number;
    organization: {
        name: string;
        code: string;
        memberCount: number;
        activeMembers: number;
        activePercentage: number;
        adminCount: number;
    };
    alerts: string[];
}
