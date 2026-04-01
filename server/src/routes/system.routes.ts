import { Router } from "express";
import { getSystemHealth, getSystemMetrics } from "../controllers/system.controller";
import { authenticate, requirePlatformOwner } from "../middleware/auth.middleware";
import { handleResendWebhook } from "../controllers/webhook.controller";
import { submitLeadInquiry } from "../controllers/lead.controller";
import { leadInquiryRateLimiter } from "../middleware/rateLimit.middleware";

const router = Router();

router.get("/health", getSystemHealth);
router.post("/webhooks/resend", handleResendWebhook);
router.post("/lead-inquiries", leadInquiryRateLimiter, submitLeadInquiry);
router.get("/metrics", authenticate, requirePlatformOwner, getSystemMetrics);

export default router;
