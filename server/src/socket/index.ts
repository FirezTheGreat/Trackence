import { Server as HttpServer } from "node:http";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import Session from "../models/Session.model";
import User from "../models/User.model";
import { UserRole } from "../models/User.model";
import { logger } from "../utils/logger";

let io: Server | null = null;

const orgAdminRoom = (organizationId: string) => `org-admins:${organizationId}`;

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

    // Rooms are granted from the database (not the JWT role, which reflects only the org
    // that was current at login): membership and admin rights are per organization.
    const dbUser = await User.findOne({ userId: user.userId })
      .select("organizationIds userOrgRoles")
      .lean();
    const memberOrgIds = ((dbUser as any)?.organizationIds || []).filter(
      (orgId: unknown): orgId is string => typeof orgId === "string" && orgId.trim().length > 0
    );
    const adminOrgIds: string[] = ((dbUser as any)?.userOrgRoles || [])
      .filter((r: any) => r.role === "admin" && memberOrgIds.includes(r.organizationId))
      .map((r: any) => r.organizationId);

    // Special case: user-scoped updates channel for org membership/role changes.
    if (sessionId === "_user_updates") {
      socket.join(`user:${user.userId}`);
      for (const orgId of memberOrgIds) {
        socket.join(`org:${orgId}`);
      }
      return;
    }

    // Special case: admin lifecycle feed (SessionHistory, AbsenceReport, join requests),
    // scoped to the organizations this user administers.
    if (sessionId === "_global_admin") {
      if (adminOrgIds.length === 0) {
        logger.warn("Socket disconnected: admin feed requested without an admin role", {
          socketId: socket.id,
          userId: user.userId,
        });
        socket.disconnect(true);
        return;
      }
      for (const orgId of adminOrgIds) {
        socket.join(orgAdminRoom(orgId));
      }
      logger.info("Admin connected to admin socket", {
        socketId: socket.id,
        userId: user.userId,
        organizations: adminOrgIds.length,
      });
      return;
    }

    // A specific session room (live QR + attendance): only for that session's organization.
    const session = await Session.findOne({ sessionId })
      .select("organizationId isActive")
      .lean();

    if (session && adminOrgIds.includes(session.organizationId)) {
      socket.join(`session:${sessionId}`);
      socket.join(orgAdminRoom(session.organizationId));
      return;
    }

    if (session && session.isActive && memberOrgIds.includes(session.organizationId)) {
      socket.join(`session:${sessionId}`);
      return;
    }

    logger.warn("Socket disconnected: session room outside the user's organizations", {
      socketId: socket.id,
      userId: user.userId,
      sessionId,
    });
    socket.disconnect(true);
  });

  return io;
}

export function emitToSession(sessionId: string, event: string, data: unknown): void {
  if (io) {
    io.to(`session:${sessionId}`).emit(event, data);
  }
}

export function broadcastToOrgAdmins(organizationId: string, event: string, data: unknown): void {
  if (io) {
    io.to(orgAdminRoom(organizationId)).emit(event, data);
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
