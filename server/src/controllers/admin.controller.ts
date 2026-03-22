import { Request, Response } from "express";
import User from "../models/User.model";
import AuditLog from "../models/AuditLog.model";
import { logAudit } from "../services/audit.service";
import { normalizeUserDisplayName } from "../utils/auth.utils";

/**
 * Get all admins in organization
 * GET /api/admin/admins
 */
export const getAllAdmins = async (req: Request, res: Response) => {
    try {
        if (!req.user?.userId) {
            return res.status(401).json({ message: "Unauthorized." });
        }

        const isSuperAdmin = req.user.platformRole === "superAdmin";

        // Only org admins can view other admins
        const userAdminOrgs = (req.user?.userOrgRoles || [])
            .filter((r: any) => r.role === "admin")
            .map((r: any) => r.organizationId);

        if (!isSuperAdmin && userAdminOrgs.length === 0) {
            return res.status(403).json({ message: "You must be an organization admin to view other admins." });
        }

        // Find all users who are admin in the user's admin organizations
        const admins = await User.find(isSuperAdmin
            ? {
                userOrgRoles: {
                    $elemMatch: { role: "admin" },
                },
            }
            : {
                userOrgRoles: {
                    $elemMatch: {
                        organizationId: { $in: userAdminOrgs },
                        role: "admin",
                    },
                },
            })
            .select("userId name email userOrgRoles")
            .sort({ name: 1 })
            .lean();

        return res.json({ admins });
    } catch (error) {
        console.error("[Get All Admins] Error:", error);
        return res.status(500).json({
            message: "Failed to fetch admins.",
        });
    }
};

export const getAuditLogs = async (req: Request, res: Response) => {
    try {
        const isSuperAdmin = req.user?.platformRole === "superAdmin";
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
        const skip = (page - 1) * limit;

        const action = typeof req.query.action === "string" ? req.query.action.trim() : undefined;
        const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : undefined;
        const from = typeof req.query.from === "string" ? req.query.from.trim() : undefined;
        const to = typeof req.query.to === "string" ? req.query.to.trim() : undefined;

        const query: {
            action?: string;
            performedBy?: string;
            $or?: Array<any>;
            timestamp?: {
                $gte?: Date;
                $lte?: Date;
            };
        } = {};

        // Filter by current organization only (org-specific audit logs)
        const currentOrgId = req.user?.currentOrganizationId;
        if (!currentOrgId) {
            return res.status(400).json({ message: "No organization selected." });
        }

        // Verify user is admin in current org (unless platform superAdmin)
        const isAdminInCurrentOrg = (req.user?.userOrgRoles || []).some(
            (r: any) => r.organizationId === currentOrgId && r.role === "admin"
        );

        if (!isSuperAdmin && !isAdminInCurrentOrg) {
            return res.status(403).json({
                message: "You must be an admin in the current organization to view audit logs."
            });
        }

        // Filter by organization - include logs with matching organizationId OR logs without organizationId (legacy logs)
        query.$or = [
            { organizationId: currentOrgId },
            { organizationId: { $exists: false } },
            { organizationId: null }
        ];

        if (action) {
            query.action = action;
        }

        if (userId) {
            query.performedBy = userId;
        }

        if (from || to) {
            query.timestamp = {};
            if (from) {
                const fromDate = new Date(from);
                if (!Number.isNaN(fromDate.getTime())) {
                    query.timestamp.$gte = fromDate;
                }
            }

            if (to) {
                const toDate = new Date(to);
                if (!Number.isNaN(toDate.getTime())) {
                    query.timestamp.$lte = toDate;
                }
            }

            if (!query.timestamp.$gte && !query.timestamp.$lte) {
                delete query.timestamp;
            }
        }

        const [logs, total] = await Promise.all([
            AuditLog.find(query).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
            AuditLog.countDocuments(query),
        ]);

        return res.json({
            logs,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(1, Math.ceil(total / limit)),
            },
            filters: {
                action: action || null,
                userId: userId || null,
                from: from || null,
                to: to || null,
            },
        });
    } catch {
        return res.status(500).json({
            message: "Failed to fetch audit logs.",
        });
    }
};

/**
 * Update user name (superAdmin)
 * PATCH /api/admin/users/:userId/name
 */
export const updateUserNameBySuperAdmin = async (req: Request, res: Response) => {
    try {
        if (!req.user?.userId) {
            return res.status(401).json({ message: "Unauthorized." });
        }

        const targetUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
        if (!targetUserId) {
            return res.status(400).json({ message: "Target userId is required." });
        }

        const normalizedName = normalizeUserDisplayName(req.body?.name);
        if (!normalizedName.value) {
            return res.status(400).json({ message: normalizedName.error || "Invalid name." });
        }

        const user = await User.findOne({ userId: targetUserId });
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        const oldName = user.name;
        const nextName = normalizedName.value;

        if (oldName === nextName) {
            return res.status(200).json({
                message: "Name is already up to date.",
                user: {
                    userId: user.userId,
                    name: user.name,
                    email: user.email,
                },
            });
        }

        user.name = nextName;
        await user.save();

        await logAudit({
            action: "user_name_updated",
            performedBy: req.user.userId,
            targetId: user.userId,
            targetResourceType: "user",
            targetResourceName: user.name,
            metadata: {
                scope: "superAdmin",
                oldName,
                newName: nextName,
            },
            ipAddress: req.ip,
            userAgent: req.get("user-agent") || undefined,
        });

        return res.status(200).json({
            message: "User name updated successfully.",
            user: {
                userId: user.userId,
                name: user.name,
                email: user.email,
            },
        });
    } catch (error) {
        console.error("[Update User Name By SuperAdmin] Error:", error);
        return res.status(500).json({ message: "Failed to update user name." });
    }
};
