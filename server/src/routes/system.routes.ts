import { Router } from "express";
import { getSystemHealth, getSystemMetrics } from "../controllers/system.controller";
import { authenticate, requirePlatformOwner } from "../middleware/auth.middleware";
import { handleResendWebhook } from "../controllers/webhook.controller";

const router = Router();

router.get("/health", getSystemHealth);
router.post("/webhooks/resend", handleResendWebhook);
router.get("/metrics", authenticate, requirePlatformOwner, getSystemMetrics);

export default router;
