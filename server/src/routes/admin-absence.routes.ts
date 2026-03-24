import { Router } from "express";
import {
    detectAbsences, getSessionAbsences, getPendingAbsences, generateSessionSummary, getAbsenceStats, markAsExcused, markAttendanceManually, bulkMarkAsExcused } from "../controllers/absence.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";

const router = Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(authorize("admin", "platform_owner"));

/**
 * Detect absences for a session
 * POST /api/admin/absences/detect/:sessionId
 */
router.post("/detect/:sessionId", (req, res) => {
    detectAbsences(req, res);
});

/**
 * Get all absences for a specific session
 * GET /api/admin/absences/session/:sessionId
 */
router.get("/session/:sessionId", (req, res) => {
    getSessionAbsences(req, res);
});

/**
 * Get pending absences (not excused)
 * GET /api/admin/absences/pending
 */
router.get("/pending", (req, res) => {
    getPendingAbsences(req, res);
});

/**
 * Get absence summary for a session
 * GET /api/admin/absences/summary/:sessionId
 */
router.get("/summary/:sessionId", (req, res) => {
    generateSessionSummary(req, res);
});

/**
 * Get absence statistics by department
 * GET /api/admin/absences/stats/:sessionId
 */
router.get("/stats/:sessionId", (req, res) => {
    getAbsenceStats(req, res);
});

/**
 * Mark absence as excused
 * PUT /api/admin/absences/:absenceId/excuse
 */
router.put("/:absenceId/excuse", (req, res) => {
    markAsExcused(req, res);
});

/**
 * Mark attendance manually for absent member
 * POST /api/admin/absences/:absenceId/mark-attended
 */
router.post("/:absenceId/mark-attended", (req, res) => {
    markAttendanceManually(req, res);
});

/**
 * Bulk mark absences as excused
 * POST /api/admin/absences/bulk-excuse
 */
router.post("/bulk-excuse", (req, res) => {
    bulkMarkAsExcused(req, res);
});

export default router;
