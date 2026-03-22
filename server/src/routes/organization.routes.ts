import { Router } from "express";
import {
  authenticate,
  requireLegacySuperAdmin,
  requireOrgOwnership,
  requireTargetOrgAdmin,
} from "../middleware/auth.middleware";
import {
  createOrganization,
  listOrganizations,
  getOrganization,
  updateOrganization,
  listOrganizationMembers,
  addUserToOrganization,
  removeUserFromOrganization,
  getUnassignedUsers,
  getPendingJoinRequests,
  listOrganizationInvites,
  revokeOrganizationInvite,
  getOrganizationNotificationDefaults,
  createOrganizationInvite,
  approveJoinRequest,
  rejectJoinRequest,
  promoteToAdmin,
  demoteFromAdmin,
  leaveOrganization,
  transferOwnership,
  deleteOrganization,
  updateOrganizationNotificationDefaults,
} from "../controllers/organization.controller";

const router = Router();

// Platform-wide organization creation/listing requires super admin
const orgCreationGuard = [authenticate, requireLegacySuperAdmin];
const orgSelfCreateGuard = [authenticate];

// Org-specific operations require org ownership
const orgOwnerGuard = [authenticate, requireOrgOwnership];

// Read-only access for members of the target organization
const orgMemberGuard = [authenticate, requireOrgOwnership];

// Admins can manage members within orgs they belong to
const orgAdminGuard = [authenticate, requireTargetOrgAdmin];

/**
 * Create a new organization
 * POST /api/admin/organizations
 */
router.post("/", orgSelfCreateGuard, createOrganization);

/**
 * List all organizations
 * GET /api/admin/organizations
 */
router.get("/", orgCreationGuard, listOrganizations);

/**
 * Get unassigned users (for adding to org)
 * GET /api/admin/organizations/users/unassigned
 * NOTE: Must be before /:orgId to avoid route conflict
 */
router.get("/users/unassigned", orgCreationGuard, getUnassignedUsers);

/**
 * Get unassigned users for a specific org (admin/superAdmin)
 * GET /api/admin/organizations/:orgId/users/unassigned
 */
router.get("/:orgId/users/unassigned", orgAdminGuard, getUnassignedUsers);

/**
 * Get single organization details
 * GET /api/admin/organizations/:orgId
 */
router.get("/:orgId", orgMemberGuard, getOrganization);

/**
 * Get organization notification defaults
 * GET /api/admin/organizations/:orgId/notification-defaults
 */
router.get("/:orgId/notification-defaults", orgAdminGuard, getOrganizationNotificationDefaults);

/**
 * Update organization notification defaults
 * PATCH /api/admin/organizations/:orgId/notification-defaults
 */
router.patch("/:orgId/notification-defaults", orgAdminGuard, updateOrganizationNotificationDefaults);

/**
 * Update organization
 * PUT /api/admin/organizations/:orgId
 */
router.put("/:orgId", orgOwnerGuard, updateOrganization);

/**
 * List members of an organization
 * GET /api/admin/organizations/:orgId/members
 */
router.get("/:orgId/members", orgMemberGuard, listOrganizationMembers);

/**
 * Add user to organization
 * POST /api/admin/organizations/:orgId/members
 */
router.post("/:orgId/members", orgAdminGuard, addUserToOrganization);

/**
 * Remove user from organization
 * DELETE /api/admin/organizations/:orgId/members/:userId
 */
router.delete("/:orgId/members/:userId", orgAdminGuard, removeUserFromOrganization);

/**
 * Get pending join requests for an organization
 * GET /api/admin/organizations/:orgId/join-requests
 */
router.get("/:orgId/join-requests", orgAdminGuard, getPendingJoinRequests);

/**
 * Get invite history for an organization
 * GET /api/admin/organizations/:orgId/invites
 */
router.get("/:orgId/invites", orgAdminGuard, listOrganizationInvites);
router.patch("/:orgId/invites/:token/revoke", orgAdminGuard, revokeOrganizationInvite);

/**
 * Create invite link (optionally emails invite)
 * POST /api/admin/organizations/:orgId/invites
 */
router.post("/:orgId/invites", orgAdminGuard, createOrganizationInvite);

/**
 * Approve a user's join request
 * PATCH /api/admin/organizations/:orgId/join-requests/:userId/approve
 */
router.patch("/:orgId/join-requests/:userId/approve", orgAdminGuard, approveJoinRequest);

/**
 * Reject a user's join request
 * PATCH /api/admin/organizations/:orgId/join-requests/:userId/reject
 */
router.patch("/:orgId/join-requests/:userId/reject", orgAdminGuard, rejectJoinRequest);

/**
 * Promote a member to organization admin
 * PATCH /api/admin/organizations/:orgId/members/:userId/promote
 */
router.patch("/:orgId/members/:userId/promote", orgAdminGuard, promoteToAdmin);

/**
 * Demote a member from organization admin
 * PATCH /api/admin/organizations/:orgId/members/:userId/demote
 */
router.patch("/:orgId/members/:userId/demote", orgAdminGuard, demoteFromAdmin);

/**
 * Leave organization (remove self)
 * POST /api/admin/organizations/:orgId/leave
 */
router.post("/:orgId/leave", orgMemberGuard, leaveOrganization);

/**
 * Transfer organization ownership
 * PATCH /api/admin/organizations/:orgId/transfer-owner
 */
router.patch("/:orgId/transfer-owner", orgMemberGuard, transferOwnership);

/**
 * Delete organization
 * DELETE /api/admin/organizations/:orgId
 */
router.delete("/:orgId", orgOwnerGuard, deleteOrganization);

export default router;

