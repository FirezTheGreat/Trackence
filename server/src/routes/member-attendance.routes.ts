import express from "express";
import { authenticate } from "../middleware/auth.middleware";
import { attendanceMarkRateLimiter } from "../middleware/rateLimit.middleware";
import {
  markAttendance,
  getActiveSession,
  getMyAttendanceHistory,
  getMyAttendanceStats,
} from "../controllers/session.controller";

const router = express.Router();

/**
 * Mark attendance by scanning QR
 * POST /api/attendance/mark
 */
router.post("/mark", authenticate, attendanceMarkRateLimiter, markAttendance);

/**
 * Get current active session (for QR scanning)
 * GET /api/attendance/active-session
 */
router.get("/active-session", authenticate, getActiveSession);

/**
 * Get my attendance history
 * GET /api/attendance/my-history
 */
router.get("/my-history", authenticate, getMyAttendanceHistory);

/**
 * Get my attendance stats
 * GET /api/attendance/my-stats
 */
router.get("/my-stats", authenticate, getMyAttendanceStats);

export default router;
