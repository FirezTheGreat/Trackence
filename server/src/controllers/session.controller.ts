import { Request, Response } from "express";
import {
  createQRSession,
  ensureSessionCreatorAttendance,
  getSession,
  getSessionWithAttendance,
  endSession,
} from "../services/session.service";
import {
  verifyQRToken,
  createAttendanceLock,
  isTokenUsed,
  markTokenAsUsed,
  getQRToken,
  generateQRImage,
  getCachedQRImage,
} from "../services/qr.service";
import { startSessionRotation, stopSessionRotation } from "../services/scheduler.service";
import Attendance from "../models/Attendance.model";
import Session from "../models/Session.model";
import Absence from "../models/Absence.model";
import Organization from "../models/Organization.model";
import { generateAttendanceId } from "../utils/id.utils";
import User from "../models/User.model";
import EmailNotification from "../models/EmailNotification.model";
import { emitToSession, broadcastToAdmins } from "../socket";
import { logAudit } from "../services/audit.service";
import { logger } from "../utils/logger";
import {
  getNotificationDefaults,
  buildSessionNotificationOptions,
  getOrganizationNotificationDefaults,
} from "../utils/notification.utils";
import {
  buildSessionAttendanceCsv,
  buildSessionAbsenceReportXlsx,
  buildSessionAttendanceReportXlsx,
} from "../services/session-export.service";
import { sendAbsenceDetectionEmail, sendSessionEndSummaryEmail } from "../services/email.service";
import AbsenceService from "../services/absence.service";
import { MAX_SESSION_DURATION_MINUTES } from "../config/env";

const resolveOrganizationId = (req: Request): { organizationId?: string; status?: number; message?: string } => {
  const requestedOrgId = typeof req.query.orgId === "string" ? req.query.orgId : undefined;
  const userOrgIds = req.user?.organizationIds || [];
  const hasPlatformOwnerAccess = req.user?.platformRole === "platform_owner";

  if (requestedOrgId && !userOrgIds.includes(requestedOrgId) && !hasPlatformOwnerAccess) {
    return { status: 403, message: "Forbidden: invalid organization context." };
  }

  const organizationId = requestedOrgId || req.user?.currentOrganizationId || userOrgIds[0];
  if (!organizationId) {
    return { status: 400, message: "Organization not found." };
  }

  return { organizationId };
};

const canAccessSessionInCurrentOrg = async (req: Request, sessionId: string): Promise<boolean> => {
  const orgContext = resolveOrganizationId(req);
  const organizationId = orgContext.organizationId;
  if (!organizationId) return false;
  const session = await Session.findOne({ sessionId, organizationId }).select("sessionId").lean();
  return !!session;
};

const normalizeSessionId = (value: string): string => {
  const normalized = (value || "").trim().toUpperCase();
  if (!normalized) return normalized;
  if (normalized.startsWith("SES-")) return normalized;
  if (/^[A-Z0-9]{6,}$/.test(normalized)) return `SES-${normalized}`;
  return normalized;
};

const toSessionCore = (value: string): string =>
  value.startsWith("SES-") ? value.slice(4) : value;

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const addAttendanceCounts = async (sessions: any[], organizationId: string) => {
  if (!sessions.length) return sessions;

  const sessionIds = sessions.map((session) => session.sessionId);
  const creatorIds = Array.from(
    new Set(sessions.map((session) => session.createdBy).filter(Boolean))
  );

  const [counts, totalMemberCount, creators] = await Promise.all([
    Attendance.aggregate([
      { $match: { sessionId: { $in: sessionIds } } },
      { $group: { _id: "$sessionId", count: { $sum: 1 } } },
    ]),
    User.countDocuments({
      organizationIds: organizationId,
    }),
    creatorIds.length
      ? User.find({ userId: { $in: creatorIds } })
          .select("userId name email")
          .lean()
      : [],
  ]);

  const countMap = new Map(counts.map((entry) => [entry._id, entry.count]));
  const creatorMap = new Map(
    (creators as any[]).map((user) => [
      user.userId,
      { name: user.name ?? null, email: user.email ?? null },
    ])
  );

  return sessions.map((session) => ({
    ...session,
    checkedInCount: countMap.get(session.sessionId) || 0,
    totalMember: session.memberCountAtStart || totalMemberCount,
    createdByName: creatorMap.get(session.createdBy)?.name ?? null,
    createdByEmail: creatorMap.get(session.createdBy)?.email ?? null,
  }));
};

/**
 * [ADMIN] Create a new QR session
 * POST /api/admin/session/create
 */
export const createSession = async (req: Request, res: Response) => {
  try {
    const { duration, refreshInterval, notification } = req.body;
    const adminUserId = req.user?.userId;

    if (!adminUserId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!duration || typeof duration !== "number" || duration <= 0) {
      return res.status(400).json({
        message: "Invalid duration. Must be a positive number (minutes).",
      });
    }

    if (duration > MAX_SESSION_DURATION_MINUTES) {
      return res.status(400).json({
        message: `Invalid duration. Must be ${MAX_SESSION_DURATION_MINUTES} minutes or less.`,
      });
    }

    const refreshInt = refreshInterval || 10;

    if (typeof refreshInt !== "number" || refreshInt <= 0) {
      return res.status(400).json({
        message: "Invalid refreshInterval. Must be a positive number (seconds).",
      });
    }

    const orgContext = resolveOrganizationId(req);
    if (!orgContext.organizationId) {
      return res.status(orgContext.status || 400).json({ message: orgContext.message || "Organization not found." });
    }
    const organizationId = orgContext.organizationId;

    const creator = await User.findOne({ userId: adminUserId })
      .select("userId name email notificationDefaults organizationIds currentOrganizationId userOrgRoles")
      .lean();

    const organization = await Organization.findOne({ organizationId })
      .select("organizationId notificationDefaults")
      .lean();

    const defaults = getNotificationDefaults(creator);
    const orgDefaults = getOrganizationNotificationDefaults(organization);
    const notificationOptions = buildSessionNotificationOptions({
      bodyNotification: notification,
      creatorEmail: creator?.email || null,
      defaults,
      organizationDefaults: orgDefaults,
    });

    if (notification?.saveAsDefaults && creator?.userId) {
      await User.updateOne(
        { userId: creator.userId },
        {
          $set: {
            notificationDefaults: {
              recipients: notificationOptions.recipients,
              includeSelf: notificationOptions.includeCreator,
              sendSessionEndEmail: notificationOptions.sendSessionEndEmail,
              sendAbsenceEmail: notificationOptions.sendAbsenceEmail,
              attachReport: notificationOptions.attachReport,
            },
          },
        }
      );
    }

    if (notification?.saveAsOrgDefaults) {
      await Organization.updateOne(
        { organizationId },
        {
          $set: {
            notificationDefaults: {
              recipients: notificationOptions.recipients,
              sendSessionEndEmail: notificationOptions.sendSessionEndEmail,
              sendAbsenceEmail: notificationOptions.sendAbsenceEmail,
              attachReport: notificationOptions.attachReport,
            },
          },
        }
      );
    }

    const memberCountAtStart = await User.countDocuments({ organizationIds: organizationId });
    const session = await createQRSession(
      adminUserId,
      organizationId,
      duration,
      refreshInt,
      memberCountAtStart,
      notificationOptions
    );

    const creatorOrgIds = creator?.organizationIds || [];
    const effectiveCreatorOrgId =
      creator?.currentOrganizationId && creatorOrgIds.includes(creator.currentOrganizationId)
        ? creator.currentOrganizationId
        : creatorOrgIds[0] || null;
    const isCreatorMemberInOrg = creatorOrgIds.includes(organizationId);
    const isCreatorAdminInOrg = (creator?.userOrgRoles || []).some(
      (role) => role.organizationId === organizationId && role.role === "admin"
    );
    const isCreatorInOwnOrgContext =
      isCreatorMemberInOrg &&
      effectiveCreatorOrgId === organizationId &&
      isCreatorAdminInOrg;

    let hostAutoMarkApplied = false;
    let hostAutoMarkReason = "ineligible_context";
    let hostAutoAttendanceId: string | null = null;

    if (isCreatorInOwnOrgContext) {
      const autoMarkResult = await ensureSessionCreatorAttendance(session.sessionId, adminUserId);

      if (autoMarkResult.created) {
        hostAutoMarkApplied = true;
        hostAutoMarkReason = "created";
        hostAutoAttendanceId = autoMarkResult.attendanceId || null;

        emitToSession(session.sessionId, "attendance:update", {
          attendanceId: autoMarkResult.attendanceId,
          sessionId: session.sessionId,
          userId: adminUserId,
          name: creator?.name,
          email: creator?.email,
          markedAt: autoMarkResult.markedAt,
        });

        await logAudit({
          action: "attendance_marked",
          performedBy: adminUserId,
          performedByName: creator?.name,
          performedByEmail: creator?.email,
          targetId: session.sessionId,
          targetResourceType: "session",
          targetResourceName: `Auto-marked session host for ${session.sessionId}`,
          organizationId,
          metadata: {
            attendanceId: autoMarkResult.attendanceId,
            sessionId: session.sessionId,
            mode: "auto_host_on_session_create",
          },
          details: {
            sessionCode: session.sessionId,
            changesSummary: "Automatically marked session creator present.",
            result: "success",
          },
        });
      } else {
        hostAutoMarkReason = autoMarkResult.reason || "already_marked";
      }
    } else {
      if (!isCreatorMemberInOrg) {
        hostAutoMarkReason = "creator_not_org_member";
      } else if (!isCreatorAdminInOrg) {
        hostAutoMarkReason = "creator_not_org_admin";
      } else if (effectiveCreatorOrgId !== organizationId) {
        hostAutoMarkReason = "not_current_org_context";
      }

      logger.info("Host auto-attendance skipped: creator is not in own org context", {
        requestId: req.requestId,
        adminUserId,
        organizationId,
        currentOrganizationId: creator?.currentOrganizationId || null,
        effectiveCreatorOrgId,
        hostAutoMarkReason,
      });
    }

    logger.info("Session created", {
      requestId: req.requestId,
      adminUserId,
      sessionId: session.sessionId,
      duration,
      refreshInterval: refreshInt,
    });

    // Start QR rotation for this session
    await startSessionRotation(session.sessionId);

    // Emit to specific session room
    emitToSession(session.sessionId, "session:started", {
      sessionId: session.sessionId,
      startTime: session.startTime,
      endTime: session.endTime,
      duration: session.duration,
    });

    // Broadcast to all admins for auto-refresh in AbsenceReport and SessionHistory
    broadcastToAdmins("session:created", {
      sessionId: session.sessionId,
      startTime: session.startTime,
      endTime: session.endTime,
      duration: session.duration,
    });

    const adminUser = await User.findOne({ userId: adminUserId }).select("name email").lean();
    await logAudit({
      action: "session_created",
      performedBy: adminUserId,
      performedByName: adminUser?.name || creator?.name,
      performedByEmail: adminUser?.email || creator?.email,
      targetId: session.sessionId,
      targetResourceType: "session",
      targetResourceName: `Session for ${duration} minutes`,
      organizationId,
      metadata: {
        duration,
        refreshInterval: refreshInt,
        startTime: session.startTime,
        endTime: session.endTime,
        notification: {
          recipientsCount: notificationOptions.recipients.length,
          useOrgDefaultRecipients: notificationOptions.useOrgDefaultRecipients,
          sendSessionEndEmail: notificationOptions.sendSessionEndEmail,
          sendAbsenceEmail: notificationOptions.sendAbsenceEmail,
          attachReport: notificationOptions.attachReport,
        },
        hostAutoMarkApplied,
        hostAutoMarkReason,
        hostAutoAttendanceId,
      },
      details: {
        sessionCode: session.sessionId,
        sessionStatus: "active",
        changesSummary: `Created new QR session with ${duration} min duration`,
      },
    });

    return res.status(201).json({
      message: "QR session created successfully.",
      session,
    });
  } catch (error) {
    console.error("[Create Session] Error:", error);
    return res.status(500).json({
      message: "Failed to create QR session.",
    });
  }
};

/**
 * [ADMIN] Get all active sessions
 * GET /api/admin/sessions
 */
export const listActiveSessions = async (req: Request, res: Response) => {
  try {
    const orgContext = resolveOrganizationId(req);
    if (!orgContext.organizationId) {
      return res.status(orgContext.status || 400).json({ message: orgContext.message || "Organization not found." });
    }
    const organizationId = orgContext.organizationId;
    const sessions = await Session.find({ organizationId, isActive: true })
      .sort({ createdAt: -1 })
      .lean();
    const sessionsWithCounts = await addAttendanceCounts(sessions, organizationId);
    return res.json({ sessions: sessionsWithCounts });
  } catch (error) {
    console.error("[List Sessions] Error:", error);
    return res.status(500).json({
      message: "Failed to fetch active sessions.",
    });
  }
};

/**
 * [ADMIN] Get all sessions (active and ended)
 * GET /api/admin/sessions/all
 */
export const listAllSessions = async (req: Request, res: Response) => {
  try {
    const orgContext = resolveOrganizationId(req);
    if (!orgContext.organizationId) {
      return res.status(orgContext.status || 400).json({ message: orgContext.message || "Organization not found." });
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filterParamRaw =
      typeof req.query.filter === "string" ? req.query.filter.trim().toLowerCase() : "all";
    const filter: "all" | "active" | "ended" =
      filterParamRaw === "active" || filterParamRaw === "ended" ? filterParamRaw : "all";

    const searchRaw = typeof req.query.search === "string" ? req.query.search.trim() : "";

    const organizationId = orgContext.organizationId;

    const query: Record<string, unknown> = { organizationId };
    if (filter === "active") {
      query.isActive = true;
    } else if (filter === "ended") {
      query.isActive = false;
    }

    if (searchRaw.length > 0) {
      query.sessionId = {
        $regex: escapeRegExp(searchRaw),
        $options: "i",
      };
    }

    const [sessions, total] = await Promise.all([
      Session.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Session.countDocuments(query),
    ]);

    const sessionsWithCounts = await addAttendanceCounts(sessions, organizationId);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return res.json({
      sessions: sessionsWithCounts,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      filters: {
        filter,
        search: searchRaw || null,
      },
    });
  } catch (error) {
    console.error("[List All Sessions] Error:", error);
    return res.status(500).json({
      message: "Failed to fetch sessions.",
    });
  }
};

/**
 * [ADMIN] Get session with live attendance count
 * GET /api/admin/session/:sessionId
 */
export const getSessionStatus = async (req: Request, res: Response) => {
  try {
    const sessionIdParam = req.params.sessionId;
    
    if (!sessionIdParam || typeof sessionIdParam !== "string") {
      return res.status(400).json({
        message: "Session ID is required.",
      });
    }

    if (!(await canAccessSessionInCurrentOrg(req, sessionIdParam))) {
      return res.status(403).json({ message: "Forbidden: session is outside current organization." });
    }

    const sessionData = await getSessionWithAttendance(
      sessionIdParam,
      Attendance
    );

    return res.json({
      session: sessionData,
    });
  } catch (error) {
    console.error("[Get Session Status] Error:", error);
    return res.status(500).json({
      message: "Failed to fetch session status.",
    });
  }
};

/**
 * [ADMIN] Get QR image (structured payload) for session
 * GET /api/admin/session/:sessionId/qr
 */
export const getSessionQRImage = async (req: Request, res: Response) => {
  try {
    const sessionIdParam = req.params.sessionId;
    if (!sessionIdParam || typeof sessionIdParam !== "string") {
      return res.status(400).json({ message: "Session ID is required." });
    }

    if (!(await canAccessSessionInCurrentOrg(req, sessionIdParam))) {
      return res.status(403).json({ message: "Forbidden: session is outside current organization." });
    }

    const session = await getSession(sessionIdParam);
    if (!session || !session.isActive) {
      return res.status(404).json({
        message: "Session not found or not active.",
      });
    }

    // Check if session has expired
    const now = new Date();
    if (session.endTime <= now) {
      return res.status(410).json({
        message: "Session has expired.",
      });
    }

    const token = await getQRToken(sessionIdParam);
    if (!token) {
      return res.status(503).json({
        message: "QR not ready. Try again in a moment.",
      });
    }

    // Return the cached QR image (generated during rotation) so every
    // consumer sees the identical QR code for the current rotation cycle.
    const cached = await getCachedQRImage(sessionIdParam);
    if (cached) {
      return res.json(cached);
    }

    // Fallback: generate fresh if cache miss (first rotation / cold start)
    const { qrImage, expiresAt } = await generateQRImage(
      sessionIdParam, 
      token, 
      session.refreshInterval
    );
    return res.json({ qrImage, expiresAt });
  } catch (error) {
    console.error("[Get Session QR] Error:", error);
    return res.status(500).json({
      message: "Failed to generate QR image.",
    });
  }
};

/**
 * [ADMIN] Get live attendance for session
 * GET /api/admin/session/:sessionId/attendance
 */
export const getSessionAttendance = async (req: Request, res: Response) => {
  try {
    const sessionIdParam = req.params.sessionId;
    
    if (!sessionIdParam || typeof sessionIdParam !== "string") {
      return res.status(400).json({
        message: "Session ID is required.",
      });
    }

    if (!(await canAccessSessionInCurrentOrg(req, sessionIdParam))) {
      return res.status(403).json({ message: "Forbidden: session is outside current organization." });
    }

    const session = await Session.findOne({ sessionId: sessionIdParam });
    if (!session) {
      return res.status(404).json({
        message: "Session not found.",
      });
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const [attendanceRecords, total, currentMemberCount] = await Promise.all([
      Attendance.find({ sessionId: sessionIdParam })
        .sort({ markedAt: -1 })
        .skip(skip)
        .limit(limit),
      Attendance.countDocuments({ sessionId: sessionIdParam }),
      User.countDocuments({
        organizationIds: session.organizationId,
      }),
    ]);

    const totalMember = session.memberCountAtStart || currentMemberCount;

    // Get user details for each attendance
    const attendanceWithUsers = await Promise.all(
      attendanceRecords.map(async (record) => {
        const user = await User.findOne({ userId: record.userId });
        return {
          attendanceId: record.attendanceId,
          userId: record.userId,
          name: user?.name,
          email: user?.email,
          markedAt: record.markedAt,
        };
      })
    );

    // Get recent check-ins (last 5)
    const recentCheckIns = await Attendance.find({ sessionId: sessionIdParam })
      .sort({ markedAt: -1 })
      .limit(5);

    const recentWithUsers = await Promise.all(
      recentCheckIns.map(async (record) => {
        const user = await User.findOne({ userId: record.userId });
        return {
          attendanceId: record.attendanceId,
          userId: record.userId,
          name: user?.name,
          email: user?.email,
          markedAt: record.markedAt,
        };
      })
    );

    return res.json({
      sessionId: sessionIdParam,
      totalMember,
      totalMarked: total,
      page,
      limit,
      attendance: attendanceWithUsers,
      recentCheckIns: recentWithUsers,
    });
  } catch (error) {
    console.error("[Get Session Attendance] Error:", error);
    return res.status(500).json({
      message: "Failed to fetch session attendance.",
    });
  }
};

/**
 * [MEMBER] Mark attendance by scanning QR
 * POST /api/attendance/mark
 */
export const markAttendance = async (req: Request, res: Response) => {
  try {
    const { sessionId: rawSessionId, qrToken: rawQrToken, expiresAt } = req.body;
    const userId = req.user?.userId;
    const sessionId = normalizeSessionId(String(rawSessionId || ""));
    const qrToken = String(rawQrToken || "").trim();
    const isManualSessionIdEntry = (() => {
      if (!sessionId || !qrToken) return false;
      const tokenNormalized = qrToken.toUpperCase();
      const fullId = sessionId.toUpperCase();
      const coreId = toSessionCore(fullId);
      return tokenNormalized === fullId || tokenNormalized === coreId;
    })();

    logger.info("Attendance mark attempt", {
      requestId: req.requestId,
      userId,
      sessionId,
    });

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!sessionId || !qrToken) {
      return res.status(400).json({
        message: "Session ID and QR token are required.",
      });
    }

    const now = Date.now();
    if (typeof expiresAt === "number" && now > expiresAt) {
      return res.status(401).json({
        message: "QR code has expired. Please scan the latest code.",
      });
    }

    // ✅ 1. Verify session exists and is active
    const session = await getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        message: "Session not found or has ended.",
      });
    }

    if (!(req.user?.organizationIds || []).includes(session.organizationId)) {
      return res.status(403).json({
        message: "You are not a member of this session's organization.",
      });
    }

    const activeOrgId = req.user?.currentOrganizationId || req.user?.organizationIds?.[0];
    if (activeOrgId && session.organizationId !== activeOrgId) {
      return res.status(403).json({
        message: "Switch to the session's organization to mark attendance.",
      });
    }

    // ✅ 2. Verify QR token matches Redis (unless manual session ID entry is used)
    if (!isManualSessionIdEntry) {
      const isValidToken = await verifyQRToken(sessionId, qrToken);
      if (!isValidToken) {
        logger.warn("Attendance mark failed: invalid QR token", {
          requestId: req.requestId,
          userId,
          sessionId,
        });
        return res.status(401).json({
          message: "Invalid or expired QR token.",
        });
      }

      const used = await isTokenUsed(sessionId, userId, qrToken);
      if (used) {
        logger.warn("Attendance mark failed: reused QR token", {
          requestId: req.requestId,
          userId,
          sessionId,
        });
        return res.status(401).json({
          message: "This QR code has already been used.",
        });
      }
    } else {
      logger.info("Attendance manual fallback used", {
        requestId: req.requestId,
        userId,
        sessionId,
      });
    }

    // ✅ 3. Check if user already marked
    const existingAttendance = await Attendance.findOne({
      sessionId,
      userId,
    });

    if (existingAttendance) {
      logger.warn("Attendance mark failed: duplicate attendance", {
        requestId: req.requestId,
        userId,
        sessionId,
      });
      return res.status(409).json({
        message: "You have already marked attendance for this session.",
      });
    }

    // ✅ 4. Create attendance lock to prevent race conditions
    const lockCreated = await createAttendanceLock(sessionId, userId);
    if (!lockCreated) {
      logger.warn("Attendance mark failed: attendance lock not acquired", {
        requestId: req.requestId,
        userId,
        sessionId,
      });
      return res.status(409).json({
        message: "Attendance already being processed.",
      });
    }

      if (!isManualSessionIdEntry) {
        await markTokenAsUsed(sessionId, userId, qrToken);
    }

    // ✅ 5. Create attendance record
    const attendanceId = generateAttendanceId();
    const attendance = new Attendance({
      attendanceId,
      sessionId,
      userId,
      markedAt: new Date(),
    });

    await attendance.save();

    const attendanceWithUser = await User.findOne({ userId }).then((u) => ({
      attendanceId,
      sessionId,
      userId,
      name: u?.name,
      email: u?.email,
      markedAt: attendance.markedAt,
    }));

    emitToSession(sessionId, "attendance:update", attendanceWithUser);

    const memberUser = await User.findOne({ userId }).select("name email").lean();
    await logAudit({
      action: "attendance_marked",
      performedBy: userId,
      performedByName: memberUser?.name,
      performedByEmail: memberUser?.email,
      targetId: sessionId,
      targetResourceType: "session",
      targetResourceName: `Attendance for ${memberUser?.name || userId}`,
      organizationId: session.organizationId,
      metadata: {
        attendanceId,
        sessionId,
      },
      details: {
        sessionCode: sessionId,
        changesSummary: `Marked attendance for ${memberUser?.name || "Unknown"}`,
        result: "success",
      },
    });

    logger.info("Attendance marked", {
      requestId: req.requestId,
      userId,
      sessionId,
      attendanceId,
    });


    return res.status(201).json({
      message: "Attendance marked successfully.",
      attendance: {
        attendanceId,
        sessionId,
        userId,
        markedAt: attendance.markedAt,
      },
    });
  } catch (error) {
    console.error("[Mark Attendance] Error:", error);
    return res.status(500).json({
      message: "Failed to mark attendance.",
    });
  }
};

/**
 * [MEMBER] Get current active session (for QR scanning)
 * GET /api/attendance/active-session
 */
export const getActiveSession = async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.currentOrganizationId || req.user?.organizationIds?.[0];
    if (!organizationId) {
      return res.status(404).json({ message: "No active organization selected." });
    }

    const sessions = await Session.find({ isActive: true, organizationId }).sort({ createdAt: -1 }).lean();

    if (sessions.length === 0) {
      return res.status(404).json({
        message: "No active session available.",
      });
    }

    // Return the most recent active session
    const activeSession = sessions[0];

    return res.json({
      sessionId: activeSession.sessionId,
      startTime: activeSession.startTime,
      endTime: activeSession.endTime,
      timeRemaining: Math.max(
        0,
        Math.floor((activeSession.endTime.getTime() - Date.now()) / 1000)
      ),
    });
  } catch (error) {
    console.error("[Get Active Session] Error:", error);
    return res.status(500).json({
      message: "Failed to fetch active session.",
    });
  }
};

/**
 * [ADMIN] Manually end a session
 * POST /api/admin/session/:sessionId/end
 */
export const endSessionController = async (req: Request, res: Response) => {
  try {
    const adminUserId = req.user?.userId;
    if (!adminUserId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const { sessionId } = req.params;
    if (!sessionId || typeof sessionId !== "string") {
      return res.status(400).json({ message: "Session ID is required." });
    }

    if (!(await canAccessSessionInCurrentOrg(req, sessionId))) {
      return res.status(403).json({ message: "Forbidden: session is outside current organization." });
    }

    // Get session to log organizationId in audit
    const session = await getSession(sessionId);
    if (!session) {
      return res.status(404).json({ message: "Session not found." });
    }

    // Stop the QR rotation for this session
    stopSessionRotation(sessionId);

    // Mark session as inactive in the database
    await endSession(sessionId, adminUserId);

    const totalMarked = await Attendance.countDocuments({ sessionId });
    const creator = await User.findOne({ userId: session.createdBy }).select("email").lean();
    const configuredRecipients = Array.isArray((session as any)?.notification?.recipients)
      ? (session as any).notification.recipients
      : [];
    const includeCreator = (session as any)?.notification?.includeCreator !== false;
    const sendSessionEndEmail = (session as any)?.notification?.sendSessionEndEmail !== false;
    const sendAbsenceEmail = (session as any)?.notification?.sendAbsenceEmail !== false;
    const attachReportRaw = (session as any)?.notification?.attachReport ?? (session as any)?.notification?.attachCsv;
    const attachReport = attachReportRaw !== false;

    const recipients = Array.from(
      new Set(
        [
          ...configuredRecipients,
          ...(includeCreator && creator?.email ? [creator.email] : []),
        ]
          .map((email) => String(email || "").trim().toLowerCase())
          .filter(Boolean)
      )
    );

    const absenceSummary = await AbsenceService.detectAbsences(sessionId);
    const sessionReportXlsx = attachReport ? await buildSessionAttendanceReportXlsx(sessionId) : null;
    const absenceReportXlsx = attachReport ? await buildSessionAbsenceReportXlsx(sessionId) : null;

    if (sendSessionEndEmail && recipients.length > 0) {
      await sendSessionEndSummaryEmail(recipients, sessionId, totalMarked, {
        organizationId: session.organizationId,
        triggeredBy: adminUserId,
        sessionDuration: session.duration,
        totalAbsent: absenceSummary.absent,
        totalMember: absenceSummary.totalMember,
        ...(sessionReportXlsx
          ? {
            reportAttachment: {
              filename: `session-report-${sessionId}.xlsx`,
              content: sessionReportXlsx,
              contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              contentEncoding: "base64",
            },
          }
          : {}),
      });
    }

    if (sendAbsenceEmail && recipients.length > 0) {
      await sendAbsenceDetectionEmail(recipients, sessionId, absenceSummary.absent, {
        organizationId: session.organizationId,
        triggeredBy: adminUserId,
        totalMember: absenceSummary.totalMember,
        attended: absenceSummary.attended,
        ...(absenceReportXlsx
          ? {
            reportAttachment: {
              filename: `absence-report-${sessionId}.xlsx`,
              content: absenceReportXlsx,
              contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              contentEncoding: "base64" as const,
            },
          }
          : {}),
      });
    }

    // Emit session ended event to clients in this specific session
    emitToSession(sessionId, "session:ended", { sessionId });
    
    // Broadcast to all admins for auto-refresh
    broadcastToAdmins("session:ended", { sessionId });

    // Log the action (using session_deleted as it's the same action)
    const adminUser = await User.findOne({ userId: adminUserId }).select("name email").lean();
    await logAudit({
      action: "session_deleted",
      performedBy: adminUserId,
      performedByName: adminUser?.name,
      performedByEmail: adminUser?.email,
      targetId: sessionId,
      targetResourceType: "session",
      targetResourceName: `Session ended manually`,
      organizationId: session.organizationId,
      details: {
        sessionCode: sessionId,
        sessionStatus: "completed",
        changesSummary: `Manually ended session ${sessionId}`,
        result: "success",
      },
    });

    logger.info(`[End Session] Session ${sessionId} ended manually by admin ${adminUserId}`);

    return res.json({
      success: true,
      message: "Session ended successfully.",
      sessionId,
    });
  } catch (error) {
    console.error("[End Session] Error:", error);
    logger.error(`[End Session] Error ending session: ${error}`);
    return res.status(500).json({
      message: "Failed to end session.",
    });
  }
};

/**
 * [MEMBER] Get my attendance history
 * GET /api/attendance/my-history
 */
export const getMyAttendanceHistory = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const orgContext = resolveOrganizationId(req);
    if (!orgContext.organizationId) {
      return res.status(orgContext.status || 400).json({ message: orgContext.message || "Organization not found." });
    }
    const organizationId = orgContext.organizationId;

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const orgSessionDocs = await Session.find({ organizationId }).select("sessionId").lean();
    const orgSessionIds = orgSessionDocs.map((s: any) => s.sessionId);

    if (orgSessionIds.length === 0) {
      return res.json({
        attendance: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      });
    }

    const attendanceFilter = { userId, sessionId: { $in: orgSessionIds } };

    const [attendanceRecords, absenceRecords] = await Promise.all([
      Attendance.find(attendanceFilter)
        .sort({ markedAt: -1 })
        .lean(),
      Absence.find({
        memberId: userId,
        sessionId: { $in: orgSessionIds },
        markedManually: { $ne: true },
      })
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const attendedSessionIds = new Set(attendanceRecords.map((record: any) => record.sessionId));

    const combined = [
      ...attendanceRecords.map((record: any) => ({
        historyId: `att-${record.attendanceId}`,
        attendanceId: record.attendanceId,
        absenceId: null,
        sessionId: record.sessionId,
        markedAt: record.markedAt,
        status: "attended" as const,
        reason: null,
      })),
      ...absenceRecords
        .filter((record: any) => !attendedSessionIds.has(record.sessionId))
        .map((record: any) => ({
          historyId: `abs-${record._id}`,
          attendanceId: null,
          absenceId: String(record._id),
          sessionId: record.sessionId,
          markedAt: record.createdAt,
          status: (record.isExcused ? "excused" : "absent") as "excused" | "absent",
          reason: record.reason || null,
        })),
    ].sort((a, b) => new Date(b.markedAt).getTime() - new Date(a.markedAt).getTime());

    const total = combined.length;
    const records = combined.slice(skip, skip + limit);

    // Enrich with session details
    const sessionIds = [...new Set(records.map((r) => r.sessionId))];
    const sessions = await Session.find({ organizationId, sessionId: { $in: sessionIds } }).lean();
    const sessionMap = new Map(sessions.map((s) => [s.sessionId, s]));

    const enriched = records.map((record) => {
      const session = sessionMap.get(record.sessionId);
      return {
        historyId: record.historyId,
        attendanceId: record.attendanceId,
        absenceId: record.absenceId,
        sessionId: record.sessionId,
        markedAt: record.markedAt,
        status: record.status,
        reason: record.reason,
        session: session
          ? {
              startTime: session.startTime,
              endTime: session.endTime,
              duration: session.duration,
              isActive: session.isActive,
              organizationId: session.organizationId,
            }
          : null,
      };
    });

    return res.json({
      attendance: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("[Get My Attendance History] Error:", error);
    return res.status(500).json({
      message: "Failed to fetch attendance history.",
    });
  }
};

/**
 * [MEMBER] Get my attendance stats
 * GET /api/attendance/my-stats
 */
export const getMyAttendanceStats = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const orgContext = resolveOrganizationId(req);
    if (!orgContext.organizationId) {
      return res.status(orgContext.status || 400).json({ message: orgContext.message || "Organization not found." });
    }
    const organizationId = orgContext.organizationId;

    const orgSessionDocs = await Session.find({ organizationId }).select("sessionId").lean();
    const orgSessionIds = orgSessionDocs.map((s: any) => s.sessionId);

    if (orgSessionIds.length === 0) {
      return res.json({
        totalAttended: 0,
        totalSessions: 0,
        attendanceRate: 0,
        recent: [],
      });
    }

    const attendanceFilter = { userId, sessionId: { $in: orgSessionIds } };

    const [totalAttended, totalSessions, recentRecords] = await Promise.all([
      Attendance.countDocuments(attendanceFilter),
      Session.countDocuments({ organizationId }),
      Attendance.find(attendanceFilter)
        .sort({ markedAt: -1 })
        .lean(),
    ]);

    const recentAbsenceRecords = await Absence.find({
      memberId: userId,
      sessionId: { $in: orgSessionIds },
      markedManually: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .lean();

    const attendedSessionIdsForRecent = new Set(recentRecords.map((r: any) => r.sessionId));

    const combinedRecent = [
      ...recentRecords.map((record: any) => ({
        historyId: `att-${record.attendanceId}`,
        attendanceId: record.attendanceId,
        sessionId: record.sessionId,
        markedAt: record.markedAt,
        status: "attended" as const,
        reason: null,
      })),
      ...recentAbsenceRecords
        .filter((record: any) => !attendedSessionIdsForRecent.has(record.sessionId))
        .map((record: any) => ({
          historyId: `abs-${record._id}`,
          attendanceId: null,
          sessionId: record.sessionId,
          markedAt: record.createdAt,
          status: (record.isExcused ? "excused" : "absent") as "excused" | "absent",
          reason: record.reason || null,
        })),
    ]
      .sort((a, b) => new Date(b.markedAt).getTime() - new Date(a.markedAt).getTime())
      .slice(0, 5);

    // Enrich recent records with session details
    const recentSessionIds = combinedRecent.map((r) => r.sessionId);
    const recentSessions = await Session.find({ organizationId, sessionId: { $in: recentSessionIds } }).lean();
    const sessionMap = new Map(recentSessions.map((s) => [s.sessionId, s]));

    const recent = combinedRecent.map((record) => {
      const session = sessionMap.get(record.sessionId);
      return {
        historyId: record.historyId,
        attendanceId: record.attendanceId,
        sessionId: record.sessionId,
        markedAt: record.markedAt,
        status: record.status,
        reason: record.reason,
        sessionDuration: session?.duration,
        sessionOrg: session?.organizationId,
      };
    });

    const attendanceRate = totalSessions > 0
      ? Math.round((totalAttended / totalSessions) * 100)
      : 0;

    return res.json({
      totalAttended,
      totalSessions,
      attendanceRate,
      recent,
    });
  } catch (error) {
    console.error("[Get My Attendance Stats] Error:", error);
    return res.status(500).json({
      message: "Failed to fetch attendance stats.",
    });
  }
};

/**
 * [ADMIN] Update session details (duration, refreshInterval)
 * PATCH /api/admin/session/:sessionId
 */
export const updateSessionController = async (req: Request, res: Response) => {
  try {
    const adminUserId = req.user?.userId;
    if (!adminUserId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const { sessionId } = req.params;
    if (!sessionId || typeof sessionId !== "string") {
      return res.status(400).json({ message: "Session ID is required." });
    }

    if (!(await canAccessSessionInCurrentOrg(req, sessionId))) {
      return res.status(403).json({ message: "Forbidden: session is outside current organization." });
    }

    const session = await Session.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ message: "Session not found." });
    }

    const { duration, refreshInterval } = req.body;
    const changes: string[] = [];
    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};

    if (duration !== undefined) {
      if (typeof duration !== "number" || duration <= 0) {
        return res.status(400).json({ message: "Invalid duration. Must be a positive number (minutes)." });
      }
      if (duration > MAX_SESSION_DURATION_MINUTES) {
        return res.status(400).json({
          message: `Invalid duration. Must be ${MAX_SESSION_DURATION_MINUTES} minutes or less.`,
        });
      }
      oldValues.duration = session.duration;
      newValues.duration = duration;
      session.duration = duration;
      // Recalculate endTime based on startTime + new duration
      session.endTime = new Date(session.startTime.getTime() + duration * 60 * 1000);
      changes.push(`Duration: ${oldValues.duration}m → ${duration}m`);
    }

    if (refreshInterval !== undefined) {
      if (typeof refreshInterval !== "number" || refreshInterval < 5 || refreshInterval > 60) {
        return res.status(400).json({ message: "Invalid refreshInterval. Must be between 5 and 60 seconds." });
      }
      oldValues.refreshInterval = session.refreshInterval;
      newValues.refreshInterval = refreshInterval;
      session.refreshInterval = refreshInterval;
      changes.push(`QR Refresh: ${oldValues.refreshInterval}s → ${refreshInterval}s`);
    }

    if (changes.length === 0) {
      return res.status(400).json({ message: "No valid fields to update." });
    }

    await session.save();

    // If session is active and refresh interval changed, restart rotation
    if (session.isActive && newValues.refreshInterval !== undefined) {
      stopSessionRotation(sessionId);
      await startSessionRotation(sessionId);
    }

    // Broadcast update to admins
    broadcastToAdmins("session:updated", {
      sessionId,
      duration: session.duration,
      endTime: session.endTime,
      refreshInterval: session.refreshInterval,
    });

    const adminUser = await User.findOne({ userId: adminUserId }).select("name email").lean();
    await logAudit({
      action: "session_updated",
      performedBy: adminUserId,
      performedByName: adminUser?.name,
      performedByEmail: adminUser?.email,
      targetId: sessionId,
      targetResourceType: "session",
      targetResourceName: `Session ${sessionId}`,
      organizationId: session.organizationId,
      metadata: { oldValues, newValues },
      details: {
        sessionCode: sessionId,
        sessionStatus: session.isActive ? "active" : "ended",
        changesSummary: `Updated session: ${changes.join(", ")}`,
        result: "success",
      },
    });

    logger.info(`[Update Session] Session ${sessionId} updated by admin ${adminUserId}: ${changes.join(", ")}`);

    return res.json({
      success: true,
      message: "Session updated successfully.",
      session: {
        sessionId: session.sessionId,
        duration: session.duration,
        refreshInterval: session.refreshInterval,
        startTime: session.startTime,
        endTime: session.endTime,
        isActive: session.isActive,
      },
    });
  } catch (error) {
    console.error("[Update Session] Error:", error);
    return res.status(500).json({ message: "Failed to update session." });
  }
};

/**
 * [ADMIN] Permanently delete a session and all its attendance records
 * DELETE /api/admin/session/:sessionId
 */
export const deleteSessionController = async (req: Request, res: Response) => {
  try {
    const adminUserId = req.user?.userId;
    if (!adminUserId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const { sessionId } = req.params;
    if (!sessionId || typeof sessionId !== "string") {
      return res.status(400).json({ message: "Session ID is required." });
    }

    if (!(await canAccessSessionInCurrentOrg(req, sessionId))) {
      return res.status(403).json({ message: "Forbidden: session is outside current organization." });
    }

    const session = await Session.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ message: "Session not found." });
    }

    // If session is still active, stop rotation first
    if (session.isActive) {
      stopSessionRotation(sessionId);
      emitToSession(sessionId, "session:ended", { sessionId });
    }

    // Count attendance records before deletion
    const attendanceCount = await Attendance.countDocuments({ sessionId });
    const absenceCount = await Absence.countDocuments({ sessionId });
    const notificationCount = await EmailNotification.countDocuments({ sessionId });

    // Delete all related records
    await Promise.all([
      Attendance.deleteMany({ sessionId }),
      Absence.deleteMany({ sessionId }),
      EmailNotification.deleteMany({ sessionId }),
      Session.deleteOne({ sessionId }),
    ]);

    // Broadcast to admins
    broadcastToAdmins("session:deleted", { sessionId });

    const adminUser = await User.findOne({ userId: adminUserId }).select("name email").lean();
    await logAudit({
      action: "session_permanently_deleted",
      performedBy: adminUserId,
      performedByName: adminUser?.name,
      performedByEmail: adminUser?.email,
      targetId: sessionId,
      targetResourceType: "session",
      targetResourceName: `Session ${sessionId} (permanently deleted)`,
      organizationId: session.organizationId,
      metadata: {
        duration: session.duration,
        startTime: session.startTime,
        endTime: session.endTime,
        wasActive: session.isActive,
        attendanceRecordsDeleted: attendanceCount,
        absenceRecordsDeleted: absenceCount,
        notificationHistoryDeleted: notificationCount,
      },
      details: {
        sessionCode: sessionId,
        sessionStatus: "deleted",
        affectedUsersCount: attendanceCount,
        changesSummary: `Permanently deleted session ${sessionId} with ${attendanceCount} attendance, ${absenceCount} absence, and ${notificationCount} notification history records`,
        result: "success",
      },
    });

    logger.info(`[Delete Session] Session ${sessionId} permanently deleted by admin ${adminUserId}`);

    return res.json({
      success: true,
      message: "Session permanently deleted.",
      sessionId,
      deletedRecords: {
        attendance: attendanceCount,
        absences: absenceCount,
        notifications: notificationCount,
      },
    });
  } catch (error) {
    console.error("[Delete Session] Error:", error);
    return res.status(500).json({ message: "Failed to delete session." });
  }
};

/**
 * [ADMIN] Export session attendance as CSV
 * GET /api/admin/session/:sessionId/export
 */
export const exportSessionAttendance = async (req: Request, res: Response) => {
  try {
    const adminUserId = req.user?.userId;
    if (!adminUserId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const sessionId = req.params.sessionId as string;
    if (!sessionId) {
      return res.status(400).json({ message: "Session ID is required." });
    }

    if (!(await canAccessSessionInCurrentOrg(req, sessionId))) {
      return res.status(403).json({ message: "Forbidden: session is outside current organization." });
    }

    const session = await Session.findOne({ sessionId }).lean();
    if (!session) {
      return res.status(404).json({ message: "Session not found." });
    }

    const csv = await buildSessionAttendanceCsv(sessionId);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="attendance-${sessionId}.csv"`);
    return res.send(csv);
  } catch (error) {
    console.error("[Export Session Attendance] Error:", error);
    return res.status(500).json({
      message: "Failed to export attendance.",
    });
  }
};
