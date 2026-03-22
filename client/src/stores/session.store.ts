import { create } from "zustand";

export interface Attendee {
    attendanceId: string;
    userId: string;
    name: string;
    email: string;
    markedAt: string;
}

export interface Session {
    sessionId: string;
    createdBy: string;
    startTime: string;
    endTime: string;
    duration: number;
    refreshInterval: number;
    isActive: boolean;
}

interface SessionState {
    activeSession: Session | null;
    attendees: Attendee[];

    setSession: (session: Session) => void;
    addAttendee: (attendee: Attendee) => void;
    setAttendees: (attendees: Attendee[]) => void;
    clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
    activeSession: null,
    attendees: [],

    setSession: (session) =>
        set({
            activeSession: session,
        }),

    addAttendee: (attendee) =>
        set((state) => {
            // Prevent duplicate attendees
            const exists = state.attendees.some(
                (a) => a.userId === attendee.userId || a.attendanceId === attendee.attendanceId
            );

            if (exists) {
                return state; // No change
            }

            return {
                attendees: [...state.attendees, attendee],
            };
        }),

    setAttendees: (attendees) =>
        set({
            attendees,
        }),

    clearSession: () =>
        set({
            activeSession: null,
            attendees: [],
        }),
}));
