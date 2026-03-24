export interface SessionData {
    sessionId: string;
    startedAt: string;
    createdAt: string;
    endTime: string;
    duration: number;
    attendanceCount?: number;
    checkedInCount?: number;
    totalMember?: number;
    createdBy?: string;
    createdByName?: string | null;
    createdByEmail?: string | null;
    isActive: boolean;
}

export interface AbsenceRecord {
    _id: string;
    sessionId: string;
    memberId: string;
    memberName: string;
    memberEmail: string;
    department?: string;
    reason: string;
    isExcused: boolean;
    markedManually?: boolean;
    markedAt?: string;
    excusedAt?: string;
    excusedBy?: string;
    createdAt: string;
}
