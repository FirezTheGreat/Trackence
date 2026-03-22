import { create } from "zustand";
import { io, Socket } from "socket.io-client";

const API_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

interface SocketState {
    socket: Socket | null;
    isConnected: boolean;
    error: string | null;

    connect: (sessionId?: string) => void;
    disconnect: () => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
    socket: null,
    isConnected: false,
    error: null,

    connect: (sessionId?: string) => {
        const currentSocket = get().socket;

        // Disconnect existing socket if connecting to different session
        if (currentSocket) {
            currentSocket.disconnect();
        }

        // Create new socket connection
        const socket = io(API_URL, {
            query: sessionId ? { sessionId } : undefined,
            transports: ["websocket", "polling"],
            withCredentials: true, // Send cookies for JWT authentication
        });

        // Connection success
        socket.on("connect", () => {
            console.log("Socket connected:", socket.id);
            set({ isConnected: true, error: null });
        });

        // Connection error
        socket.on("connect_error", (error) => {
            console.error("Socket connection error:", error.message);
            set({ isConnected: false, error: error.message });
        });

        // Disconnection
        socket.on("disconnect", (reason) => {
            console.log("Socket disconnected:", reason);
            set({ isConnected: false });
        });

        // Reconnection attempt
        socket.io.on("reconnect_attempt", (attempt) => {
            console.log("Socket reconnection attempt:", attempt);
        });

        // Successful reconnection
        socket.io.on("reconnect", (attemptNumber) => {
            console.log("Socket reconnected after", attemptNumber, "attempts");
            set({ isConnected: true, error: null });
        });

        // Reconnection error
        socket.io.on("reconnect_error", (error) => {
            console.error("Socket reconnection error:", error.message);
            set({ error: error.message });
        });

        // Reconnection failed
        socket.io.on("reconnect_failed", () => {
            console.error("Socket reconnection failed");
            set({ error: "Failed to reconnect to server" });
        });

        set({ socket, isConnected: socket.connected });
    },

    disconnect: () => {
        const socket = get().socket;

        if (socket) {
            socket.disconnect();
            set({ socket: null, isConnected: false, error: null });
        }
    },
}));
