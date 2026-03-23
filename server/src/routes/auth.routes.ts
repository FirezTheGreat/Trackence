import { Router } from "express";
import { signup, login, verifyOtp, resendOtp, logout, refreshSession, requestEmailRecovery } from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth.middleware";
import {
	getCurrentUser,
	listPublicOrganizations,
	listOrganizationMembersForViewer,
	requestOrganizationChange,
	cancelOrganizationRequest,
	getOrganizationInviteByToken,
	requestOrganizationChangeViaInvite,
	acceptOrganizationInvite,
	rejectOrganizationInvite,
	updateCurrentOrganization,
	updateMyName,
	getMyNotificationDefaults,
	updateMyNotificationDefaults,
	getPendingOrganizationRequests,
} from "../controllers/auth.controller";
import { authRateLimiter } from "../middleware/rateLimit.middleware";

const router = Router();

router.get("/organizations", listPublicOrganizations);
router.get("/organizations/:orgId/members", authenticate, listOrganizationMembersForViewer);
router.get("/org-invites/:token", getOrganizationInviteByToken);
router.post("/signup", authRateLimiter, signup);
router.post("/login", authRateLimiter, login);
router.post("/verify-otp", authRateLimiter, verifyOtp);
router.post("/resend-otp", authRateLimiter, resendOtp);
router.post("/recovery/email", authRateLimiter, requestEmailRecovery);
router.post("/refresh", authRateLimiter, refreshSession);
router.post("/logout", logout);

router.get("/me", authenticate, getCurrentUser);
router.patch("/me/name", authenticate, updateMyName);
router.get("/me/notification-defaults", authenticate, getMyNotificationDefaults);
router.patch("/me/notification-defaults", authenticate, updateMyNotificationDefaults);
router.patch("/current-organization", authenticate, updateCurrentOrganization);
router.get("/pending-organizations", authenticate, getPendingOrganizationRequests);
router.post("/request-organization", authenticate, requestOrganizationChange);
router.post("/org-invites/:token/request", authenticate, requestOrganizationChangeViaInvite);
router.post("/org-invites/:token/accept", authenticate, acceptOrganizationInvite);
router.post("/org-invites/:token/reject", authenticate, rejectOrganizationInvite);
router.post("/cancel-organization-request", authenticate, cancelOrganizationRequest);

export default router;
