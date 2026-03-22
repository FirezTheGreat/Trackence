import { Router } from "express";
import {
  getDashboardMetrics,
  getDashboardStats,
  getOrganizationHealth,
  getEnhancedAnalytics,
} from "../controllers/dashboard.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

/**
 * Dashboard Routes - All require authentication
 * Organization scope automatically enforced via middleware
 */

/**
 * GET /api/admin/dashboard/metrics
 * Get comprehensive dashboard metrics for current organization
 * Returns: KPIs, charts, trends, and action items
 * Cache: 5 minutes per organization
 */
router.get("/metrics", authenticate, getDashboardMetrics);

/**
 * GET /api/admin/dashboard/stats
 * Get quick statistics snapshot for current organization
 * Returns: User count, sessions, absences
 */
router.get("/stats", authenticate, getDashboardStats);

/**
 * GET /api/admin/dashboard/health
 * Get organization health status and alerts
 * Returns: Health score, member engagement, alerts
 */
router.get("/health", authenticate, getOrganizationHealth);

/**
 * GET /api/admin/dashboard/enhanced
 * Get enhanced analytics: attendance breakdown, weekly comparisons,
 * sparkline data, peak hours, and summary stats
 * Cache: 5 minutes per organization
 */
router.get("/enhanced", authenticate, getEnhancedAnalytics);

export default router;
