export interface SessionData {
    sessionId: string;
    startedAt: string;
    createdAt: string;
    endTime: string;
    duration: number;
    attendanceCount?: number;
    checkedInCount?: number;
    totalFaculty?: number;
    createdBy?: string;
    createdByName?: string | null;
    createdByEmail?: string | null;
    isActive: boolean;
}

export interface AbsenceRecord {
    _id: string;
    sessionId: string;
    facultyId: string;
    facultyName: string;
    facultyEmail: string;
    department?: string;
    reason: string;
    isExcused: boolean;
    markedManually?: boolean;
    markedAt?: string;
    excusedAt?: string;
    excusedBy?: string;
    createdAt: string;
}
