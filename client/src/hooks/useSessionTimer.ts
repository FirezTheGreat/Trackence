import { useState, useEffect, useRef } from "react";

/**
 * Hook to manage live session timer
 * Calculates remaining time from endTime without hitting the backend
 *
 * @param endTime - ISO string or Date of when session ends
 * @returns milliseconds remaining until session expires (0 when expired)
 */
export function useSessionTimer(endTime: string | Date | null | undefined): number {
    const [timeLeft, setTimeLeft] = useState(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        // Clear any existing interval
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        // If no endTime, set to 0
        if (!endTime) {
            setTimeLeft(0);
            return;
        }

        // Calculate initial time left
        const calculateTimeLeft = () => {
            const end = typeof endTime === "string" ? new Date(endTime) : endTime;
            const now = new Date();
            const diff = end.getTime() - now.getTime();
            return Math.max(0, diff); // Never negative
        };

        // Set initial value
        setTimeLeft(calculateTimeLeft());

        // Update every second
        intervalRef.current = setInterval(() => {
            const remaining = calculateTimeLeft();
            setTimeLeft(remaining);

            // Stop timer at 0
            if (remaining <= 0 && intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        }, 1000);

        // Cleanup on unmount or endTime change
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [endTime]);

    return timeLeft;
}

/**
 * Format milliseconds to MM:SS display
 */
export function formatTimeLeft(milliseconds: number): string {
    if (milliseconds <= 0) return "00:00";

    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Format milliseconds to human-readable string (e.g., "5m 30s")
 */
export function formatTimeLong(milliseconds: number): string {
    if (milliseconds <= 0) return "Expired";

    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }

    return `${seconds}s`;
}
