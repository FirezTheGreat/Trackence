import { Request, Response } from "express";
import Organization from "../models/Organization.model";
import User from "../models/User.model";
import OrganizationJoinRequest from "../models/OrganizationJoinRequest.model";
import OrganizationInvite from "../models/OrganizationInvite.model";
import { generateOrganizationId } from "../utils/id.utils";
import { logAudit } from "../services/audit.service";
import { normalizeRecipientList } from "../utils/notification.utils";
import { sendOrgJoinApprovalEmail, sendOrgJoinRejectionEmail } from "../services/email.service";
import { sendOrganizationInviteEmail } from "../services/email.service";
import { nanoid } from "nanoid";
import { broadcastToAdmins, broadcastToOrganizationMembers, emitToUser } from "../socket";

const serializeOrgNotificationDefaults = (org: any) => {
  const src = org?.notificationDefaults || {};
  return {
    recipients: normalizeRecipientList(src.recipients),
    sendSessionEndEmail: typeof src.sendSessionEndEmail === "boolean" ? src.sendSessionEndEmail : true,
    sendAbsenceEmail: typeof src.sendAbsenceEmail === "boolean" ? src.sendAbsenceEmail : true,
    attachReport: typeof src.attachReport === "boolean" ? src.attachReport : true,
  };
};

const removeMembershipFromUser = (user: any, orgIdStr: string) => {
  const nextOrgIds = (user.organizationIds || []).filter(
    (id: string) => String(id) !== orgIdStr
  );
  const roleEntries = Array.isArray(user.userOrgRoles) ? (user.userOrgRoles as any[]) : [];
  const nextRoles = roleEntries.filter(
    (r: any) => String(r.organizationId) !== orgIdStr
  );

  user.organizationIds = nextOrgIds;
  user.userOrgRoles = nextRoles as any;

  if (user.currentOrganizationId === orgIdStr) {
    user.currentOrganizationId = nextOrgIds[0] || null;
  }

  user.markModified("organizationIds");
  user.markModified("userOrgRoles");
};

const isUserMemberOfOrganization = (user: any, orgId: string): boolean => {
  const orgIds = Array.isArray(user?.organizationIds) ? user.organizationIds : [];
  const roleEntries = Array.isArray(user?.userOrgRoles) ? user.userOrgRoles : [];

  const inOrgIds = orgIds.some((id: any) => String(id) === orgId);
  const inRoleEntries = roleEntries.some((entry: any) => String(entry?.organizationId) === orgId);

  return inOrgIds || inRoleEntries;
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeUserIdInput = (value: string): string => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";

  const withoutPrefix = trimmed.replace(/^USR-/i, "").trim();
  if (!withoutPrefix) return "";

  return `USR-${withoutPrefix.toUpperCase()}`;
};

const buildUserIdLookupRegex = (normalizedUserId: string): RegExp => {
  return new RegExp(`^${escapeRegExp(normalizedUserId)}$`, "i");
};

const emitOrganizationMembershipUpdated = (
  organizationId: string,
  action: "joined" | "left" | "removed" | "role_changed" | "org_deleted",
  affectedUserId: string,
  initiatedBy?: string
) => {
  broadcastToOrganizationMembers(organizationId, "organization:membership-updated", {
    organizationId,
    action,
    affectedUserId,
    initiatedBy: initiatedBy || null,
    at: new Date().toISOString(),
  });
};

/**
 * Sync the denormalized `members` array on an Organization document.
 * Call this after any membership change (join, leave, promote, demote, add, remove).
 */
export const syncOrgMembers = async (orgId: string): Promise<void> => {
  try {
    const users = await User.find({ organizationIds: orgId })
      .select("userId name email userOrgRoles")
      .lean();

    const members = users.map((u: any) => {
      const userOrgRole = (u.userOrgRoles || []).find(
        (r: any) => r.organizationId === orgId
      );
      return {
        userId: u.userId,
        name: u.name,
        email: u.email,
        role: userOrgRole?.role || "faculty",
        isOrgAdmin: userOrgRole?.role === "admin",
      };
    });

    await Organization.updateOne(
      { organizationId: orgId },
      { $set: { members } }
    );
  } catch (error) {
    console.error(`[syncOrgMembers] Failed to sync members for ${orgId}:`, error);
  }
};

/**
 * Create a new organization (superAdmin only)
 * POST /api/admin/organizations
 */
export const createOrganization = async (req: Request, res: Response) => {
  try {
    const { name, code, description } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!name || !code) {
      return res.status(400).json({
        message: "Organization name and code are required.",
      });
    }

    // Validate code format (alphanumeric + hyphens, 2-20 chars)
    const codeRegex = /^[A-Za-z0-9-]{2,20}$/;
    if (!codeRegex.test(code)) {
      return res.status(400).json({
        message: "Code must be 2-20 characters (letters, numbers, hyphens only).",
      });
    }

    const normalizedCode = code.toUpperCase().trim();

    // Check if code already exists (active orgs always block)
    const existingOrg = await Organization.findOne({
      code: normalizedCode,
    });

    if (existingOrg) {
      const existingMemberCount = await User.countDocuments({
        organizationIds: existingOrg.organizationId,
      });

      if (existingOrg.isActive && existingMemberCount > 0) {
        return res.status(409).json({
          message: "An organization with this code already exists.",
        });
      }

      // Reclaim hidden org codes (inactive or orphaned orgs with zero members)
      existingOrg.name = name.trim();
      existingOrg.description = description?.trim() || "";
      existingOrg.createdBy = userId;
      existingOrg.owner = userId;
      existingOrg.isActive = true;
      await existingOrg.save();

      const creator = await User.findOne({ userId });
      if (creator) {
        if (!creator.organizationIds) creator.organizationIds = [];
        if (!creator.organizationIds.includes(existingOrg.organizationId)) {
          creator.organizationIds.push(existingOrg.organizationId);
        }
        if (!creator.currentOrganizationId) {
          creator.currentOrganizationId = existingOrg.organizationId;
        }
        const roleEntries = creator.userOrgRoles as any[];
        const existingRoleEntry = roleEntries.find(
          (r: any) => r.organizationId === existingOrg.organizationId
        );
        if (!existingRoleEntry) {
          roleEntries.push({
            organizationId: existingOrg.organizationId,
            role: "admin",
          });
        }
        await creator.save();
      }

      await syncOrgMembers(existingOrg.organizationId);

      await logAudit("organization_created", userId, existingOrg.organizationId, {
        name: existingOrg.name,
        code: existingOrg.code,
      }, existingOrg.organizationId);

      return res.status(201).json({
        message: "Organization created successfully.",
        organization: {
          organizationId: existingOrg.organizationId,
          name: existingOrg.name,
          code: existingOrg.code,
          description: existingOrg.description,
          isActive: existingOrg.isActive,
          createdAt: existingOrg.createdAt,
        },
      });
    }

    const organizationId = generateOrganizationId();

    const org = await Organization.create({
      organizationId,
      name: name.trim(),
      code: normalizedCode,
      description: description?.trim() || "",
      createdBy: userId,
      owner: userId, // Creator is the owner
      isActive: true,
    });

    // Auto-add the creator to this org
    const creator = await User.findOne({ userId });
    if (creator) {
      if (!creator.organizationIds) creator.organizationIds = [];
      if (!creator.organizationIds.includes(organizationId)) {
        creator.organizationIds.push(organizationId);
      }
      if (!creator.currentOrganizationId) {
        creator.currentOrganizationId = organizationId;
      }
      const roleEntries = creator.userOrgRoles as any[];
      const existingRoleEntry = roleEntries.find(
        (r: any) => r.organizationId === organizationId
      );
      if (!existingRoleEntry) {
        roleEntries.push({
          organizationId: organizationId,
          role: "admin",
        });
      }
      await creator.save();
    }

    await syncOrgMembers(organizationId);

    await logAudit("organization_created", userId, organizationId, {
      name: org.name,
      code: org.code,
    }, organizationId);

    return res.status(201).json({
      message: "Organization created successfully.",
      organization: {
        organizationId: org.organizationId,
        name: org.name,
        code: org.code,
        description: org.description,
        isActive: org.isActive,
        createdAt: org.createdAt,
      },
    });
  } catch (error) {
    console.error("[Create Organization] Error:", error);
    return res.status(500).json({
      message: "Failed to create organization.",
    });
  }
};

/**
 * List all organizations (for superAdmin, returns only their org)
 * GET /api/admin/organizations
 */
export const listOrganizations = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(401).json({ message: "User not found." });
    }

    // SuperAdmins see ALL organizations
    const organizations = await Organization.find()
      .sort({ createdAt: -1 })
      .lean();

    // Get member counts for each org
    const orgsWithCounts = organizations.map((org) => ({
      organizationId: org.organizationId,
      name: org.name,
      code: org.code,
      description: org.description,
      isActive: org.isActive,
      memberCount: (org as any).members?.length ?? 0,
      members: (org as any).members || [],
      owner: org.owner,
      createdAt: org.createdAt,
    }));

    return res.json({ organizations: orgsWithCounts });
  } catch (error) {
    console.error("[List Organizations] Error:", error);
    return res.status(500).json({
      message: "Failed to fetch organizations.",
    });
  }
};

/**
 * Get single organization details
 * GET /api/admin/organizations/:orgId
 */
export const getOrganization = async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;

    const org = await Organization.findOne({
      organizationId: orgId,
    }).lean();

    if (!org) {
      return res.status(404).json({ message: "Organization not found." });
    }

    const memberCount = (org as any).members?.length ?? await User.countDocuments({
      organizationIds: orgId,
    });

    return res.json({
      organization: {
        organizationId: org.organizationId,
        name: org.name,
        code: org.code,
        description: org.description,
        isActive: org.isActive,
        memberCount,
        members: (org as any).members || [],
        createdBy: org.createdBy,
        owner: org.owner,
        notificationDefaults: serializeOrgNotificationDefaults(org),
        createdAt: org.createdAt,
      },
    });
  } catch (error) {
    console.error("[Get Organization] Error:", error);
    return res.status(500).json({
      message: "Failed to fetch organization.",
    });
  }
};

/**
 * Get organization notification defaults
 * GET /api/admin/organizations/:orgId/notification-defaults
 */
export const getOrganizationNotificationDefaults = async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const org = await Organization.findOne({ organizationId: orgId })
      .select("organizationId notificationDefaults")
      .lean();

    if (!org) {
      return res.status(404).json({ message: "Organization not found." });
    }

    return res.json({
      organizationId: org.organizationId,
      notificationDefaults: serializeOrgNotificationDefaults(org),
    });
  } catch (error) {
    console.error("[Org Notification Defaults] Error:", error);
    return res.status(500).json({ message: "Failed to fetch organization notification defaults." });
  }
};

/**
 * Update organization notification defaults
 * PATCH /api/admin/organizations/:orgId/notification-defaults
 */
export const updateOrganizationNotificationDefaults = async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const orgIdStr = Array.isArray(orgId) ? orgId[0] : orgId;
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const payload = req.body || {};
    const defaults = {
      recipients: normalizeRecipientList(payload.recipients),
      sendSessionEndEmail:
        typeof payload.sendSessionEndEmail === "boolean" ? payload.sendSessionEndEmail : true,
      sendAbsenceEmail:
        typeof payload.sendAbsenceEmail === "boolean" ? payload.sendAbsenceEmail : true,
      attachReport: typeof payload.attachReport === "boolean" ? payload.attachReport : true,
    };

    const org = await Organization.findOneAndUpdate(
      { organizationId: orgIdStr },
      { $set: { notificationDefaults: defaults } },
      { returnDocument: "after" }
    )
      .select("organizationId notificationDefaults")
      .lean();

    if (!org) {
      return res.status(404).json({ message: "Organization not found." });
    }

    await logAudit({
      action: "organization_updated",
      performedBy: userId,
      targetId: orgIdStr,
      targetResourceType: "organization",
      targetResourceName: orgIdStr,
      organizationId: orgIdStr,
      metadata: {
        scope: "notification_defaults",
        recipientsCount: defaults.recipients.length,
        sendSessionEndEmail: defaults.sendSessionEndEmail,
        sendAbsenceEmail: defaults.sendAbsenceEmail,
        attachReport: defaults.attachReport,
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent") || undefined,
    });

    return res.json({
      message: "Organization notification defaults updated.",
      organizationId: org.organizationId,
      notificationDefaults: serializeOrgNotificationDefaults(org),
    });
  } catch (error) {
    console.error("[Update Org Notification Defaults] Error:", error);
    return res.status(500).json({ message: "Failed to update organization notification defaults." });
  }
};

/**
 * Update organization details
 * PUT /api/admin/organizations/:orgId
 * Allowed for: org admin/owner
 */
export const updateOrganization = async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const { name, description, isActive } = req.body;
    const userId = req.user?.userId;
    const orgIdStr = Array.isArray(orgId) ? orgId[0] : orgId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const org = await Organization.findOne({ organizationId: orgIdStr });

    if (!org) {
      return res.status(404).json({ message: "Organization not found." });
    }

    // Get user to check org admin role
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(401).json({ message: "User not found." });
    }

    const userOrgRoles = (user.userOrgRoles || []) as any[];
    const userIsOrgAdmin = userOrgRoles.some(
      (r: any) => r.organizationId === orgIdStr && r.role === "admin"
    );

    // Authorization checks
    const isOwner = org.owner === userId || org.createdBy === userId;
    const canEditDetails = isOwner || userIsOrgAdmin;
    const canEditStatus = isOwner || userIsOrgAdmin;

    if (!canEditDetails) {
      return res.status(403).json({
        message: "You don't have permission to edit this organization.",
      });
    }

    // Update allowed fields based on role
    if (name !== undefined && canEditDetails) {
      org.name = name.trim();
    }
    if (description !== undefined && canEditDetails) {
      org.description = description.trim();
    }

    // Org owner/admin can change active status
    if (typeof isActive === "boolean" && canEditStatus) {
      org.isActive = isActive;
    }

    if (!org.owner) {
      org.owner = org.createdBy;
    }

    await org.save();

    const changesSummary = [];
    if (name !== undefined) changesSummary.push(`name to "${org.name}"`);
    if (description !== undefined) changesSummary.push("description");
    if (typeof isActive === "boolean" && canEditStatus) {
      changesSummary.push(`status to ${org.isActive ? "active" : "inactive"}`);
    }

    await logAudit("organization_updated", userId, orgIdStr, {
      name: org.name,
      description: org.description,
      isActive: org.isActive,
      changesSummary: changesSummary.join(", "),
    }, orgIdStr);

    return res.json({
      message: "Organization updated successfully.",
      organization: {
        organizationId: org.organizationId,
        name: org.name,
        code: org.code,
        description: org.description,
        isActive: org.isActive,
      },
    });
  } catch (error) {
    console.error("[Update Organization] Error:", error);
    return res.status(500).json({
      message: "Failed to update organization.",
    });
  }
};

/**
 * List members of an organization
 * GET /api/admin/organizations/:orgId/members
 */
export const listOrganizationMembers = async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const org = await Organization.findOne({ organizationId: orgId });
    if (!org) {
      return res.status(404).json({ message: "Organization not found." });
    }

    const [members, total] = await Promise.all([
      User.find({ organizationIds: orgId })
        .select("userId name email adminStatus userOrgRoles createdAt")
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments({ organizationIds: orgId }),
    ]);

    // Add isOrgAdmin flag to each member
    const membersWithAdminFlag = members.map((member: any) => {
      const orgRole = (member.userOrgRoles || []).find(
        (r: any) => r.organizationId === orgId
      );
      return {
        ...member,
        role: orgRole?.role || "faculty",
        isOrgAdmin: orgRole?.role === "admin",
      };
    });

    return res.json({
      members: membersWithAdminFlag,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error("[List Org Members] Error:", error);
    return res.status(500).json({
      message: "Failed to fetch organization members.",
    });
  }
};

/**
 * Invite a user to an organization (invite-only membership)
 * POST /api/admin/organizations/:orgId/members
 */
export const addUserToOrganization = async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const rawTargetUserId = typeof req.body?.userId === "string" ? req.body.userId : "";
    const targetUserId = normalizeUserIdInput(rawTargetUserId);
    const adminUserId = req.user?.userId;

    if (!adminUserId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!targetUserId) {
      return res.status(400).json({
        message: "userId is required.",
      });
    }

    const orgIdStr = Array.isArray(orgId) ? orgId[0] : orgId;

    const org = await Organization.findOne({
      organizationId: orgIdStr,
      isActive: true,
    });

    if (!org) {
      return res.status(404).json({
        message: "Organization not found or inactive.",
      });
    }

    const targetUser = await User.findOne({ userId: { $regex: buildUserIdLookupRegex(targetUserId) } })
      .select("userId email organizationIds userOrgRoles");

    if (!targetUser) {
      return res.status(404).json({ message: "User not found." });
    }

    if (isUserMemberOfOrganization(targetUser, orgIdStr)) {
      return res.status(400).json({
        message: "User is already in this organization.",
      });
    }

    const activeInvite = await OrganizationInvite.findOne({
      organizationId: orgIdStr,
      revokedAt: null,
      rejectedAt: null,
      expiresAt: { $gt: new Date() },
      useCount: { $lt: 1 },
      $or: [
        { invitedUserId: targetUser.userId },
        { invitedEmail: String(targetUser.email || "").trim().toLowerCase() },
      ],
    })
      .select("createdAt expiresAt")
      .lean();

    if (activeInvite) {
      return res.status(409).json({
        message: "An active invite already exists for this user. Revoke or wait for expiry before inviting again.",
      });
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const token = nanoid(32);

    await OrganizationInvite.create({
      token,
      organizationId: orgIdStr,
      createdBy: adminUserId,
      invitedEmail: String(targetUser.email || "").trim().toLowerCase() || null,
      invitedUserId: targetUser.userId,
      expiresAt,
    });

    const frontendUrl = String(process.env.FRONTEND_URL || "").trim().replace(/\/$/, "");
    if (!frontendUrl) {
      return res.status(500).json({ message: "FRONTEND_URL is not configured." });
    }
    const inviteLink = `${frontendUrl}/invite/${encodeURIComponent(token)}`;

    const adminUser = await User.findOne({ userId: adminUserId }).select("name email").lean();
    if (targetUser.email) {
      await sendOrganizationInviteEmail({
        to: targetUser.email,
        organizationName: org.name,
        organizationCode: org.code,
        invitedByName: (adminUser as any)?.name || null,
        invitedByEmail: (adminUser as any)?.email || null,
        inviteLink,
        expiresAt,
      });
    }

    await logAudit("organization_updated", adminUserId, orgIdStr, {
      scope: "member_invited",
      targetUserId,
      inviteLink,
      expiresAt,
    }, orgIdStr);

    return res.json({
      message: `Invitation sent to ${targetUser.name}. They must accept the invite to join ${org.name}.`,
      invite: {
        token,
        inviteLink,
        invitedEmail: targetUser.email,
        invitedUserId: targetUser.userId,
        expiresAt,
      },
    });
  } catch (error) {
    console.error("[Invite User to Org] Error:", error);
    return res.status(500).json({
      message: "Failed to send organization invite.",
    });
  }
};

/**
 * Remove a user from an organization (superAdmin only)
 * DELETE /api/admin/organizations/:orgId/members/:userId
 */
export const removeUserFromOrganization = async (req: Request, res: Response) => {
  try {
    const { orgId, userId: targetUserId } = req.params;
    const adminUserId = req.user?.userId;

    if (!adminUserId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const orgIdStr = Array.isArray(orgId) ? orgId[0] : orgId;
    const targetUserIdStr = Array.isArray(targetUserId) ? targetUserId[0] : targetUserId;

    const targetUser = await User.findOne({
      userId: targetUserIdStr,
      organizationIds: orgIdStr,
    });

    if (!targetUser) {
      return res.status(404).json({
        message: "User not found in this organization.",
      });
    }

    // Prevent removing yourself
    if (targetUserIdStr === adminUserId) {
      return res.status(400).json({
        message: "You cannot remove yourself from the organization.",
      });
    }

    // Remove org from user's organizationIds
    targetUser.organizationIds = (targetUser.organizationIds || []).filter(
      (id: string) => id !== orgIdStr
    );
    if (targetUser.currentOrganizationId === orgIdStr) {
      targetUser.currentOrganizationId = targetUser.organizationIds[0] || null;
    }
    await targetUser.save();

    emitToUser(targetUserIdStr, "user:org-membership-changed", {
      type: "removed",
      organizationId: orgIdStr,
      at: new Date().toISOString(),
    });

    await syncOrgMembers(orgIdStr);
    emitOrganizationMembershipUpdated(orgIdStr, "removed", targetUserIdStr, adminUserId);

    await logAudit("user_removed_from_org", adminUserId, orgIdStr, {
      targetUserId: targetUserIdStr,
    }, orgIdStr);

    return res.json({
      message: `${targetUser.name} has been removed from the organization.`,
    });
  } catch (error) {
    console.error("[Remove User from Org] Error:", error);
    return res.status(500).json({
      message: "Failed to remove user from organization.",
    });
  }
};

/**
 * Search users not in a specific org (for adding to org)
 * GET /api/admin/organizations/users/unassigned
 */
export const getUnassignedUsers = async (req: Request, res: Response) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const targetOrgIdParam = typeof req.params.orgId === "string" ? req.params.orgId.trim() : "";
    const targetOrgIdQuery = typeof req.query.orgId === "string" ? req.query.orgId.trim() : "";
    const targetOrgId = targetOrgIdParam || targetOrgIdQuery;

    if (!targetOrgId) {
      return res.status(400).json({ message: "Organization ID is required." });
    }

    // Base query: exclude users already in this org
    const query: any = {
      organizationIds: { $nin: [targetOrgId] }, // Not in this org
      requestedOrganizationIds: { $nin: [targetOrgId] }, // And not pending to join this org
    };

    // If search provided, add search filters
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { userId: search },
      ];
    }

    const users = await User.find(query)
      .select("userId name email role adminStatus createdAt")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.json({ users });
  } catch (error) {
    console.error("[Unassigned Users] Error:", error);
    return res.status(500).json({
      message: "Failed to fetch unassigned users.",
    });
  }
};

/**
 * Get pending org join requests for an organization
 * GET /api/admin/organizations/:orgId/join-requests
 */
export const getPendingJoinRequests = async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const orgIdStr = Array.isArray(orgId) ? orgId[0] : orgId;

    const org = await Organization.findOne({ organizationId: orgIdStr });
    if (!org) {
      return res.status(404).json({ message: "Organization not found." });
    }

    const pendingRequests = await OrganizationJoinRequest.find({
      organizationId: orgIdStr,
      status: "pending",
    })
      .select("userId requestedAt")
      .sort({ requestedAt: -1 })
      .lean();

    const pendingUserIds = Array.from(new Set((pendingRequests as any[]).map((request) => request.userId)));

    const pendingUsers = pendingUserIds.length > 0
      ? await User.find({ userId: { $in: pendingUserIds } })
        .select("userId name email role adminStatus createdAt")
        .lean()
      : [];

    const orderMap = new Map((pendingRequests as any[]).map((request, index) => [request.userId, index]));
    pendingUsers.sort((a: any, b: any) => (orderMap.get(a.userId) ?? 999999) - (orderMap.get(b.userId) ?? 999999));

    return res.json({ requests: pendingUsers, organizationName: org.name });
  } catch (error) {
    console.error("[Pending Join Requests] Error:", error);
    return res.status(500).json({
      message: "Failed to fetch pending join requests.",
    });
  }
};

/**
 * Get recent invites for an organization
 * GET /api/admin/organizations/:orgId/invites
 */
export const listOrganizationInvites = async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const orgIdStr = Array.isArray(orgId) ? orgId[0] : orgId;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

    const org = await Organization.findOne({ organizationId: orgIdStr })
      .select("organizationId name")
      .lean();

    if (!org) {
      return res.status(404).json({ message: "Organization not found." });
    }

    const invites = await OrganizationInvite.find({ organizationId: orgIdStr })
      .select("token invitedEmail invitedUserId createdBy createdAt expiresAt revokedAt rejectedAt rejectedBy useCount")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const creatorIds = Array.from(new Set(invites.map((invite: any) => String(invite.createdBy || "")).filter(Boolean)));
    const invitedUserIds = Array.from(new Set(invites.map((invite: any) => String(invite.invitedUserId || "")).filter(Boolean)));
    const rejectedByIds = Array.from(new Set(invites.map((invite: any) => String(invite.rejectedBy || "")).filter(Boolean)));

    const relatedUserIds = Array.from(new Set([...creatorIds, ...invitedUserIds, ...rejectedByIds]));
    const relatedUsers = relatedUserIds.length > 0
      ? await User.find({ userId: { $in: relatedUserIds } })
          .select("userId name email")
          .lean()
      : [];

    const userMap = new Map((relatedUsers as any[]).map((user) => [String(user.userId), user]));

    const now = Date.now();
    const inviteRows = invites.map((invite: any) => {
      const expiresAtMs = new Date(invite.expiresAt).getTime();
      const isExpired = Number.isFinite(expiresAtMs) && expiresAtMs <= now;
      const isRevoked = Boolean(invite.revokedAt);
      const isRejected = Boolean((invite as any).rejectedAt);
      const isAccepted = Number(invite.useCount || 0) > 0;

      const creator = userMap.get(String(invite.createdBy || "")) as any;
      const invitedUser = invite.invitedUserId
        ? (userMap.get(String(invite.invitedUserId || "")) as any)
        : null;
      const rejectedByUser = (invite as any).rejectedBy
        ? (userMap.get(String((invite as any).rejectedBy || "")) as any)
        : null;

      let status: "pending" | "accepted" | "rejected" | "revoked" | "expired" = "pending";
      if (isRevoked) {
        status = "revoked";
      } else if (isRejected) {
        status = "rejected";
      } else if (isExpired) {
        status = "expired";
      } else if (isAccepted) {
        status = "accepted";
      }

      return {
        token: invite.token,
        invitedEmail: invite.invitedEmail || null,
        invitedUserId: invite.invitedUserId || null,
        invitedUserName: invitedUser?.name || null,
        createdBy: invite.createdBy,
        createdByName: creator?.name || null,
        createdByEmail: creator?.email || null,
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt,
        revokedAt: invite.revokedAt || null,
        rejectedAt: (invite as any).rejectedAt || null,
        rejectedBy: (invite as any).rejectedBy || null,
        rejectedByName: rejectedByUser?.name || null,
        useCount: Number(invite.useCount || 0),
        status,
      };
    });

    return res.json({
      organizationId: orgIdStr,
      invites: inviteRows,
    });
  } catch (error) {
    console.error("[List Organization Invites] Error:", error);
    return res.status(500).json({
      message: "Failed to fetch organization invites.",
    });
  }
};

/**
 * Revoke an organization invite
 * PATCH /api/admin/organizations/:orgId/invites/:token/revoke
 */
export const revokeOrganizationInvite = async (req: Request, res: Response) => {
  try {
    const adminUserId = req.user?.userId;
    const orgId = String(req.params.orgId || "").trim();
    const token = String(req.params.token || "").trim();

    if (!adminUserId || !orgId || !token) {
      return res.status(400).json({ message: "Missing required parameters." });
    }

    const org = await Organization.findOne({ organizationId: orgId }).select("organizationId name").lean();
    if (!org) {
      return res.status(404).json({ message: "Organization not found." });
    }

    const invite = await OrganizationInvite.findOne({ organizationId: orgId, token });
    if (!invite) {
      return res.status(404).json({ message: "Invite not found." });
    }

    if (invite.revokedAt) {
      return res.json({ message: "Invite already revoked." });
    }

    if (Number(invite.useCount || 0) > 0) {
      return res.status(409).json({ message: "Cannot revoke an invite that has already been accepted." });
    }

    invite.revokedAt = new Date();
    await invite.save();

    await logAudit("organization_updated", adminUserId, orgId, {
      scope: "invite_revoked",
      token,
      invitedEmail: invite.invitedEmail || null,
      invitedUserId: (invite as any).invitedUserId || null,
    }, orgId);

    return res.json({ message: "Invite revoked successfully." });
  } catch (error) {
    console.error("[Revoke Organization Invite] Error:", error);
    return res.status(500).json({ message: "Failed to revoke invite." });
  }
};

/**
 * Create organization invite link and optionally email it to a target user
 * POST /api/admin/organizations/:orgId/invites
 */
export const createOrganizationInvite = async (req: Request, res: Response) => {
  try {
    const adminUserId = req.user?.userId;
    const orgId = String(req.params.orgId || "").trim();
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const invitedUserIdInput = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
    const invitedUserId = normalizeUserIdInput(invitedUserIdInput);
    const expiresInDaysRaw = Number(req.body?.expiresInDays || 7);
        if (invitedUserIdInput && !invitedUserId) {
          return res.status(400).json({ message: "Invalid user ID format." });
        }

    const expiresInDays = Number.isFinite(expiresInDaysRaw)
      ? Math.min(30, Math.max(1, Math.floor(expiresInDaysRaw)))
      : 7;

    if (!adminUserId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const org = await Organization.findOne({ organizationId: orgId, isActive: true })
      .select("organizationId name code")
      .lean();
    if (!org) {
      return res.status(404).json({ message: "Organization not found or inactive." });
    }

    const isOrgAdmin = (req.user?.userOrgRoles || []).some(
      (role: any) => role.organizationId === orgId && role.role === "admin"
    );
    if (!isOrgAdmin) {
      return res.status(403).json({ message: "Only organization admins can create invites." });
    }

    let resolvedEmail = email;
    let resolvedInvitedUserId: string | null = invitedUserId || null;
    let resolvedInvitedUser: {
      userId: string;
      email: string;
      organizationIds?: string[];
      userOrgRoles?: Array<{ organizationId: string; role: "admin" | "faculty" }>;
    } | null = null;

    if (invitedUserId) {
      const invitedUser = await User.findOne({ userId: { $regex: buildUserIdLookupRegex(invitedUserId) } })
        .select("userId email organizationIds userOrgRoles")
        .lean();
      if (!invitedUser) {
        return res.status(404).json({ message: "User ID not found." });
      }

      resolvedInvitedUser = {
        userId: String((invitedUser as any).userId || ""),
        email: String((invitedUser as any).email || "").trim().toLowerCase(),
        organizationIds: Array.isArray((invitedUser as any).organizationIds)
          ? (invitedUser as any).organizationIds
          : [],
        userOrgRoles: Array.isArray((invitedUser as any).userOrgRoles)
          ? (invitedUser as any).userOrgRoles
          : [],
      };

      const userEmail = String((invitedUser as any).email || "").trim().toLowerCase();
      if (!resolvedEmail) {
        resolvedEmail = userEmail;
      } else if (resolvedEmail !== userEmail) {
        return res.status(400).json({
          message: "Provided email does not match the specified user ID.",
        });
      }
    }

    if (resolvedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resolvedEmail)) {
      return res.status(400).json({ message: "Invalid email format." });
    }

    if (resolvedEmail && !resolvedInvitedUserId) {
      const invitedUserByEmail = await User.findOne({ email: resolvedEmail })
        .select("userId email organizationIds userOrgRoles")
        .lean();

      if (!invitedUserByEmail) {
        return res.status(404).json({
          message: "No registered user found with this email address.",
        });
      }

      resolvedInvitedUserId = String((invitedUserByEmail as any).userId || "").trim() || null;
      resolvedInvitedUser = {
        userId: String((invitedUserByEmail as any).userId || ""),
        email: String((invitedUserByEmail as any).email || "").trim().toLowerCase(),
        organizationIds: Array.isArray((invitedUserByEmail as any).organizationIds)
          ? (invitedUserByEmail as any).organizationIds
          : [],
        userOrgRoles: Array.isArray((invitedUserByEmail as any).userOrgRoles)
          ? (invitedUserByEmail as any).userOrgRoles
          : [],
      };
    }

    if (resolvedInvitedUserId === adminUserId) {
      return res.status(400).json({
        message: "You cannot send an invite to yourself.",
      });
    }

    if (resolvedInvitedUserId && !resolvedInvitedUser) {
      const invitedUserForChecks = await User.findOne({ userId: { $regex: buildUserIdLookupRegex(resolvedInvitedUserId) } })
        .select("userId email organizationIds userOrgRoles")
        .lean();

      if (!invitedUserForChecks) {
        return res.status(404).json({ message: "User ID not found." });
      }

      resolvedInvitedUser = {
        userId: String((invitedUserForChecks as any).userId || ""),
        email: String((invitedUserForChecks as any).email || "").trim().toLowerCase(),
        organizationIds: Array.isArray((invitedUserForChecks as any).organizationIds)
          ? (invitedUserForChecks as any).organizationIds
          : [],
        userOrgRoles: Array.isArray((invitedUserForChecks as any).userOrgRoles)
          ? (invitedUserForChecks as any).userOrgRoles
          : [],
      };
    }

    if (resolvedInvitedUser && isUserMemberOfOrganization(resolvedInvitedUser, orgId)) {
      return res.status(409).json({
        message: "This user is already a member of the organization.",
      });
    }

    if (resolvedEmail || resolvedInvitedUserId) {
      const inviteLookupFilters: any[] = [];
      if (resolvedInvitedUserId) {
        inviteLookupFilters.push({ invitedUserId: resolvedInvitedUserId });
      }
      if (resolvedEmail) {
        inviteLookupFilters.push({ invitedEmail: resolvedEmail });
      }

      const activeInvite = await OrganizationInvite.findOne({
        organizationId: orgId,
        revokedAt: null,
        rejectedAt: null,
        expiresAt: { $gt: new Date() },
        useCount: { $lt: 1 },
        $or: inviteLookupFilters,
      })
        .select("createdAt expiresAt")
        .lean();

      if (activeInvite) {
        return res.status(409).json({
          message: "An active invite already exists for this person. Revoke or wait for expiry before creating another.",
        });
      }
    } else {
      const activePublicInvite = await OrganizationInvite.findOne({
        organizationId: orgId,
        revokedAt: null,
        rejectedAt: null,
        expiresAt: { $gt: new Date() },
        invitedUserId: null,
        invitedEmail: null,
      }).lean();

      if (activePublicInvite) {
        const frontendUrl = String(process.env.FRONTEND_URL || "").trim().replace(/\/$/, "");
        if (!frontendUrl) {
          return res.status(500).json({ message: "FRONTEND_URL is not configured." });
        }
        const inviteLink = `${frontendUrl}/invite/${encodeURIComponent(activePublicInvite.token)}`;
        return res.status(200).json({
          message: "Active public link copied.",
          invite: {
            token: activePublicInvite.token,
            inviteLink,
          }
        });
      }
    }

    const now = Date.now();
    const expiresAt = new Date(now + expiresInDays * 24 * 60 * 60 * 1000);
    const token = nanoid(32);

    await OrganizationInvite.create({
      token,
      organizationId: orgId,
      createdBy: adminUserId,
      invitedEmail: resolvedEmail || null,
      invitedUserId: resolvedInvitedUserId,
      expiresAt,
    });

    const frontendUrl = String(process.env.FRONTEND_URL || "").trim().replace(/\/$/, "");
    if (!frontendUrl) {
      return res.status(500).json({ message: "FRONTEND_URL is not configured." });
    }
    const inviteLink = `${frontendUrl}/invite/${encodeURIComponent(token)}`;

    const adminUser = await User.findOne({ userId: adminUserId }).select("name email").lean();
    if (resolvedEmail) {
      await sendOrganizationInviteEmail({
        to: resolvedEmail,
        organizationName: (org as any).name,
        organizationCode: (org as any).code,
        invitedByName: (adminUser as any)?.name || null,
        invitedByEmail: (adminUser as any)?.email || null,
        inviteLink,
        expiresAt,
      });
    }

    await logAudit("organization_updated", adminUserId, orgId, {
      scope: "invite_created",
      organizationId: orgId,
      invitedEmail: resolvedEmail || null,
      invitedUserId: resolvedInvitedUserId,
      expiresAt,
    }, orgId);

    return res.status(201).json({
      message: resolvedEmail ? "Invite sent successfully." : "Invite link created successfully.",
      invite: {
        token,
        inviteLink,
        invitedEmail: resolvedEmail || null,
        invitedUserId: resolvedInvitedUserId,
        expiresAt,
      },
    });
  } catch (error) {
    console.error("[Create Organization Invite] Error:", error);
    return res.status(500).json({ message: "Failed to create organization invite." });
  }
};

/**
 * Approve a user's org join request
 * PATCH /api/admin/organizations/:orgId/join-requests/:userId/approve
 */
export const approveJoinRequest = async (req: Request, res: Response) => {
  try {
    const { orgId, userId: targetUserId } = req.params;
    const adminUserId = req.user?.userId;
    const orgIdStr = Array.isArray(orgId) ? orgId[0] : orgId;
    const targetUserIdStr = Array.isArray(targetUserId) ? targetUserId[0] : targetUserId;

    if (!adminUserId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const org = await Organization.findOne({
      organizationId: orgIdStr,
      isActive: true,
    });
    if (!org) {
      return res.status(404).json({ message: "Organization not found or inactive." });
    }

    const pendingRequest = await OrganizationJoinRequest.findOne({
      userId: targetUserIdStr,
      organizationId: orgIdStr,
      status: "pending",
    })
      .select("userId organizationId requestedAt")
      .lean();

    const targetUser = await User.findOne({ userId: targetUserIdStr });
    const adminUser = await User.findOne({ userId: adminUserId }).select("name email").lean();

    if (!pendingRequest || !targetUser) {
      return res.status(404).json({
        message: "Join request not found or already processed.",
      });
    }

    // Approve: add org to organizationIds, remove from requestedOrganizationIds
    if (!targetUser.organizationIds) targetUser.organizationIds = [];
    if (!targetUser.organizationIds.includes(orgIdStr)) {
      targetUser.organizationIds.push(orgIdStr);
    }
    if (!targetUser.currentOrganizationId) {
      targetUser.currentOrganizationId = orgIdStr;
    }
    targetUser.requestedOrganizationIds = (targetUser.requestedOrganizationIds || []).filter(
      (id: string) => id !== orgIdStr
    );
    await targetUser.save();

    await OrganizationJoinRequest.updateOne(
      { userId: targetUserIdStr, organizationId: orgIdStr },
      {
        $set: {
          status: "approved",
          processedAt: new Date(),
          processedBy: adminUserId,
        },
      }
    );

    emitToUser(targetUserIdStr, "user:org-membership-changed", {
      type: "approved",
      organizationId: orgIdStr,
      at: new Date().toISOString(),
    });
    emitOrganizationMembershipUpdated(orgIdStr, "joined", targetUserIdStr, adminUserId);

    broadcastToAdmins("organization:join-request-updated", {
      type: "approved",
      organizationId: orgIdStr,
      userId: targetUserIdStr,
      userName: targetUser.name,
      userEmail: targetUser.email,
      requestSource: "invite",
      at: new Date().toISOString(),
    });

    await syncOrgMembers(orgIdStr);

    await logAudit("org_join_approved", adminUserId, orgIdStr, {
      targetUserId: targetUserIdStr,
      organizationName: org.name,
    }, orgIdStr);

    if (targetUser.email) {
      await sendOrgJoinApprovalEmail({
        to: targetUser.email,
        userName: targetUser.name || "User",
        organizationName: org.name,
        organizationCode: org.code,
        decidedByName: (adminUser as any)?.name || null,
        decidedByEmail: (adminUser as any)?.email || null,
      });
    }

    return res.json({
      message: `${targetUser.name} has been approved to join ${org.name}.`,
    });
  } catch (error) {
    console.error("[Approve Join Request] Error:", error);
    return res.status(500).json({
      message: "Failed to approve join request.",
    });
  }
};

/**
 * Reject a user's org join request
 * PATCH /api/admin/organizations/:orgId/join-requests/:userId/reject
 */
export const rejectJoinRequest = async (req: Request, res: Response) => {
  try {
    const { orgId, userId: targetUserId } = req.params;
    const adminUserId = req.user?.userId;
    const orgIdStr = Array.isArray(orgId) ? orgId[0] : orgId;
    const targetUserIdStr = Array.isArray(targetUserId) ? targetUserId[0] : targetUserId;

    if (!adminUserId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const org = await Organization.findOne({ organizationId: orgIdStr })
      .select("organizationId name code")
      .lean();
    if (!org) {
      return res.status(404).json({ message: "Organization not found." });
    }

    const pendingRequest = await OrganizationJoinRequest.findOne({
      userId: targetUserIdStr,
      organizationId: orgIdStr,
      status: "pending",
    }).lean();

    const targetUser = await User.findOne({ userId: targetUserIdStr });
    const adminUser = await User.findOne({ userId: adminUserId }).select("name email").lean();

    if (!pendingRequest || !targetUser) {
      return res.status(404).json({
        message: "Join request not found or already processed.",
      });
    }

    // Reject: remove from requestedOrganizationIds
    targetUser.requestedOrganizationIds = (targetUser.requestedOrganizationIds || []).filter(
      (id: string) => id !== orgIdStr
    );
    await targetUser.save();

    await OrganizationJoinRequest.updateOne(
      { userId: targetUserIdStr, organizationId: orgIdStr },
      {
        $set: {
          status: "rejected",
          processedAt: new Date(),
          processedBy: adminUserId,
        },
      }
    );

    broadcastToAdmins("organization:join-request-updated", {
      type: "rejected",
      organizationId: orgIdStr,
      userId: targetUserIdStr,
      userName: targetUser.name,
      userEmail: targetUser.email,
      requestSource: "invite",
      at: new Date().toISOString(),
    });

    await logAudit("org_join_rejected", adminUserId, orgIdStr, {
      targetUserId: targetUserIdStr,
    }, orgIdStr);

    if (targetUser.email) {
      await sendOrgJoinRejectionEmail({
        to: targetUser.email,
        userName: targetUser.name || "User",
        organizationName: org.name,
        organizationCode: org.code,
        decidedByName: (adminUser as any)?.name || null,
        decidedByEmail: (adminUser as any)?.email || null,
      });
    }

    return res.json({
      message: `Join request from ${targetUser.name} has been rejected.`,
    });
  } catch (error) {
    console.error("[Reject Join Request] Error:", error);
    return res.status(500).json({
      message: "Failed to reject join request.",
    });
  }
};

/**
 * Promote a member to organization admin
 * PATCH /api/admin/organizations/:orgId/members/:userId/promote
 */
export const promoteToAdmin = async (req: Request, res: Response) => {
  try {
    const adminUserId = req.user?.userId;
    const orgIdStr = String(req.params.orgId);
    const targetUserIdStr = String(req.params.userId);

    if (!adminUserId || !orgIdStr || !targetUserIdStr) {
      return res.status(400).json({
        message: "Missing required parameters.",
      });
    }

    // Check if target member exists in org
    const targetUser = await User.findOne({
      userId: targetUserIdStr,
      organizationIds: orgIdStr,
    });

    if (!targetUser) {
      return res.status(404).json({
        message: "Member not found in this organization.",
      });
    }

    // Ensure userOrgRoles array exists
    const existingRoleIdx = (targetUser.userOrgRoles as any[]).findIndex(
      (r: any) => r.organizationId === orgIdStr
    );

    if (existingRoleIdx !== -1) {
      if ((targetUser.userOrgRoles as any[])[existingRoleIdx].role === "admin") {
        return res.status(409).json({
          message: `${targetUser.name} is already an organization admin.`,
        });
      }
      // Promote from faculty to admin
      (targetUser.userOrgRoles as any[])[existingRoleIdx].role = "admin";
    } else {
      // Create new role entry with admin
      (targetUser.userOrgRoles as any[]).push({
        organizationId: orgIdStr,
        role: "admin",
      });
    }

    await targetUser.save();

    await syncOrgMembers(orgIdStr);

    emitToUser(targetUserIdStr, "user:org-membership-changed", {
      type: "role_changed",
      organizationId: orgIdStr,
      at: new Date().toISOString(),
    });
    emitOrganizationMembershipUpdated(orgIdStr, "role_changed", targetUserIdStr, adminUserId);

    await logAudit("member_promoted_to_admin", adminUserId, orgIdStr, {
      targetUserId: targetUserIdStr,
    }, orgIdStr);

    return res.json({
      message: `${targetUser.name} has been promoted to organization admin.`,
    });
  } catch (error) {
    console.error("[Promote to Admin] Error:", error);
    return res.status(500).json({
      message: "Failed to promote member to admin.",
    });
  }
};

/**
 * Demote a member from organization admin
 * PATCH /api/admin/organizations/:orgId/members/:userId/demote
 */
export const demoteFromAdmin = async (req: Request, res: Response) => {
  try {
    const adminUserId = req.user?.userId;
    const orgIdStr = String(req.params.orgId);
    const targetUserIdStr = String(req.params.userId);

    if (!adminUserId || !orgIdStr || !targetUserIdStr) {
      return res.status(400).json({
        message: "Missing required parameters.",
      });
    }

    // Check if target member exists in org
    const targetUser = await User.findOne({
      userId: targetUserIdStr,
      organizationIds: orgIdStr,
    });

    if (!targetUser) {
      return res.status(404).json({
        message: "Member not found in this organization.",
      });
    }

    // Ensure userOrgRoles array exists
    const existingRoleIdx = (targetUser.userOrgRoles as any[]).findIndex(
      (r: any) => r.organizationId === orgIdStr
    );

    if (existingRoleIdx !== -1 && (targetUser.userOrgRoles as any[])[existingRoleIdx].role === "admin") {
      (targetUser.userOrgRoles as any[])[existingRoleIdx].role = "faculty";
      await targetUser.save();

      await syncOrgMembers(orgIdStr);

      emitToUser(targetUserIdStr, "user:org-membership-changed", {
        type: "role_changed",
        organizationId: orgIdStr,
        at: new Date().toISOString(),
      });
      emitOrganizationMembershipUpdated(orgIdStr, "role_changed", targetUserIdStr, adminUserId);

      await logAudit("member_demoted_from_admin", adminUserId, orgIdStr, {
        targetUserId: targetUserIdStr,
      }, orgIdStr);

      return res.json({
        message: `${targetUser.name} has been demoted from organization admin.`,
      });
    }

    return res.status(409).json({
      message: `${targetUser.name} is not an organization admin.`,
    });
  } catch (error) {
    console.error("[Demote from Admin] Error:", error);
    return res.status(500).json({
      message: "Failed to demote member from admin.",
    });
  }
};

/**
 * Leave organization (remove self)
 * POST /api/admin/organizations/:orgId/leave
 */
export const leaveOrganization = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const orgIdStr = String(req.params.orgId);

    if (!userId || !orgIdStr) {
      return res.status(400).json({
        message: "Missing required parameters.",
      });
    }

    const org = await Organization.findOne({ organizationId: orgIdStr });
    if (!org) {
      return res.status(404).json({ message: "Organization not found." });
    }

    // Check if user is member (or org admin)
    const user = await User.findOne({
      userId,
      organizationIds: orgIdStr,
    });

    if (!user) {
      return res.status(404).json({
        message: "You are not a member of this organization.",
      });
    }

    // Check if user is the owner and not the only member
    const memberCount = await User.countDocuments({ organizationIds: orgIdStr });
    if (userId === org.owner && memberCount > 1) {
      return res.status(409).json({
        message: "You are the owner of this organization. Please transfer ownership or remove all members before leaving.",
        isOwner: true,
        memberCount,
      });
    }

    // If owner and only member, delete the org
    if (userId === org.owner && memberCount === 1) {
      await Organization.deleteOne({ organizationId: orgIdStr });
      removeMembershipFromUser(user, orgIdStr);
      await user.save();

      emitToUser(userId, "user:org-membership-changed", {
        type: "left",
        organizationId: orgIdStr,
        at: new Date().toISOString(),
      });
      emitOrganizationMembershipUpdated(orgIdStr, "org_deleted", userId, userId);

      await logAudit("org_deleted_by_owner", userId, orgIdStr, {
        reason: "Owner was last member",
      }, orgIdStr);

      return res.json({
        message: `Organization "${org.name}" has been deleted as you were the only member.`,
        orgDeleted: true,
      });
    }

    // Remove user from org
    removeMembershipFromUser(user, orgIdStr);
    await user.save();

    emitToUser(userId, "user:org-membership-changed", {
      type: "left",
      organizationId: orgIdStr,
      at: new Date().toISOString(),
    });

    await syncOrgMembers(orgIdStr);
    emitOrganizationMembershipUpdated(orgIdStr, "left", userId, userId);

    await logAudit("member_left_org", userId, orgIdStr, {}, orgIdStr);

    return res.json({
      message: `You have left "${org.name}".`,
    });
  } catch (error) {
    console.error("[Leave Organization] Error:", error);
    return res.status(500).json({
      message: "Failed to leave organization.",
    });
  }
};

/**
 * Transfer organization ownership
 * PATCH /api/admin/organizations/:orgId/transfer-owner
 */
export const transferOwnership = async (req: Request, res: Response) => {
  try {
    const adminUserId = req.user?.userId;
    const orgIdStr = String(req.params.orgId);
    const newOwnerId = String(req.body?.newOwnerId || "").trim();

    if (!adminUserId || !orgIdStr || !newOwnerId) {
      return res.status(400).json({
        message: "Missing required parameters.",
      });
    }

    const org = await Organization.findOne({ organizationId: orgIdStr });
    if (!org) {
      return res.status(404).json({ message: "Organization not found." });
    }

    // Only current owner can transfer
    if (adminUserId !== org.owner) {
      return res.status(403).json({
        message: "Only the organization owner can transfer ownership.",
      });
    }

    if (newOwnerId === adminUserId) {
      return res.status(400).json({
        message: "New owner must be a different member.",
      });
    }

    // Check if new owner is a member
    const newOwner = await User.findOne({
      userId: newOwnerId,
      organizationIds: orgIdStr,
    });

    if (!newOwner) {
      return res.status(404).json({
        message: "New owner must be an existing member of this organization.",
      });
    }

    // Ensure new owner is an admin before owner field changes, avoiding partial transfer state.
    const roleEntries = Array.isArray(newOwner.userOrgRoles) ? (newOwner.userOrgRoles as any[]) : [];
    const existingRoleIdx = roleEntries.findIndex((r: any) => r.organizationId === orgIdStr);
    if (existingRoleIdx !== -1) {
      roleEntries[existingRoleIdx].role = "admin";
    } else {
      roleEntries.push({
        organizationId: orgIdStr,
        role: "admin",
      });
    }
    newOwner.userOrgRoles = roleEntries as any;
    await newOwner.save();

    // Transfer ownership only after new owner's admin role update succeeds.
    org.owner = newOwnerId;
    await org.save();

    await syncOrgMembers(orgIdStr);

    emitToUser(newOwnerId, "user:org-membership-changed", {
      type: "role_changed",
      organizationId: orgIdStr,
      at: new Date().toISOString(),
    });
    emitOrganizationMembershipUpdated(orgIdStr, "role_changed", newOwnerId, adminUserId);
    emitToUser(adminUserId, "user:org-membership-changed", {
      type: "role_changed",
      organizationId: orgIdStr,
      at: new Date().toISOString(),
    });
    emitOrganizationMembershipUpdated(orgIdStr, "role_changed", adminUserId, adminUserId);

    await logAudit("org_ownership_transferred", adminUserId, orgIdStr, {
      newOwnerId,
    }, orgIdStr);

    return res.json({
      message: `Ownership of "${org.name}" has been transferred to ${newOwner.name}.`,
    });
  } catch (error) {
    console.error("[Transfer Ownership] Error:", error);
    return res.status(500).json({
      message: "Failed to transfer ownership.",
    });
  }
};

/**
 * Delete organization
 * DELETE /api/admin/organizations/:orgId
 */
export const deleteOrganization = async (req: Request, res: Response) => {
  try {
    const adminUserId = req.user?.userId;
    const orgIdStr = String(req.params.orgId);

    if (!adminUserId || !orgIdStr) {
      return res.status(400).json({
        message: "Missing required parameters.",
      });
    }

    const org = await Organization.findOne({ organizationId: orgIdStr });
    if (!org) {
      return res.status(404).json({ message: "Organization not found." });
    }

    // Only owner can delete
    if (adminUserId !== org.owner) {
      return res.status(403).json({
        message: "Only the organization owner can delete this organization.",
      });
    }

    const orgName = org.name;
    const affectedMembers = await User.find({ organizationIds: orgIdStr }).select("userId").lean();

    // Remove org from all members
    await User.updateMany(
      { organizationIds: orgIdStr },
      {
        $pull: {
          organizationIds: orgIdStr,
          userOrgRoles: { organizationId: orgIdStr },
        },
      }
    );

    for (const member of affectedMembers as any[]) {
      emitToUser(String(member.userId), "user:org-membership-changed", {
        type: "org_deleted",
        organizationId: orgIdStr,
        at: new Date().toISOString(),
      });

      emitOrganizationMembershipUpdated(orgIdStr, "org_deleted", String(member.userId), adminUserId);
    }

    // Delete the organization
    await Organization.deleteOne({ organizationId: orgIdStr });

    await logAudit("org_deleted", adminUserId, orgIdStr, {
      orgName,
    }, orgIdStr);

    return res.json({
      message: `Organization "${orgName}" has been deleted successfully.`,
    });
  } catch (error) {
    console.error("[Delete Organization] Error:", error);
    return res.status(500).json({
      message: "Failed to delete organization.",
    });
  }
};
