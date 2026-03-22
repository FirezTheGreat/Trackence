import Session from "../models/Session.model";
import User from "../models/User.model";
import { generateSessionId } from "../utils/id.utils";
import {
  generateQRToken,
  setQRToken,
  cleanupSessionQR,
} from "./qr.service";
import { logAudit } from "./audit.service";

/**
 * Create a new QR session
 */
export const createQRSession = async (
  adminUserId: string,
  organizationId: string,
  durationMinutes: number,
  refreshInterval: number = 10,
  memberCountAtStart?: number | null,
  notification?: {
    recipients: string[];
    includeCreator: boolean;
    sendSessionEndEmail: boolean;
    sendAbsenceEmail: boolean;
    attachReport: boolean;
    inheritedDefaultRecipients: string[];
  }
) => {
  try {
    const sessionId = generateSessionId();
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

    const session = new Session({
      sessionId,
      organizationId,
      createdBy: adminUserId,
      startTime,
      endTime,
      duration: durationMinutes,
      refreshInterval,
      isActive: true,
      memberCountAtStart: memberCountAtStart ?? null,
      notification: notification || {
        recipients: [],
        includeCreator: true,
        sendSessionEndEmail: true,
        sendAbsenceEmail: true,
        attachReport: true,
        inheritedDefaultRecipients: [],
      },
    });

    await session.save();

    // Generate initial QR token
    const initialToken = generateQRToken();
    await setQRToken(sessionId, initialToken);

    return {
      sessionId,
      startTime,
      endTime,
      duration: durationMinutes,
      refreshInterval,
      token: initialToken,
      notification: session.notification,
    };
  } catch (error) {
    throw new Error(`Failed to create QR session: ${error}`);
  }
};

/**
 * Get active session by ID
 */
export const getSession = async (sessionId: string) => {
  try {
    const session = await Session.findOne({
      sessionId,
      isActive: true,
    });
    return session;
  } catch (error) {
    throw new Error(`Failed to fetch session: ${error}`);
  }
};

/**
 * Get all active sessions
 */
export const getActiveSessions = async () => {
  try {
    const sessions = await Session.find({
      isActive: true,
    }).sort({ createdAt: -1 });
    return sessions;
  } catch (error) {
    throw new Error(`Failed to fetch active sessions: ${error}`);
  }
};

/**
 * Get session with live attendance count
 */
export const getSessionWithAttendance = async (
  sessionId: string,
  attendanceModel: any
) => {
  try {
    const session = await Session.findOne({ sessionId });
    if (!session) {
      throw new Error("Session not found");
    }

    const [attendanceCount, creator, totalFaculty] = await Promise.all([
      attendanceModel.countDocuments({ sessionId }),
      User.findOne({ userId: session.createdBy }).select("userId name email").lean(),
      User.countDocuments({
        organizationIds: session.organizationId,
      }),
    ]);

    const denominator = Math.max(session.memberCountAtStart || totalFaculty, attendanceCount);
    const attendanceRate = denominator > 0
      ? Math.round((attendanceCount / denominator) * 100)
      : 0;

    return {
      ...session.toObject(),
      attendanceCount,
      checkedInCount: attendanceCount,
      totalFaculty: session.memberCountAtStart || totalFaculty,
      attendanceRate,
      createdByName: creator?.name ?? null,
      createdByEmail: creator?.email ?? null,
      timeRemaining: Math.max(
        0,
        Math.floor((session.endTime.getTime() - Date.now()) / 1000)
      ),
    };
  } catch (error) {
    throw new Error(`Failed to fetch session with attendance: ${error}`);
  }
};

/**
 * End session (called when duration expires or manually)
 * @param sessionId - Session to end
 * @param performedBy - User or "system" for auto-expiry
 */
export const endSession = async (
  sessionId: string,
  performedBy: string = "system"
) => {
  try {
    // Get session before updating to get organizationId for audit
    const session = await Session.findOne({ sessionId }).select("organizationId").lean();
    
    await Session.updateOne(
      { sessionId },
      {
        isActive: false,
      }
    );

    await cleanupSessionQR(sessionId);
    
    if (session) {
      await logAudit("session_deleted", performedBy, sessionId, undefined, session.organizationId);
    }

    return { success: true };
  } catch (error) {
    throw new Error(`Failed to end session: ${error}`);
  }
};

/**
 * Get sessions by admin (with pagination)
 */
export const getSessionsByAdmin = async (
  adminUserId: string,
  page: number = 1,
  limit: number = 20
) => {
  try {
    const skip = (page - 1) * limit;
    const [sessions, total] = await Promise.all([
      Session.find({ createdBy: adminUserId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Session.countDocuments({ createdBy: adminUserId }),
    ]);
    return { sessions, total, page, limit };
  } catch (error) {
    throw new Error(`Failed to fetch admin sessions: ${error}`);
  }
};
