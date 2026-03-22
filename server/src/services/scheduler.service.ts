import Session from "../models/Session.model";
import User from "../models/User.model";
import Attendance from "../models/Attendance.model";
import {
  generateQRToken,
  setQRToken,
  generateQRImage,
} from "../services/qr.service";
import { endSession } from "../services/session.service";
import { emitToSession, broadcastToAdmins } from "../socket";
import {
  sendAbsenceDetectionEmail,
  sendSessionEndSummaryEmail,
} from "../services/email.service";
import {
  buildSessionAbsenceReportXlsx,
  buildSessionAttendanceReportXlsx,
} from "../services/session-export.service";
import AbsenceService from "../services/absence.service";

/**
 * QR Rotation Scheduler
 * Rotates QR tokens based on each session's individual refreshInterval
 * Checks for expired sessions every minute
 */

// Store per-session rotation intervals
const sessionRotationTimers = new Map<string, NodeJS.Timeout>();
let expiryCheckInterval: NodeJS.Timeout | null = null;

/**
 * Rotate QR token for a specific session
 */
const rotateQRForSession = async (sessionId: string) => {
  try {
    const session = await Session.findOne({ sessionId, isActive: true });
    if (!session) {
      // Session no longer active, clear its timer
      stopSessionRotation(sessionId);
      return;
    }

    // Check if session has expired (additional safety check)
    const now = new Date();
    if (session.endTime <= now) {
      console.log(`[QR Rotation] Session ${sessionId} has expired, stopping rotation`);
      stopSessionRotation(sessionId);
      return;
    }

    // Generate new token
    const newToken = generateQRToken();
    const serverTtl = session.refreshInterval + 5; // Expiry +5 seconds for internal grace period
    const uiTtl = session.refreshInterval; // What the UI sees
    await setQRToken(sessionId, newToken, serverTtl);

    // Generate QR image and emit to all connected clients
    const { qrImage, expiresAt } = await generateQRImage(
      sessionId,
      newToken,
      uiTtl
    );

    emitToSession(sessionId, "qr:rotated", { sessionId, qrImage, expiresAt });

    console.log(`[QR Rotation] Rotated token for session ${sessionId} (interval: ${session.refreshInterval}s)`);

    // Schedule next rotation for this specific session
    const timerId = setTimeout(() => {
      rotateQRForSession(sessionId);
    }, session.refreshInterval * 1000);

    sessionRotationTimers.set(sessionId, timerId);
  } catch (error) {
    console.error(`[QR Rotation] Error rotating token for session ${sessionId}:`, error);
  }
};

/**
 * Start QR rotation for a specific session
 */
export const startSessionRotation = async (sessionId: string) => {
  try {
    const session = await Session.findOne({ sessionId, isActive: true });
    if (!session) {
      console.warn(`[QR Rotation] Session ${sessionId} not found or inactive`);
      return;
    }

    // Don't start if already running
    if (sessionRotationTimers.has(sessionId)) {
      console.log(`[QR Rotation] Session ${sessionId} rotation already running`);
      return;
    }

    console.log(`[QR Rotation] Starting rotation for session ${sessionId} (every ${session.refreshInterval}s)`);

    // Start immediate rotation
    await rotateQRForSession(sessionId);
  } catch (error) {
    console.error(`[QR Rotation] Error starting rotation for session ${sessionId}:`, error);
  }
};

/**
 * Stop QR rotation for a specific session
 */
export const stopSessionRotation = (sessionId: string) => {
  const timer = sessionRotationTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    sessionRotationTimers.delete(sessionId);
    console.log(`[QR Rotation] Stopped rotation for session ${sessionId}`);
  }
};

/**
 * Check for expired sessions and deactivate them
 */
const checkSessionExpiry = async () => {
  try {
    const now = new Date();

    // Find all active sessions that have expired
    const expiredSessions = await Session.find({
      isActive: true,
      endTime: { $lte: now },
    });

    for (const session of expiredSessions) {
      // Stop QR rotation for this session
      stopSessionRotation(session.sessionId);
      
      // Emit to specific session room
      emitToSession(session.sessionId, "session:ended", { sessionId: session.sessionId });
      
      // Broadcast to all admins for auto-refresh
      broadcastToAdmins("session:ended", { sessionId: session.sessionId });
      
      await endSession(session.sessionId);

      const totalMarked = await Attendance.countDocuments({ sessionId: session.sessionId });
      const creator = await User.findOne({ userId: session.createdBy });

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

      const absenceSummary = await AbsenceService.detectAbsences(session.sessionId);
      const sessionReportXlsx = attachReport ? await buildSessionAttendanceReportXlsx(session.sessionId) : null;
      const absenceReportXlsx = attachReport ? await buildSessionAbsenceReportXlsx(session.sessionId) : null;

      if (sendSessionEndEmail && recipients.length > 0) {
        const emailOptions: {
          organizationId?: string | null;
          triggeredBy?: string | null;
          sessionDuration?: number;
          totalAbsent?: number;
          totalFaculty?: number;
          reportAttachment?: {
            filename: string;
            content: Buffer;
            contentType: string;
            contentEncoding: "base64";
          };
        } = {
          organizationId: session.organizationId,
          triggeredBy: "system",
          sessionDuration: session.duration,
          totalAbsent: absenceSummary.absent,
          totalFaculty: absenceSummary.totalFaculty,
        };

        if (sessionReportXlsx) {
          emailOptions.reportAttachment = {
              filename: `session-report-${session.sessionId}.xlsx`,
              content: sessionReportXlsx,
              contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              contentEncoding: "base64",
          };
        }

        await sendSessionEndSummaryEmail(recipients, session.sessionId, totalMarked, emailOptions);
      }

      if (sendAbsenceEmail && recipients.length > 0) {
        await sendAbsenceDetectionEmail(recipients, session.sessionId, absenceSummary.absent, {
          organizationId: session.organizationId,
          triggeredBy: "system",
          totalFaculty: absenceSummary.totalFaculty,
          attended: absenceSummary.attended,
          ...(absenceReportXlsx
            ? {
              reportAttachment: {
                filename: `absence-report-${session.sessionId}.xlsx`,
                content: absenceReportXlsx,
                contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                contentEncoding: "base64" as const,
              },
            }
            : {}),
        });
      }

      console.log(`[Session Expiry] Expired session ${session.sessionId}`);
    }
  } catch (error) {
    console.error("[Session Expiry] Error during expiry check:", error);
  }
};

/**
 * Start the QR rotation scheduler
 */
export const startQRScheduler = async () => {
  if (expiryCheckInterval) {
    console.warn("[QR Scheduler] Scheduler already running");
    return;
  }

  console.log("[QR Scheduler] Starting QR rotation scheduler...");

  // Start rotation for all existing active sessions
  const activeSessions = await Session.find({ isActive: true });
  for (const session of activeSessions) {
    await startSessionRotation(session.sessionId);
  }

  // Check for expired sessions every 30 seconds
  expiryCheckInterval = setInterval(checkSessionExpiry, 30 * 1000);

  console.log("[QR Scheduler] QR rotation scheduler started ✓");
};

/**
 * Stop the QR rotation scheduler
 */
export const stopQRScheduler = () => {
  // Stop all session rotation timers
  sessionRotationTimers.forEach((timer, sessionId) => {
    clearTimeout(timer);
    console.log(`[QR Scheduler] Stopped rotation for session ${sessionId}`);
  });
  sessionRotationTimers.clear();

  if (expiryCheckInterval) {
    clearInterval(expiryCheckInterval);
    expiryCheckInterval = null;
  }

  console.log("[QR Scheduler] QR scheduler stopped");
};

/**
 * Check if scheduler is running
 */
export const isSchedulerRunning = (): boolean => {
  return expiryCheckInterval !== null || sessionRotationTimers.size > 0;
};
