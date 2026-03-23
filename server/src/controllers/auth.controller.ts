import { Request, Response } from "express";
import User from "../models/User.model";
import OTPService from "../services/otp.service";
import redisClient from "../config/redis";
import { RESPONSE_MESSAGE, isValidEmail, normalizeUserDisplayName } from "../utils/auth.utils";
import Organization from "../models/Organization.model";
import OrganizationJoinRequest from "../models/OrganizationJoinRequest.model";
import OrganizationInvite from "../models/OrganizationInvite.model";
import { signToken, signRefreshToken, verifyRefreshToken } from "../services/token.service";
import {
    generateUserId,
} from "../utils/id.utils";
import { logAudit } from "../services/audit.service";
import sendOtpToEmail, { sendOrgJoinRequestSubmittedEmail } from "../services/email.service";
import {
    getNotificationDefaults,
    normalizeRecipientList,
} from "../utils/notification.utils";

const ACCESS_TOKEN_COOKIE_MAX_AGE = 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

const isProduction = process.env.NODE_ENV === "production";

const getCookieOptions = (maxAge: number) => ({
    httpOnly: true,
    sameSite: isProduction ? ("none" as const) : ("lax" as const),
    secure: isProduction,
    path: "/",
    maxAge,
});

const getClearCookieOptions = () => ({
    httpOnly: true,
    sameSite: isProduction ? ("none" as const) : ("lax" as const),
    secure: isProduction,
    path: "/",
});

const coerceIdToString = (value: unknown): string | null => {
    if (value == null) return null;

    if (typeof value === "string") {
        const normalized = value.trim();
        return normalized.length > 0 ? normalized : null;
    }

    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }

    if (typeof value === "object") {
        const maybeObj = value as Record<string, unknown>;

        if (typeof maybeObj.organizationId === "string" && maybeObj.organizationId.trim().length > 0) {
            return maybeObj.organizationId.trim();
        }

        if (typeof maybeObj.$oid === "string" && maybeObj.$oid.trim().length > 0) {
            return maybeObj.$oid.trim();
        }

        if (typeof (maybeObj as any).toString === "function") {
            const fromToString = String(maybeObj).trim();
            if (fromToString.length > 0 && fromToString !== "[object Object]") {
                return fromToString;
            }
        }
    }

    return null;
};

const dedupeStringArray = (values?: unknown[] | null): string[] => {
    if (!Array.isArray(values)) return [];
    const normalized = values
        .map((value) => coerceIdToString(value))
        .filter((value): value is string => Boolean(value));
    return Array.from(new Set(normalized));
};

const normalizeCurrentOrganizationIdFromIds = (
    currentOrganizationId: string | null | undefined,
    organizationIds: string[]
): string | null => {
    if (!organizationIds.length) return null;
    if (currentOrganizationId && organizationIds.includes(currentOrganizationId)) {
        return currentOrganizationId;
    }
    return organizationIds[0];
};

const getEffectiveOrganizationIds = async (
    user: any,
    arrays?: { organizationIds: string[]; userOrgRoles: any[] }
): Promise<string[]> => {
    const safeArrays = arrays || {
        organizationIds: dedupeStringArray(user.organizationIds),
        userOrgRoles: user.userOrgRoles || [],
    };

    // Treat user.organizationIds as the source of truth.
    // Only ownership is allowed as a repair source; denormalized members can be stale.
    const ownedOrgDocs = await Organization.find({
        owner: user.userId,
    })
        .select("organizationId")
        .lean();

    const ownedOrgIds = dedupeStringArray(
        (ownedOrgDocs as any[]).map((org) => org.organizationId)
    );

    const effectiveOrganizationIds = dedupeStringArray([
        ...safeArrays.organizationIds,
        ...ownedOrgIds,
    ]);

    const missingFromUserArray = effectiveOrganizationIds.filter(
        (id) => !safeArrays.organizationIds.includes(id)
    );

    if (missingFromUserArray.length > 0) {
        await User.updateOne(
            { userId: user.userId },
            { $addToSet: { organizationIds: { $each: missingFromUserArray } } }
        );
    }

    return effectiveOrganizationIds;
};

const getPendingOrgIdsFromRequests = async (userId: string): Promise<string[]> => {
    const pendingRequests = await OrganizationJoinRequest.find({
        userId,
        status: "pending",
    })
        .select("organizationId")
        .lean();

    return dedupeStringArray((pendingRequests as any[]).map((request) => request.organizationId));
};

const serializeNotificationDefaults = (user: any) => {
    const defaults = getNotificationDefaults(user);
    return {
        recipients: defaults.recipients,
        includeSelf: defaults.includeSelf,
        sendSessionEndEmail: defaults.sendSessionEndEmail,
        sendAbsenceEmail: defaults.sendAbsenceEmail,
        attachReport: defaults.attachReport,
    };
};

/**
 * Read-only normalization: returns clean arrays without mutating or saving the user document.
 * This avoids the write-on-read pattern which caused race conditions with concurrent
 * $addToSet operations (e.g. requestOrganizationChange), leading to data loss.
 */
const safeReadArrays = (user: any) => ({
    organizationIds: dedupeStringArray(user.organizationIds),
    requestedOrganizationIds: dedupeStringArray(user.requestedOrganizationIds),
    userOrgRoles: user.userOrgRoles || [],
});

/**
 * Derive orgAdmins array from userOrgRoles for backward compatibility
 */
const getOrgAdmins = (userOrgRoles: any[]): string[] => {
    return (userOrgRoles || []).filter((r) => r.role === "admin").map((r) => r.organizationId);
};

/**
 * Get effective role for current organization (for JWT and responses)
 */
const getEffectiveRole = (user: any): "admin" | "faculty" => {
    const currentOrgRole = (user.userOrgRoles || []).find(
        (r: any) => r.organizationId === user.currentOrganizationId
    );
    return currentOrgRole?.role === "admin" ? "admin" : "faculty";
};

const getPlatformRole = (user: any): "user" | "superAdmin" | "platform_owner" => {
    if (user.platformRole === "superAdmin" || user.platformRole === "platform_owner") {
        return user.platformRole;
    }
    return "user";
};

/**
 * UNIFIED SIGNUP
 * Universal signup
 */
export const signup = async (req: Request, res: Response) => {
    try {
        const { name, email, inviteToken } = req.body;

        if (!name || !email) {
            return res.status(400).json({
                message: "Name and email are required.",
            });
        }

        if (!isValidEmail(email)) {
            return res.status(400).json({
                message: "Please provide a valid email address.",
            });
        }

        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.status(409).json({
                message: "An account with this email already exists.",
            });
        }

        let resolvedOrgId: string | null = null;
        let resolvedInviteToken: string | null = null;
        if (typeof inviteToken === "string" && inviteToken.trim()) {
            const normalizedToken = inviteToken.trim();
            const invite = await OrganizationInvite.findOne({ token: normalizedToken }).lean();
            if (!invite || (invite as any).revokedAt || new Date((invite as any).expiresAt).getTime() <= Date.now()) {
                return res.status(400).json({
                    message: "Invite link is invalid or expired.",
                });
            }

            const invitedEmail = String((invite as any).invitedEmail || "").trim().toLowerCase();
            const normalizedEmail = String(email).trim().toLowerCase();
            if (invitedEmail && invitedEmail !== normalizedEmail) {
                return res.status(403).json({ message: "This invite is for a different email address." });
            }

            const org = await Organization.findOne({
                organizationId: (invite as any).organizationId,
                isActive: true,
            })
                .select("organizationId")
                .lean();

            if (!org) {
                return res.status(400).json({ message: "The invited organization is unavailable." });
            }

            resolvedOrgId = (org as any).organizationId;
            resolvedInviteToken = normalizedToken;
        }

        // Store signup payload temporarily in Redis
        await redisClient.setEx(
            `signup:data:${email}`,
            600, // 10 minutes
            JSON.stringify({
                name: name.trim(),
                email,
                requestedOrganizationId: resolvedOrgId,
                inviteToken: resolvedInviteToken,
            })
        );

        const firstName = String(name).trim().split(/\s+/)[0] || "there";
        await sendOtpToEmail(email, firstName);

        return res.status(200).json({
            message: RESPONSE_MESSAGE.signup.initiated,
        });

    } catch (error) {
        console.error("Signup error:", error);
        return res.status(500).json({
            message: "Signup failed. Please try again later.",
        });
    }
};

/**
 * UNIFIED LOGIN
 */
export const login = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                message: "Email is required.",
            });
        }

        if (!isValidEmail(email)) {
            return res.status(400).json({
                message: "Please provide a valid email address.",
            });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({
                message: RESPONSE_MESSAGE.auth.userNotFound,
            });
        }

    const normalizedName = normalizeUserDisplayName(user.name).value;
    const firstName = (normalizedName || "there").split(/\s+/)[0] || "there";
    await sendOtpToEmail(email, firstName);

        return res.status(200).json({
            message: RESPONSE_MESSAGE.otp.sent,
        });
    } catch (error) {
        console.error("Login error:", error);
        return res.status(500).json({
            message: RESPONSE_MESSAGE.otp.serviceError,
        });
    }
};

/**
 * RESEND OTP
 */
export const resendOtp = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                message: "Email is required.",
            });
        }

        if (!isValidEmail(email)) {
            return res.status(400).json({
                message: "Please provide a valid email address.",
            });
        }

        const user = await User.findOne({ email });
        const signupDataRaw = await redisClient.get(`signup:data:${email}`);

        if (!user && !signupDataRaw) {
            return res.status(404).json({
                message: RESPONSE_MESSAGE.auth.userNotFound,
            });
        }

        let firstName = "there";
        if (user?.name) {
            const normalizedName = normalizeUserDisplayName(user.name).value;
            firstName = (normalizedName || "there").split(/\s+/)[0] || "there";
        } else if (signupDataRaw) {
            try {
                const signupData = JSON.parse(signupDataRaw) as { name?: string };
                const normalizedName = normalizeUserDisplayName(signupData.name).value;
                firstName = (normalizedName || "there").split(/\s+/)[0] || "there";
            } catch {
                firstName = "there";
            }
        }

        await sendOtpToEmail(email, firstName);

        return res.status(200).json({
            message: RESPONSE_MESSAGE.otp.sent,
        });
    } catch (error: any) {
        return res.status(500).json({
            message: error?.message || RESPONSE_MESSAGE.otp.serviceError,
        });
    }
};

/**
 * OTP VERIFICATION
 */
export const verifyOtp = async (req: Request, res: Response) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({
                message: "Email and OTP are required.",
            });
        }

        const isValid = await OTPService.verify(email, otp);

        if (!isValid) {
            return res.status(401).json({
                message: RESPONSE_MESSAGE.otp.invalid,
            });
        }

        const signupDataRaw = await redisClient.get(`signup:data:${email}`);

        let user;

        if (signupDataRaw) {
            const signupData = JSON.parse(signupDataRaw);

            user = await User.create({
                userId: generateUserId(),
                organizationIds: [],
                requestedOrganizationIds: signupData.requestedOrganizationId ? [signupData.requestedOrganizationId] : [],
                userOrgRoles: [],
                platformRole: "user",
                name: signupData.name,
                email: signupData.email,
                adminStatus: "none",
            });

            if (signupData.requestedOrganizationId) {
                await OrganizationJoinRequest.updateOne(
                    { userId: user.userId, organizationId: signupData.requestedOrganizationId },
                    {
                        $set: {
                            status: "pending",
                            requestedAt: new Date(),
                            processedAt: null,
                            processedBy: null,
                            requestSource: signupData.inviteToken ? "invite" : "direct",
                            inviteToken: signupData.inviteToken || null,
                        },
                    },
                    { upsert: true }
                );

                const org = await Organization.findOne({ organizationId: signupData.requestedOrganizationId })
                    .select("name code")
                    .lean();
                if (org && user.email) {
                    await sendOrgJoinRequestSubmittedEmail({
                        to: user.email,
                        userName: user.name,
                        organizationName: (org as any).name,
                        organizationCode: (org as any).code,
                    });
                }
            }

            await redisClient.del(`signup:data:${email}`);
        } else {
            user = await User.findOne({ email });

            if (!user) {
                return res.status(404).json({
                    message: RESPONSE_MESSAGE.auth.userNotFound,
                });
            }
        }

        const arrays = safeReadArrays(user);
        const effectiveOrganizationIds = await getEffectiveOrganizationIds(user, arrays);

        const normalizedCurrentOrganizationId = normalizeCurrentOrganizationIdFromIds(
            user.currentOrganizationId,
            effectiveOrganizationIds
        );
        if (user.currentOrganizationId !== normalizedCurrentOrganizationId) {
            user.currentOrganizationId = normalizedCurrentOrganizationId;
            await user.save();
        }

          const token = signToken({
            userId: user.userId,
            role: getEffectiveRole(user),
            platformRole: getPlatformRole(user),
        });
          const refreshToken = signRefreshToken({
              userId: user.userId,
              role: getEffectiveRole(user),
              platformRole: getPlatformRole(user),
          });

          res.cookie("token", token, getCookieOptions(ACCESS_TOKEN_COOKIE_MAX_AGE));
          res.cookie("refreshToken", refreshToken, getCookieOptions(REFRESH_TOKEN_COOKIE_MAX_AGE));

        console.log(`[verifyOtp] User ${user.userId} – requestedOrganizationIds:`, arrays.requestedOrganizationIds);

        const orgAdmins = getOrgAdmins(arrays.userOrgRoles);
        const effectiveRole = getEffectiveRole(user);
        const platformRole = getPlatformRole(user);

        return res.json({
            message: RESPONSE_MESSAGE.auth.loggedIn,
            userId: user.userId,
            role: effectiveRole,
            platformRole,
            adminStatus: user.adminStatus,
            email: user.email,
            name: user.name,
            organizationIds: effectiveOrganizationIds,
            orgAdmins,
            requestedOrganizationIds: arrays.requestedOrganizationIds,
            currentOrganizationId: user.currentOrganizationId || null,
            notificationDefaults: serializeNotificationDefaults(user),
        });
    } catch (error: any) {
        return res.status(401).json({
            message: error.message || RESPONSE_MESSAGE.otp.invalid,
        });
    }
};

/**
   * REFRESH SESSION
   * POST /api/auth/refresh
   */
  export const refreshSession = async (req: Request, res: Response) => {
      try {
          const refreshToken = req.cookies?.refreshToken;
          if (!refreshToken) {
              return res.status(401).json({ message: "Refresh token missing." });
          }

          const decoded = verifyRefreshToken(refreshToken);
          const user = await User.findOne({ userId: decoded.userId });
          if (!user) {
              return res.status(401).json({ message: "Invalid refresh session." });
          }

          const arrays = safeReadArrays(user);
          const effectiveRole = getEffectiveRole(user);
          const platformRole = getPlatformRole(user);

          const newAccessToken = signToken({
              userId: user.userId,
              role: effectiveRole,
              platformRole,
          });
          const newRefreshToken = signRefreshToken({
              userId: user.userId,
              role: effectiveRole,
              platformRole,
          });

          res.cookie("token", newAccessToken, getCookieOptions(ACCESS_TOKEN_COOKIE_MAX_AGE));
          res.cookie("refreshToken", newRefreshToken, getCookieOptions(REFRESH_TOKEN_COOKIE_MAX_AGE));

          return res.status(200).json({
              message: "Session refreshed successfully.",
              userId: user.userId,
              role: effectiveRole,
              platformRole,
              requestedOrganizationIds: arrays.requestedOrganizationIds,
          });
      } catch {
          return res.status(401).json({ message: "Invalid or expired refresh token." });
      }
  };

  /**
 * LOGOUT
 */
export const logout = async (_req: Request, res: Response) => {
    const clearOptions = getClearCookieOptions();
    res.clearCookie("token", clearOptions);
    res.clearCookie("refreshToken", clearOptions);

    return res.status(200).json({
        message: "Logged out successfully.",
    });
};

export const getCurrentUser = async (
    req: Request,
    res: Response
) => {
    if (!req.user?.userId) {
        return res.status(401).json({
            message: "Not authenticated",
        });
    }

    const user = await User.findOne({
        userId: req.user.userId,
    });

    if (!user) {
        return res.status(401).json({
            message: "Invalid session",
        });
    }

    const arrays = safeReadArrays(user);
    const effectiveOrganizationIds = await getEffectiveOrganizationIds(user, arrays);

    const normalizedCurrentOrganizationId = normalizeCurrentOrganizationIdFromIds(
        user.currentOrganizationId,
        effectiveOrganizationIds
    );
    if (user.currentOrganizationId !== normalizedCurrentOrganizationId) {
        user.currentOrganizationId = normalizedCurrentOrganizationId;
        await user.save();
    }

    console.log(`[getCurrentUser] User ${user.userId} – requestedOrganizationIds:`, arrays.requestedOrganizationIds);

    const orgAdmins = getOrgAdmins(arrays.userOrgRoles);
    const effectiveRole = getEffectiveRole(user);
    const platformRole = getPlatformRole(user);

    return res.json({
        userId: user.userId,
        name: user.name,
        email: user.email,
        role: effectiveRole,
        platformRole,
        adminStatus: user.adminStatus,
        organizationIds: effectiveOrganizationIds,
        orgAdmins,
        requestedOrganizationIds: arrays.requestedOrganizationIds,
        currentOrganizationId: normalizedCurrentOrganizationId,
        notificationDefaults: serializeNotificationDefaults(user),
    });
};

/**
 * GET MY NOTIFICATION DEFAULTS
 * GET /api/auth/me/notification-defaults
 */
export const getMyNotificationDefaults = async (req: Request, res: Response) => {
    try {
        if (!req.user?.userId) {
            return res.status(401).json({ message: "Not authenticated" });
        }

        const user = await User.findOne({ userId: req.user.userId })
            .select("notificationDefaults")
            .lean();

        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        return res.status(200).json({
            notificationDefaults: serializeNotificationDefaults(user),
        });
    } catch (error) {
        console.error("[Get Notification Defaults] Error:", error);
        return res.status(500).json({ message: "Failed to fetch notification defaults." });
    }
};

/**
 * UPDATE MY NOTIFICATION DEFAULTS
 * PATCH /api/auth/me/notification-defaults
 */
export const updateMyNotificationDefaults = async (req: Request, res: Response) => {
    try {
        if (!req.user?.userId) {
            return res.status(401).json({ message: "Not authenticated" });
        }

        const payload = req.body || {};
        const defaults = {
            recipients: normalizeRecipientList(payload.recipients),
            includeSelf: typeof payload.includeSelf === "boolean" ? payload.includeSelf : true,
            sendSessionEndEmail:
                typeof payload.sendSessionEndEmail === "boolean" ? payload.sendSessionEndEmail : true,
            sendAbsenceEmail:
                typeof payload.sendAbsenceEmail === "boolean" ? payload.sendAbsenceEmail : true,
            attachReport: typeof payload.attachReport === "boolean" ? payload.attachReport : true,
        };

        const updated = await User.findOneAndUpdate(
            { userId: req.user.userId },
            { $set: { notificationDefaults: defaults } },
            { returnDocument: "after" }
        )
            .select("userId notificationDefaults")
            .lean();

        if (!updated) {
            return res.status(404).json({ message: "User not found." });
        }

        await logAudit({
            action: "user_preferences_updated",
            performedBy: req.user.userId,
            targetId: updated.userId,
            targetResourceType: "user",
            metadata: {
                scope: "notification_defaults",
                recipientsCount: defaults.recipients.length,
                includeSelf: defaults.includeSelf,
                sendSessionEndEmail: defaults.sendSessionEndEmail,
                sendAbsenceEmail: defaults.sendAbsenceEmail,
                attachReport: defaults.attachReport,
            },
            ipAddress: req.ip,
            userAgent: req.get("user-agent") || undefined,
        });

        return res.status(200).json({
            message: "Notification defaults updated successfully.",
            notificationDefaults: serializeNotificationDefaults(updated),
        });
    } catch (error) {
        console.error("[Update Notification Defaults] Error:", error);
        return res.status(500).json({ message: "Failed to update notification defaults." });
    }
};

/**
 * UPDATE CURRENT USER NAME
 * PATCH /api/auth/me/name
 */
export const updateMyName = async (req: Request, res: Response) => {
    try {
        if (!req.user?.userId) {
            return res.status(401).json({
                message: "Not authenticated",
            });
        }

        const normalizedName = normalizeUserDisplayName(req.body?.name);
        if (!normalizedName.value) {
            return res.status(400).json({
                message: normalizedName.error || "Invalid name.",
            });
        }

        const user = await User.findOne({ userId: req.user.userId });

        if (!user) {
            return res.status(404).json({
                message: "User not found.",
            });
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
                scope: "self",
                oldName,
                newName: nextName,
            },
            ipAddress: req.ip,
            userAgent: req.get("user-agent") || undefined,
        });

        return res.status(200).json({
            message: "Name updated successfully.",
            user: {
                userId: user.userId,
                name: user.name,
                email: user.email,
            },
        });
    } catch (error) {
        console.error("[Update My Name] Error:", error);
        return res.status(500).json({
            message: "Failed to update name.",
        });
    }
};

/**
 * UPDATE CURRENT ORGANIZATION
 * PATCH /api/auth/current-organization
 */
export const updateCurrentOrganization = async (
    req: Request,
    res: Response
) => {
    if (!req.user?.userId) {
        return res.status(401).json({
            message: "Not authenticated",
        });
    }

    const { organizationId } = req.body;

    if (!organizationId) {
        return res.status(400).json({
            message: "Organization ID is required",
        });
    }

    const user = await User.findOne({
        userId: req.user.userId,
    });

    if (!user) {
        return res.status(401).json({
            message: "Invalid session",
        });
    }

    // Verify user is a member of the organization
    if (!user.organizationIds?.includes(organizationId)) {
        return res.status(403).json({
            message: "You are not a member of this organization",
        });
    }

    // Update current organization
    user.currentOrganizationId = organizationId;
    await user.save();

    return res.json({
        message: "Current organization updated successfully",
        currentOrganizationId: organizationId,
    });
};

/**
 * PUBLIC: List all active organizations for signup dropdown
 * GET /api/auth/organizations
 */
export const listPublicOrganizations = async (_req: Request, res: Response) => {
    try {
        const organizations = await Organization.find({ isActive: true })
            .select("organizationId name code description isActive createdBy members")
            .sort({ name: 1 })
            .lean();

        // Use denormalized members array for count (fallback to DB count)
        const orgsWithCounts = await Promise.all(
            organizations.map(async (org) => {
                const memberCount = (org as any).members?.length ?? await User.countDocuments({
                    organizationIds: org.organizationId,
                });

                return {
                    organizationId: org.organizationId,
                    name: org.name,
                    code: org.code,
                    description: org.description,
                    isActive: org.isActive,
                    memberCount,
                    owner: org.createdBy,
                };
            })
        );

        return res.json({ organizations: orgsWithCounts });
    } catch (error) {
        console.error("[Public Org List] Error:", error);
        return res.status(500).json({
            message: "Failed to fetch organizations.",
        });
    }
};

/**
 * AUTHENTICATED: List members for an organization (read-only, no admin permission required)
 * GET /api/auth/organizations/:orgId/members
 */
export const listOrganizationMembersForViewer = async (req: Request, res: Response) => {
    try {
        const { orgId } = req.params;
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
        const skip = (page - 1) * limit;

        const org = await Organization.findOne({ organizationId: orgId }).lean();
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

        const membersWithRoles = members.map((member: any) => {
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
            members: membersWithRoles,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(1, Math.ceil(total / limit)),
            },
        });
    } catch (error) {
        console.error("[Auth Members View] Error:", error);
        return res.status(500).json({ message: "Failed to fetch organization members." });
    }
};

/**
 * AUTHENTICATED: Existing user requests to join/switch organization
 * POST /api/auth/request-organization
 */
export const requestOrganizationChange = async (_req: Request, res: Response) => {
    try {
        return res.status(403).json({
            message: "Direct join requests are disabled. Please use an organization invite link from an admin.",
        });
    } catch (error) {
        console.error("[Request Organization Change] Error:", error);
        return res.status(500).json({ message: "Failed to submit organization request." });
    }
};

/**
 * AUTHENTICATED: Cancel pending organization join request
 * POST /api/auth/cancel-organization-request
 */
export const cancelOrganizationRequest = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { organizationId } = req.body as { organizationId?: string };

        if (!userId) {
            return res.status(401).json({ message: "Authentication required." });
        }

        if (!organizationId) {
            return res.status(400).json({ message: "organizationId is required." });
        }

        const user = await User.findOne({ userId }).select("userId organizationIds requestedOrganizationIds").lean();

        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        const pendingRequest = await OrganizationJoinRequest.findOne({
            userId,
            organizationId,
            status: "pending",
        }).lean();

        if (!pendingRequest) {
            return res.status(400).json({ message: "No pending request for this organization." });
        }

        await OrganizationJoinRequest.updateOne(
            { userId, organizationId },
            {
                $set: {
                    status: "cancelled",
                    processedAt: new Date(),
                    processedBy: userId,
                },
            }
        );

        await User.updateOne(
            { userId },
            { $pull: { requestedOrganizationIds: organizationId } }
        );

        const requestedOrganizationIds = await getPendingOrgIdsFromRequests(userId);

        return res.status(200).json({
            message: "Organization request cancelled successfully.",
            organizationIds: user.organizationIds || [],
            requestedOrganizationIds,
        });
    } catch (error) {
        console.error("[Cancel Organization Request] Error:", error);
        return res.status(500).json({ message: "Failed to cancel organization request." });
    }
};

/**
 * AUTHENTICATED: Get current user's pending organization requests
 * GET /api/auth/pending-organizations
 */
export const getPendingOrganizationRequests = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({ message: "Authentication required." });
        }

        const user = await User.findOne({ userId }).select("requestedOrganizationIds").lean();

        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        let requestedOrganizationIds = await getPendingOrgIdsFromRequests(userId);

        // Backfill for legacy data where only user.requestedOrganizationIds was populated
        if (requestedOrganizationIds.length === 0) {
            const legacyPendingIds = dedupeStringArray((user as any).requestedOrganizationIds || []);
            if (legacyPendingIds.length > 0) {
                await Promise.all(
                    legacyPendingIds.map((organizationId) =>
                        OrganizationJoinRequest.updateOne(
                            { userId, organizationId },
                            {
                                $set: {
                                    status: "pending",
                                    requestedAt: new Date(),
                                    processedAt: null,
                                    processedBy: null,
                                },
                            },
                            { upsert: true }
                        )
                    )
                );
                requestedOrganizationIds = legacyPendingIds;
            }
        }

        // Keep user document mirror aligned (without clearing unrelated values unexpectedly)
        await User.updateOne(
            { userId },
            { $set: { requestedOrganizationIds } }
        );

        return res.status(200).json({
            requestedOrganizationIds,
        });
    } catch (error) {
        console.error("[Get Pending Organization Requests] Error:", error);
        return res.status(500).json({ message: "Failed to fetch pending organization requests." });
    }
};

const resolveInviteAndOrgForUser = async (token: string, user: any) => {
    const invite = await OrganizationInvite.findOne({ token });
    if (!invite || invite.revokedAt || new Date(invite.expiresAt).getTime() <= Date.now()) {
        return { error: "Invite link is invalid or expired." };
    }

    const org = await Organization.findOne({
        organizationId: invite.organizationId,
        isActive: true,
    })
        .select("organizationId name code")
        .lean();

    if (!org) {
        return { error: "Organization not found or inactive." };
    }

    const invitedEmail = String(invite.invitedEmail || "").trim().toLowerCase();
    const userEmail = String(user.email || "").trim().toLowerCase();
    if (invitedEmail && invitedEmail !== userEmail) {
        return { error: "This invite is assigned to a different email address." };
    }

    const invitedUserId = String((invite as any).invitedUserId || "").trim();
    if (invitedUserId && invitedUserId !== user.userId) {
        return { error: "This invite is assigned to a different user." };
    }

    return { invite, org };
};

/**
 * PUBLIC: Resolve invite link metadata
 * GET /api/auth/org-invites/:token
 */
export const getOrganizationInviteByToken = async (req: Request, res: Response) => {
    try {
        const token = String(req.params.token || "").trim();
        if (!token) {
            return res.status(400).json({ message: "Invite token is required." });
        }

        const invite = await OrganizationInvite.findOne({ token }).lean();
        if (!invite || (invite as any).revokedAt || new Date((invite as any).expiresAt).getTime() <= Date.now()) {
            return res.status(404).json({ message: "Invite link is invalid or expired." });
        }

        const org = await Organization.findOne({ organizationId: (invite as any).organizationId, isActive: true })
            .select("organizationId name code description")
            .lean();
        if (!org) {
            return res.status(404).json({ message: "Organization not found." });
        }

        return res.status(200).json({
            token,
            organization: {
                organizationId: (org as any).organizationId,
                name: (org as any).name,
                code: (org as any).code,
                description: (org as any).description,
            },
            invite: {
                expiresAt: (invite as any).expiresAt,
                invitedEmail: (invite as any).invitedEmail || null,
                invitedUserId: (invite as any).invitedUserId || null,
            },
        });
    } catch (error) {
        console.error("[Get Org Invite By Token] Error:", error);
        return res.status(500).json({ message: "Failed to load invite link." });
    }
};

/**
 * AUTHENTICATED: Submit org join request via invite token
 * POST /api/auth/org-invites/:token/request
 */
export const requestOrganizationChangeViaInvite = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const token = String(req.params.token || "").trim();

        if (!userId) {
            return res.status(401).json({ message: "Authentication required." });
        }
        if (!token) {
            return res.status(400).json({ message: "Invite token is required." });
        }

        const invite = await OrganizationInvite.findOne({ token });
        if (!invite || invite.revokedAt || new Date(invite.expiresAt).getTime() <= Date.now()) {
            return res.status(404).json({ message: "Invite link is invalid or expired." });
        }

        const [user, org] = await Promise.all([
            User.findOne({ userId }),
            Organization.findOne({ organizationId: invite.organizationId, isActive: true }),
        ]);

        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }
        if (!org) {
            return res.status(404).json({ message: "Organization not found or inactive." });
        }

        const invitedEmail = String(invite.invitedEmail || "").trim().toLowerCase();
        if (invitedEmail && invitedEmail !== String(user.email || "").trim().toLowerCase()) {
            return res.status(403).json({ message: "This invite is assigned to a different email address." });
        }

        const arrays = safeReadArrays(user);
        const effectiveOrganizationIds = await getEffectiveOrganizationIds(user, arrays);
        if (effectiveOrganizationIds.includes(invite.organizationId)) {
            return res.status(400).json({ message: "You are already a member of this organization." });
        }

        const existingPending = await OrganizationJoinRequest.findOne({
            userId,
            organizationId: invite.organizationId,
            status: "pending",
        }).lean();
        if (existingPending) {
            return res.status(400).json({ message: "You already have a pending request for this organization." });
        }

        await OrganizationJoinRequest.updateOne(
            { userId, organizationId: invite.organizationId },
            {
                $set: {
                    status: "pending",
                    requestedAt: new Date(),
                    processedAt: null,
                    processedBy: null,
                    requestSource: "invite",
                    inviteToken: token,
                },
            },
            { upsert: true }
        );

        await User.updateOne(
            { userId, organizationIds: { $ne: invite.organizationId } },
            { $addToSet: { requestedOrganizationIds: invite.organizationId } }
        );

        invite.useCount = Number(invite.useCount || 0) + 1;
        await invite.save();

        if (user.email) {
            await sendOrgJoinRequestSubmittedEmail({
                to: user.email,
                userName: user.name,
                organizationName: org.name,
                organizationCode: org.code,
            });
        }

        const requestedOrganizationIds = await getPendingOrgIdsFromRequests(userId);
        return res.status(200).json({
            message: `Join request submitted for ${org.name}. Awaiting organization admin approval.`,
            requestedOrganizationIds,
            organizationIds: effectiveOrganizationIds,
            organizationId: invite.organizationId,
        });
    } catch (error) {
        console.error("[Request Organization Via Invite] Error:", error);
        return res.status(500).json({ message: "Failed to submit organization request via invite." });
    }
};

/**
 * AUTHENTICATED: Legacy accept endpoint.
 * Compatibility behavior now matches request flow so org-admin approval is always required.
 * POST /api/auth/org-invites/:token/accept
 */
export const acceptOrganizationInvite = async (req: Request, res: Response) => {
    return requestOrganizationChangeViaInvite(req, res);
};

/**
 * AUTHENTICATED: Reject invite and optionally revoke single-recipient invites
 * POST /api/auth/org-invites/:token/reject
 */
export const rejectOrganizationInvite = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const token = String(req.params.token || "").trim();

        if (!userId) {
            return res.status(401).json({ message: "Authentication required." });
        }
        if (!token) {
            return res.status(400).json({ message: "Invite token is required." });
        }

        const user = await User.findOne({ userId });
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        const resolved = await resolveInviteAndOrgForUser(token, user);
        if ((resolved as any).error) {
            return res.status(404).json({ message: (resolved as any).error });
        }

        const { invite, org } = resolved as any;
        const orgId = String(org.organizationId);

        user.requestedOrganizationIds = (user.requestedOrganizationIds || []).filter((id: string) => id !== orgId);
        await user.save();

        await OrganizationJoinRequest.updateOne(
            { userId, organizationId: orgId },
            {
                $set: {
                    status: "rejected",
                    requestSource: "invite",
                    inviteToken: token,
                    requestedAt: new Date(),
                    processedAt: new Date(),
                    processedBy: userId,
                },
            },
            { upsert: true }
        );

        if (invite.invitedEmail || (invite as any).invitedUserId) {
            invite.revokedAt = new Date();
            await invite.save();
        }

        return res.status(200).json({
            message: `Invite to ${org.name} rejected.`,
            organizationId: orgId,
            requestedOrganizationIds: dedupeStringArray(user.requestedOrganizationIds as any),
        });
    } catch (error) {
        console.error("[Reject Organization Invite] Error:", error);
        return res.status(500).json({ message: "Failed to reject invite." });
    }
};
