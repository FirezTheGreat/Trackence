import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.model";
import Organization from "../models/Organization.model";
import { logger } from "../utils/logger";

interface JwtPayload {
    userId: string;
    role: "admin" | "member";
    platformRole?: "user" | "platform_owner";
}

/**
 * Authenticate user using JWT (cookie-based)
 */
export const authenticate = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const token = req.cookies?.token;

        if (!token) {
            logger.warn("Authentication failed: token missing", {
                requestId: req.requestId,
                path: req.originalUrl,
                method: req.method,
            });
            res.status(401).json({
                message: "Authentication required.",
            });
            return;
        }

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET!
        ) as JwtPayload;

        if (!decoded?.userId) {
            logger.warn("Authentication failed: invalid token payload", {
                requestId: req.requestId,
                path: req.originalUrl,
                method: req.method,
            });
            res.status(401).json({
                message: "Invalid session.",
            });
            return;
        }

        const user = await User.findOne({ userId: decoded.userId });

        if (!user) {
            logger.warn("Authentication failed: user not found", {
                requestId: req.requestId,
                path: req.originalUrl,
                method: req.method,
                userId: decoded.userId,
            });
            res.status(401).json({
                message: "Invalid session. Please login again.",
            });
            return;
        }

        // Compute effective role from current org
        const currentOrgId = user.currentOrganizationId && (user.organizationIds || []).includes(user.currentOrganizationId)
            ? user.currentOrganizationId
            : user.organizationIds?.[0] || null;

        const currentOrgRole = (user.userOrgRoles || []).find(
            (r: any) => r.organizationId === currentOrgId
        );
        const effectiveRole = currentOrgRole?.role === "admin" ? "admin" : "member";
        const platformRole = user.platformRole === "platform_owner" ? "platform_owner" : "user";

        req.user = {
            userId: user.userId,
            role: effectiveRole,
            platformRole,
            organizationIds: user.organizationIds || [],
            userOrgRoles: user.userOrgRoles || [],
            currentOrganizationId: currentOrgId,
        };

        next();
    } catch (error) {
        logger.warn("Authentication failed: token verification error", {
            requestId: req.requestId,
            path: req.originalUrl,
            method: req.method,
            error: error instanceof Error ? error.message : "Unknown error",
        });
        res.status(401).json({
            message: "Session expired or invalid.",
        });
    }
};

/**
 * Role-based authorization
 */
export const authorize =
    (...allowedRoles: ("admin" | "member" | "platform_owner")[]) =>
        (req: Request, res: Response, next: NextFunction): void => {
            if (!req.user) {
                res.status(401).json({
                    message: "Authentication required.",
                });
                return;
            }

            const hasPlatformOwnerAccess = req.user.platformRole === "platform_owner";

            const isPlatformOwnerAllowed =
                allowedRoles.includes("platform_owner") && hasPlatformOwnerAccess;

            if (!isPlatformOwnerAllowed && !allowedRoles.includes(req.user.role)) {
                res.status(403).json({
                    message: "You are not authorized to access this resource.",
                });
                return;
            }

            next();
        };

export const requirePlatformOwner = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    if (!req.user?.userId) {
        res.status(401).json({
            message: "Authentication required.",
        });
        return;
    }

    // Fast path: authenticate middleware already resolved platform role for this request.
    if (req.user.platformRole === "platform_owner") {
        next();
        return;
    }

    const user = await User.findOne({ userId: req.user.userId }).select("platformRole");

    if (!user || user.platformRole !== "platform_owner") {
        res.status(403).json({
            message: "Platform owner access required.",
        });
        return;
    }

    next();
};

/**
 * Require fully approved admin
 */
export const requireApprovedAdmin = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    if (!req.user?.userId) {
        res.status(401).json({
            message: "Authentication required.",
        });
        return;
    }

    const user = await User.findOne({ userId: req.user.userId });

    if (!user) {
        res.status(403).json({
            message: "User not found.",
        });
        return;
    }

    // Check if user is admin in any organization
    const isAdmin = (user.userOrgRoles || []).some((r: any) => r.role === "admin");

    if (!isAdmin) {
        res.status(403).json({
            message: "Admin access required in at least one organization.",
        });
        return;
    }

    next();
};

/**
 * Require at least one organization admin role
 * USE: For admin dashboard, general admin operations
 */
export const requireOrgAdmin = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    if (!req.user?.userId) {
        res.status(401).json({
            message: "Authentication required.",
        });
        return;
    }

    const user = await User.findOne({ userId: req.user.userId });

    if (!user) {
        res.status(403).json({
            message: "User not found.",
        });
        return;
    }

    // Check if user is admin in any organization
    const isAdmin = (user.userOrgRoles || []).some((r: any) => r.role === "admin");

    if (!isAdmin) {
        res.status(403).json({
            message: "Admin access required in at least one organization.",
        });
        return;
    }

    next();
};

/**
 * Require admin role within the target organization from route params.
 * Expects :orgId or :organizationId.
 */
export const requireTargetOrgAdmin = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    if (!req.user?.userId) {
        res.status(401).json({
            message: "Authentication required.",
        });
        return;
    }

    const targetOrgId = req.params.orgId || req.params.organizationId;
    if (!targetOrgId) {
        res.status(400).json({
            message: "Organization ID is required.",
        });
        return;
    }

    const [user, targetOrg] = await Promise.all([
        User.findOne({ userId: req.user.userId }),
        Organization.findOne({ organizationId: targetOrgId }).lean(),
    ]);

    if (!user) {
        res.status(403).json({
            message: "User not found.",
        });
        return;
    }

    if (!targetOrg) {
        res.status(404).json({
            message: "Organization not found.",
        });
        return;
    }

    const isMember = (user.organizationIds || []).includes(targetOrgId as string);
    const isTargetOrgAdmin = (user.userOrgRoles || []).some(
        (r: any) => r.organizationId === targetOrgId && r.role === "admin"
    );

    if (!isMember || !isTargetOrgAdmin) {
        res.status(403).json({
            message: "Organization admin access required.",
        });
        return;
    }

    next();
};

/**
 * Verify user can access the target organization
 * user must belong to target org
 * Expects :orgId in route params
 */
export const requireOrgOwnership = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    if (!req.user?.userId) {
        res.status(401).json({
            message: "Authentication required.",
        });
        return;
    }

    const user = await User.findOne({ userId: req.user.userId });

    if (!user) {
        res.status(403).json({
            message: "User not found.",
        });
        return;
    }

    // Get orgId from params (could be orgId or organizationId)
    const targetOrgId = req.params.orgId || req.params.organizationId;

    if (!targetOrgId) {
        res.status(400).json({
            message: "Organization ID is required.",
        });
        return;
    }

    const targetOrg = await Organization.findOne({ organizationId: targetOrgId }).lean();

    if (!targetOrg) {
        res.status(404).json({
            message: "Organization not found.",
        });
        return;
    }

    if (!(user.organizationIds || []).includes(targetOrgId as string)) {
        res.status(403).json({
            message: "You can only manage organizations you belong to.",
        });
        return;
    }

    next();
};
