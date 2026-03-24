import { Server as HttpServer } from "node:http";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import Session from "../models/Session.model";
import User from "../models/User.model";
import { UserRole } from "../models/User.model";
import { logger } from "../utils/logger";

let io: Server | null = null;

const buildAllowedOrigins = (rawOrigin?: string): string[] => {
  const base = String(rawOrigin || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const expanded = new Set<string>(base);

  for (const origin of base) {
    try {
      const url = new URL(origin);
      if (url.hostname === "trackence.app") {
        url.hostname = "www.trackence.app";
        expanded.add(url.toString().replace(/\/$/, ""));
      } else if (url.hostname === "www.trackence.app") {
        url.hostname = "trackence.app";
        expanded.add(url.toString().replace(/\/$/, ""));
      }
    } catch {
      // Ignore invalid URL inputs; they are not used for CORS matching.
    }
  }

  return Array.from(expanded).map((origin) => origin.replace(/\/$/, ""));
};

const frontendOrigins = buildAllowedOrigins(process.env.FRONTEND_URL);

type SocketJwtPayload = {
  userId: string;
  role: UserRole;
  platformRole?: "user" | "platform_owner";
};

const parseCookieToken = (cookieHeader?: string): string | null => {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";").map((entry) => entry.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith("token=")) {
      const raw = cookie.slice("token=".length);
      return decodeURIComponent(raw);
    }
  }

  return null;
};

const getSocketToken = (socket: Socket): string | null => {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === "string" && authToken.trim().length > 0) {
    return authToken;
  }

  return parseCookieToken(socket.handshake.headers.cookie);
};

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: frontendOrigins,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = getSocketToken(socket);

    if (!token) {
      logger.warn("Socket authentication failed: token missing", {
        socketId: socket.id,
        ip: socket.handshake.address,
      });
      return next(new Error("Unauthorized"));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as SocketJwtPayload;

      if (!decoded?.userId || !decoded?.role) {
        logger.warn("Socket authentication failed: invalid token payload", {
          socketId: socket.id,
        });
        return next(new Error("Unauthorized"));
      }

      socket.data.user = {
        userId: decoded.userId,
        role: decoded.role,
        platformRole: decoded.platformRole,
      };

      return next();
    } catch (error) {
      logger.warn("Socket authentication failed: token verification error", {
        socketId: socket.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return next(new Error("Invalid token"));
    }
  });

  io.on("connection", async (socket: Socket) => {
    const sessionId = socket.handshake.query?.sessionId;

    if (typeof sessionId !== "string" || !sessionId) {
      logger.warn("Socket disconnected: sessionId missing", {
        socketId: socket.id,
      });
      socket.disconnect(true);
      return;
    }

    const user = socket.data.user as SocketJwtPayload | undefined;
    if (!user) {
      logger.warn("Socket disconnected: authenticated user missing on socket", {
        socketId: socket.id,
      });
      socket.disconnect(true);
      return;
    }

    // Special case: user-scoped updates channel for org membership/role changes.
    if (sessionId === "_user_updates") {
      socket.join(`user:${user.userId}`);

      const dbUser = await User.findOne({ userId: user.userId })
        .select("organizationIds")
        .lean();
      const orgIds = Array.isArray((dbUser as any)?.organizationIds)
        ? ((dbUser as any).organizationIds as string[])
        : [];

      for (const orgId of orgIds) {
        if (typeof orgId === "string" && orgId.trim()) {
          socket.join(`org:${orgId.trim()}`);
        }
      }

      return;
    }

    // Special case: Global admin socket for broadcast events (e.g., SessionHistory, AbsenceReport)
    const isAdminCapable = user.role === "admin" || user.platformRole === "platform_owner";

    if (sessionId === "_global_admin" && isAdminCapable) {
      socket.join("admins");
      logger.info("Admin connected to global admin socket", {
        socketId: socket.id,
        userId: user.userId,
      });
      return;
    }

    if (isAdminCapable) {
      // Join the specific session room
      socket.join(`session:${sessionId}`);
      // Also join the global admins room for broadcast events
      socket.join("admins");
      return;
    }

    if (user.role === "member") {
      const activeSession = await Session.findOne({
        sessionId,
        isActive: true,
      })
        .select("sessionId")
        .lean();

      if (!activeSession) {
        logger.warn("Socket disconnected: member attempted invalid session join", {
          socketId: socket.id,
          userId: user.userId,
          sessionId,
        });
        socket.disconnect(true);
        return;
      }

      socket.join(`session:${sessionId}`);
      return;
    }

    logger.warn("Socket disconnected: unauthorized role", {
      socketId: socket.id,
      userId: user.userId,
      role: user.role,
    });
    socket.disconnect(true);
  });

  return io;
}

export function getIO(): Server | null {
  return io;
}

export function emitToSession(sessionId: string, event: string, data: unknown): void {
  if (io) {
    io.to(`session:${sessionId}`).emit(event, data);
  }
}

export function broadcastToAdmins(event: string, data: unknown): void {
  if (io) {
    io.to("admins").emit(event, data);
  }
}

export function emitToUser(userId: string, event: string, data: unknown): void {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
}

export function broadcastToOrganizationMembers(orgId: string, event: string, data: unknown): void {
  if (io) {
    io.to(`org:${orgId}`).emit(event, data);
  }
}

export function getConnectedClientCount(): number {
  return io?.engine.clientsCount ?? 0;
}
