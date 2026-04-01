import { Router } from "express";
import {
  authenticate,
  requireOrgAdmin,
  requirePlatformOwner,
} from "../middleware/auth.middleware";

import {
  getAuditLogs,
  getAllAdmins,
  updateUserNameByPlatformOwner,
} from "../controllers/admin.controller";
import { getPlatformOwnerOverview as getPlatformOwnerOverviewFromDashboard } from "../controllers/dashboard.controller";

const router = Router();

/** Platform-owner-only guard for critical platform actions */
const platformOwnerGuard = [
  authenticate,
  requirePlatformOwner,
];

/** Org-admin guard for org-scoped admin listing */
const orgAdminGuard = [
  authenticate,
  requireOrgAdmin,
];

/**
 * Audit Logs
 */
router.get(
  "/audit-logs",
  platformOwnerGuard,
  getAuditLogs
);

/**
 * Get all admins in organization
 */
router.get(
  "/admins",
  orgAdminGuard,
  getAllAdmins
);

router.patch(
  "/users/:userId/name",
  platformOwnerGuard,
  updateUserNameByPlatformOwner
);

router.get(
  "/platform/overview",
  platformOwnerGuard,
  getPlatformOwnerOverviewFromDashboard
);

export default router;
