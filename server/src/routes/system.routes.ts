import { Router } from "express";
import { getSystemHealth, getSystemMetrics } from "../controllers/system.controller";
import { authenticate, requireSuperAdmin } from "../middleware/auth.middleware";

const router = Router();

router.get("/health", getSystemHealth);
router.get("/metrics", authenticate, requireSuperAdmin, getSystemMetrics);

export default router;
