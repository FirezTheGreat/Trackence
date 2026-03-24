import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { logger } from "../utils/logger";

const ONE_MINUTE_MS = 60 * 1000;
const AUTH_MAX_REQUESTS = 5;
const OTP_STATUS_MAX_REQUESTS = 30;
const ATTENDANCE_MAX_REQUESTS = 10;

/**
 * Rate limiter for auth endpoints (login, verify-otp)
 */
export const authRateLimiter = rateLimit({
  windowMs: ONE_MINUTE_MS,
  max: AUTH_MAX_REQUESTS,
  message: { message: "Too many attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn("Auth rate limit exceeded", {
      requestId: req.requestId,
      path: req.originalUrl,
      method: req.method,
      ip: req.ip,
    });
    res.status(429).json({ message: "Too many attempts. Please try again later." });
  },
});

/**
 * Rate limiter for lightweight OTP delivery status polling.
 */
export const otpStatusRateLimiter = rateLimit({
  windowMs: ONE_MINUTE_MS,
  max: OTP_STATUS_MAX_REQUESTS,
  message: { message: "Too many status checks. Please try again shortly." },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn("OTP delivery status rate limit exceeded", {
      requestId: req.requestId,
      path: req.originalUrl,
      method: req.method,
      ip: req.ip,
    });
    res.status(429).json({ message: "Too many status checks. Please try again shortly." });
  },
});

/**
 * Rate limiter for attendance mark endpoint
 */
export const attendanceMarkRateLimiter = rateLimit({
  windowMs: ONE_MINUTE_MS,
  max: ATTENDANCE_MAX_REQUESTS,
  keyGenerator: (req) => {
    const userId = req.user?.userId;
    if (userId) return `user:${userId}`;
    return ipKeyGenerator(req.ip || req.socket.remoteAddress || "unknown");
  },
  message: { message: "Too many attendance attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn("Excessive attendance mark attempts detected", {
      requestId: req.requestId,
      path: req.originalUrl,
      method: req.method,
      ip: req.ip,
    });
    res.status(429).json({ message: "Too many attendance attempts. Please try again later." });
  },
});
