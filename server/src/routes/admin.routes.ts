import { Router } from "express";
import {
  authenticate,
  requireOrgAdmin,
  requireSuperAdmin,
} from "../middleware/auth.middleware";

import {
  getAuditLogs,
  getAllAdmins,
  updateUserNameBySuperAdmin,
} from "../controllers/admin.controller";

const router = Router();

/** SuperAdmin-only guard for critical platform actions */
const superAdminGuard = [
  authenticate,
  requireSuperAdmin,
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
  superAdminGuard,
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
  superAdminGuard,
  updateUserNameBySuperAdmin
);

export default router;
