import express from "express";
import { authenticate, requireApprovedAdmin } from "../middleware/auth.middleware";
import {
  createSession,
  listActiveSessions,
  listAllSessions,
  getSessionStatus,
  getSessionQRImage,
  getSessionAttendance,
  endSessionController,
  updateSessionController,
  deleteSessionController,
  exportSessionAttendance,
} from "../controllers/session.controller";
import { getNotificationHistory } from "../controllers/notification.controller";

const router = express.Router();

router.use(authenticate);
router.use(requireApprovedAdmin);

/**
 * Create a new QR session
 * POST /api/admin/session/create
 */
router.post("/session/create", createSession);

/**
 * Get all active sessions
 * GET /api/admin/sessions
 */
router.get("/sessions", listActiveSessions);

/**
 * Get all sessions (active and ended)
 * GET /api/admin/sessions/all
 */
router.get("/sessions/all", listAllSessions);

/**
 * Get session status with attendance count
 * GET /api/admin/session/:sessionId
 */
router.get("/session/:sessionId", getSessionStatus);

/**
 * Get QR image (structured payload) for session
 * GET /api/admin/session/:sessionId/qr
 */
router.get("/session/:sessionId/qr", getSessionQRImage);

/**
 * Get live attendance for session
 * GET /api/admin/session/:sessionId/attendance
 */
router.get("/session/:sessionId/attendance", getSessionAttendance);

/**
 * Export session attendance as CSV
 * GET /api/admin/session/:sessionId/export
 */
router.get("/session/:sessionId/export", exportSessionAttendance);

/**
 * Notification history for current org
 * GET /api/admin/notifications/history
 */
router.get("/notifications/history", getNotificationHistory);

/**
 * Update session details
 * PATCH /api/admin/session/:sessionId
 */
router.patch("/session/:sessionId", updateSessionController);

/**
 * Permanently delete a session
 * DELETE /api/admin/session/:sessionId
 */
router.delete("/session/:sessionId", deleteSessionController);

/**
 * Manually end a session
 * POST /api/admin/session/:sessionId/end
 */
router.post("/session/:sessionId/end", endSessionController);

export default router;
