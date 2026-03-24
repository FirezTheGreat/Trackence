import { useEffect, useRef } from "react";
import { useSocketStore } from "../stores/socket.store";
import { useSessionStore } from "../stores/session.store";
import type { Attendee } from "../stores/session.store";

interface SocketEventHandlers {
    onAttendanceUpdate?: (data: Attendee) => void;
    onSessionEnded?: (data: { sessionId: string }) => void;
    onQRRotated?: (data: { sessionId: string }) => void;
}

/**
 * Hook to manage socket events for a session
 * Automatically connects/disconnects and sets up event listeners
 */
export function useSocketEvents(
    sessionId: string | null | undefined,
    handlers: SocketEventHandlers = {}
) {
    const socket = useSocketStore((state) => state.socket);
    const connect = useSocketStore((state) => state.connect);
    const disconnect = useSocketStore((state) => state.disconnect);
    const isConnected = useSocketStore((state) => state.isConnected);

    const addAttendee = useSessionStore((state) => state.addAttendee);
    const clearSession = useSessionStore((state) => state.clearSession);

    const handlersRef = useRef(handlers);

    useEffect(() => {
        handlersRef.current = handlers;
    }, [handlers]);

    useEffect(() => {
        // Don't connect if no sessionId
        if (!sessionId) {
            return;
        }

        // Connect to socket with sessionId
        connect(sessionId);

        // Cleanup on unmount
        return () => {
            disconnect();
        };
    }, [sessionId, connect, disconnect]);

    useEffect(() => {
        if (!socket) return;

        // Attendance update handler
        const handleAttendanceUpdate = (data: Attendee) => {
            addAttendee(data);
            handlersRef.current.onAttendanceUpdate?.(data);
        };

        // Session ended handler
        const handleSessionEnded = (data: { sessionId: string }) => {
            clearSession();
            handlersRef.current.onSessionEnded?.(data);
        };

        // QR rotated handler
        const handleQRRotated = (data: { sessionId: string }) => {
            handlersRef.current.onQRRotated?.(data);
        };

        // Register listeners
        socket.on("attendance:update", handleAttendanceUpdate);
        socket.on("session:ended", handleSessionEnded);
        socket.on("qr:rotated", handleQRRotated);

        // Cleanup listeners on unmount
        return () => {
            socket.off("attendance:update", handleAttendanceUpdate);
            socket.off("session:ended", handleSessionEnded);
            socket.off("qr:rotated", handleQRRotated);
        };
    }, [socket, addAttendee, clearSession]);

    return { socket, isConnected };
}
