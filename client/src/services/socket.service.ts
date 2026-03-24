import { io, Socket } from "socket.io-client";
import { shouldEnableIOSPerfMode } from "../utils/device";

const API_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

const getSocketTransports = (): Array<"websocket" | "polling"> => {
  if (shouldEnableIOSPerfMode()) {
    return ["websocket"];
  }
  return ["websocket", "polling"];
};

export type AttendanceUpdatePayload = {
  attendanceId: string;
  sessionId: string;
  userId: string;
  name?: string;
  email?: string;
  markedAt: string;
};

export type SessionSocketCallbacks = {
  onAttendanceUpdate?: (data: AttendanceUpdatePayload) => void;
  onSessionEnded?: (data: { sessionId: string }) => void;
  onQRRotated?: (data: { sessionId: string; qrImage: string; expiresAt: number }) => void;
};

const refreshSession = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    return response.ok;
  } catch {
    return false;
  }
};

// Store multiple socket connections: one per session
const sockets = new Map<string, Socket>();

export function connectSessionSocket(
  sessionId: string,
  callbacks: SessionSocketCallbacks
): Socket {
  // Check if socket already exists and is connected
  if (sockets.has(sessionId)) {
    const existingSocket = sockets.get(sessionId)!;
    if (existingSocket.connected) {
      // Remove old event listeners to prevent duplicates
      existingSocket.removeAllListeners("attendance:update");
      existingSocket.removeAllListeners("session:ended");
      existingSocket.removeAllListeners("qr:rotated");
      
      // Re-attach with new callbacks
      existingSocket.on("attendance:update", (data: AttendanceUpdatePayload) => {
        callbacks.onAttendanceUpdate?.(data);
      });

      existingSocket.on("session:ended", (data: { sessionId: string }) => {
        callbacks.onSessionEnded?.(data);
      });

      existingSocket.on("qr:rotated", (data: { sessionId: string; qrImage: string; expiresAt: number }) => {
        callbacks.onQRRotated?.(data);
      });
      
      return existingSocket;
    }
    // Clean up disconnected socket
    sockets.delete(sessionId);
  }

  const socket = io(API_URL, {
    query: { sessionId },
    transports: getSocketTransports(),
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  let refreshAttempted = false;

  socket.on("connect", () => {
    refreshAttempted = false;
  });

  socket.on("connect_error", async (error) => {
    const message = String(error?.message || "").toLowerCase();
    const isAuthError =
      message.includes("unauthorized") ||
      message.includes("invalid token") ||
      message.includes("jwt");

    if (!isAuthError || refreshAttempted) return;

    refreshAttempted = true;
    const refreshed = await refreshSession();
    if (refreshed) {
      socket.connect();
    }
  });

  socket.on("attendance:update", (data: AttendanceUpdatePayload) => {
    callbacks.onAttendanceUpdate?.(data);
  });

  socket.on("session:ended", (data: { sessionId: string }) => {
    callbacks.onSessionEnded?.(data);
  });

  socket.on("qr:rotated", (data: { sessionId: string; qrImage: string; expiresAt: number }) => {
    callbacks.onQRRotated?.(data);
  });

  sockets.set(sessionId, socket);
  return socket;
}

export function disconnectSessionSocket(sessionId?: string): void {
  if (sessionId) {
    // Disconnect specific session
    const socket = sockets.get(sessionId);
    if (socket) {
      socket.disconnect();
      sockets.delete(sessionId);
    }
  } else {
    // Disconnect all sessions
    sockets.forEach((socket) => {
      socket.disconnect();
    });
    sockets.clear();
  }
}

export function getSessionSocket(sessionId: string): Socket | null {
  return sockets.get(sessionId) || null;
}

// Global admin socket for listening to session lifecycle events
let globalAdminSocket: Socket | null = null;

export type AdminSocketCallbacks = {
  onSessionCreated?: (data: { sessionId: string; startTime: string; endTime: string; duration: number }) => void;
  onSessionEnded?: (data: { sessionId: string }) => void;
  onOrganizationJoinRequestUpdated?: (data: {
    type: "created" | "approved" | "rejected" | "cancelled";
    organizationId: string;
    userId: string;
    userName?: string;
    userEmail?: string;
    requestSource?: "invite" | "direct" | "signup";
    at: string;
  }) => void;
};

export function connectAdminSocket(callbacks: AdminSocketCallbacks): Socket {
  // Reuse existing connection if available
  if (globalAdminSocket?.connected) {
    // Remove old listeners
    globalAdminSocket.removeAllListeners("session:created");
    globalAdminSocket.removeAllListeners("session:ended");
    globalAdminSocket.removeAllListeners("organization:join-request-updated");
    
    // Attach new callbacks
    if (callbacks.onSessionCreated) {
      globalAdminSocket.on("session:created", callbacks.onSessionCreated);
    }
    if (callbacks.onSessionEnded) {
      globalAdminSocket.on("session:ended", callbacks.onSessionEnded);
    }
    if (callbacks.onOrganizationJoinRequestUpdated) {
      globalAdminSocket.on("organization:join-request-updated", callbacks.onOrganizationJoinRequestUpdated);
    }
    
    return globalAdminSocket;
  }

  // Clean up any existing disconnected socket
  if (globalAdminSocket) {
    globalAdminSocket.removeAllListeners();
    globalAdminSocket = null;
  }

  // Create new connection for admin broadcast events
  // Connect with a dummy sessionId - backend will add admin to "admins" room
  globalAdminSocket = io(API_URL, {
    query: { sessionId: "_global_admin" },
    transports: getSocketTransports(),
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  // Add error handling
  globalAdminSocket.on("connect_error", (error) => {
    console.warn("[Admin Socket] Connection error:", error.message);
  });

  globalAdminSocket.on("connect", () => {
    console.log("[Admin Socket] Connected successfully");
  });

  globalAdminSocket.on("disconnect", (reason) => {
    console.log("[Admin Socket] Disconnected:", reason);
  });

  if (callbacks.onSessionCreated) {
    globalAdminSocket.on("session:created", callbacks.onSessionCreated);
  }
  if (callbacks.onSessionEnded) {
    globalAdminSocket.on("session:ended", callbacks.onSessionEnded);
  }
  if (callbacks.onOrganizationJoinRequestUpdated) {
    globalAdminSocket.on("organization:join-request-updated", callbacks.onOrganizationJoinRequestUpdated);
  }

  return globalAdminSocket;
}

export function disconnectAdminSocket(): void {
  if (globalAdminSocket) {
    globalAdminSocket.disconnect();
    globalAdminSocket = null;
  }
}

let userUpdatesSocket: Socket | null = null;

export type UserUpdatesCallbacks = {
  onOrganizationMembershipChanged?: (data: {
    type:
      | "approved"
      | "rejected"
      | "removed"
      | "left"
      | "role_changed"
      | "org_deleted";
    organizationId: string;
    at: string;
  }) => void;
  onOrganizationMembershipUpdated?: (data: {
    organizationId: string;
    action: "joined" | "left" | "removed" | "role_changed" | "org_deleted";
    affectedUserId: string;
    initiatedBy?: string | null;
    at: string;
  }) => void;
};

export function connectUserUpdatesSocket(callbacks: UserUpdatesCallbacks): Socket {
  if (userUpdatesSocket?.connected) {
    userUpdatesSocket.removeAllListeners("user:org-membership-changed");
    userUpdatesSocket.removeAllListeners("organization:membership-updated");
    if (callbacks.onOrganizationMembershipChanged) {
      userUpdatesSocket.on("user:org-membership-changed", callbacks.onOrganizationMembershipChanged);
    }
    if (callbacks.onOrganizationMembershipUpdated) {
      userUpdatesSocket.on("organization:membership-updated", callbacks.onOrganizationMembershipUpdated);
    }
    return userUpdatesSocket;
  }

  if (userUpdatesSocket) {
    userUpdatesSocket.removeAllListeners();
    userUpdatesSocket = null;
  }

  userUpdatesSocket = io(API_URL, {
    query: { sessionId: "_user_updates" },
    transports: getSocketTransports(),
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  let refreshAttempted = false;

  userUpdatesSocket.on("connect", () => {
    refreshAttempted = false;
  });

  userUpdatesSocket.on("connect_error", async (error) => {
    const message = String(error?.message || "").toLowerCase();
    const isAuthError =
      message.includes("unauthorized") ||
      message.includes("invalid token") ||
      message.includes("jwt");

    if (!isAuthError || refreshAttempted) return;

    refreshAttempted = true;
    const refreshed = await refreshSession();
    if (refreshed) {
      userUpdatesSocket?.connect();
    }
  });

  if (callbacks.onOrganizationMembershipChanged) {
    userUpdatesSocket.on("user:org-membership-changed", callbacks.onOrganizationMembershipChanged);
  }
  if (callbacks.onOrganizationMembershipUpdated) {
    userUpdatesSocket.on("organization:membership-updated", callbacks.onOrganizationMembershipUpdated);
  }

  return userUpdatesSocket;
}

export function disconnectUserUpdatesSocket(): void {
  if (userUpdatesSocket) {
    userUpdatesSocket.disconnect();
    userUpdatesSocket = null;
  }
}
