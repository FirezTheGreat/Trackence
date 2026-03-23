import EmailNotification from "../models/EmailNotification.model";
import { sendMailNow } from "./mail-delivery.service";
import { logger } from "../utils/logger";
import redisClient from "../config/redis";

type EnqueuePayload = {
  eventType: string;
  fromCategory?: "default" | "otp" | "report" | "notification";
  organizationId?: string | null;
  sessionId?: string | null;
  triggeredBy?: string | null;
  to: string[];
  subject: string;
  html: string;
  text?: string | null;
  attachments?: Array<{
    filename: string;
    content: string;
    contentType?: string | null;
    contentEncoding?: "base64" | null;
  }>;
  metadata?: Record<string, unknown>;
  maxAttempts?: number;
};

type EventLimitProfile = {
  globalDaily: number;
  orgDaily: number;
  actorHourly: number;
  recipientDaily: number;
  forceIdempotentBySession: boolean;
};

let workerTimer: NodeJS.Timeout | null = null;
let isProcessing = false;

const RETRY_BASE_SECONDS = 20;
const WORKER_INTERVAL_MS = 5000;

const DEFAULT_EVENT_LIMITS: EventLimitProfile = {
  globalDaily: Number(process.env.EMAIL_GLOBAL_DAILY_CAP || 10000),
  orgDaily: Number(process.env.EMAIL_ORG_DAILY_CAP || 2000),
  actorHourly: Number(process.env.EMAIL_ACTOR_HOURLY_CAP || 200),
  recipientDaily: Number(process.env.EMAIL_RECIPIENT_DAILY_CAP || 25),
  forceIdempotentBySession: false,
};

const STRICT_EVENT_LIMITS: EventLimitProfile = {
  globalDaily: Number(process.env.EMAIL_STRICT_GLOBAL_DAILY_CAP || 3000),
  orgDaily: Number(process.env.EMAIL_STRICT_ORG_DAILY_CAP || 600),
  actorHourly: Number(process.env.EMAIL_STRICT_ACTOR_HOURLY_CAP || 60),
  recipientDaily: Number(process.env.EMAIL_STRICT_RECIPIENT_DAILY_CAP || 6),
  forceIdempotentBySession: false,
};

const SESSION_END_EVENT_LIMITS: EventLimitProfile = {
  globalDaily: Number(process.env.EMAIL_SESSION_END_GLOBAL_DAILY_CAP || 10000),
  orgDaily: Number(process.env.EMAIL_SESSION_END_ORG_DAILY_CAP || 3000),
  actorHourly: Number(process.env.EMAIL_SESSION_END_ACTOR_HOURLY_CAP || 500),
  recipientDaily: Number(process.env.EMAIL_SESSION_END_RECIPIENT_DAILY_CAP || 10),
  forceIdempotentBySession: true,
};

const resolveEventLimits = (eventType: string): EventLimitProfile => {
  const normalized = String(eventType || "").trim().toLowerCase();
  if (normalized === "session_ended" || normalized === "absence_detected") {
    return SESSION_END_EVENT_LIMITS;
  }

  if (normalized === "generic_notification") {
    return STRICT_EVENT_LIMITS;
  }

  return DEFAULT_EVENT_LIMITS;
};

const toUtcDayKey = (): string => {
  const now = new Date();
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
};

const toUtcHourKey = (): string => {
  const now = new Date();
  return `${toUtcDayKey()}${String(now.getUTCHours()).padStart(2, "0")}`;
};

const incrementRateKey = async (key: string, ttlSeconds: number): Promise<number | null> => {
  if (!redisClient.isOpen) return null;
  const count = await redisClient.incr(key);
  if (count === 1) {
    await redisClient.expire(key, ttlSeconds);
  }
  return count;
};

const resolveIdempotencyKey = (payload: EnqueuePayload, limits: EventLimitProfile): string | null => {
  const explicit = payload.metadata?.idempotencyKey;
  if (typeof explicit === "string" && explicit.trim()) {
    return explicit.trim();
  }

  if (limits.forceIdempotentBySession && payload.sessionId) {
    return `${payload.eventType}:${payload.sessionId}`;
  }

  return null;
};

const enforceEventRateLimits = async (payload: EnqueuePayload, recipients: string[], limits: EventLimitProfile): Promise<boolean> => {
  if (!redisClient.isOpen) return true;

  const dayKey = toUtcDayKey();
  const hourKey = toUtcHourKey();

  const globalCount = await incrementRateKey(`email:rate:global:${dayKey}`, 24 * 60 * 60);
  if (globalCount !== null && globalCount > Math.max(1, limits.globalDaily)) {
    logger.warn("Email enqueue blocked by global daily cap", {
      eventType: payload.eventType,
      globalCount,
      limit: limits.globalDaily,
    });
    return false;
  }

  if (payload.organizationId) {
    const orgCount = await incrementRateKey(`email:rate:org:${payload.organizationId}:${dayKey}`, 24 * 60 * 60);
    if (orgCount !== null && orgCount > Math.max(1, limits.orgDaily)) {
      logger.warn("Email enqueue blocked by organization daily cap", {
        eventType: payload.eventType,
        organizationId: payload.organizationId,
        orgCount,
        limit: limits.orgDaily,
      });
      return false;
    }
  }

  if (payload.triggeredBy) {
    const actorCount = await incrementRateKey(`email:rate:actor:${payload.triggeredBy}:${hourKey}`, 60 * 60);
    if (actorCount !== null && actorCount > Math.max(1, limits.actorHourly)) {
      logger.warn("Email enqueue blocked by actor hourly cap", {
        eventType: payload.eventType,
        triggeredBy: payload.triggeredBy,
        actorCount,
        limit: limits.actorHourly,
      });
      return false;
    }
  }

  for (const recipient of recipients) {
    const recipientCount = await incrementRateKey(`email:rate:recipient:${recipient}:${dayKey}`, 24 * 60 * 60);
    if (recipientCount !== null && recipientCount > Math.max(1, limits.recipientDaily)) {
      logger.warn("Email enqueue blocked by recipient daily cap", {
        eventType: payload.eventType,
        recipient,
        recipientCount,
        limit: limits.recipientDaily,
      });
      return false;
    }
  }

  return true;
};

export const enqueueEmailNotification = async (payload: EnqueuePayload): Promise<string | null> => {
  const recipients = Array.from(
    new Set((payload.to || []).map((email) => String(email || "").trim().toLowerCase()).filter(Boolean))
  );

  if (recipients.length === 0) return null;

  const limits = resolveEventLimits(payload.eventType);
  const dedupeKey = resolveIdempotencyKey(payload, limits);

  if (dedupeKey) {
    const existing = await EmailNotification.findOne({ dedupeKey })
      .select("notificationId status")
      .lean();
    if (existing) {
      return existing.notificationId as string;
    }
  }

  const isAllowed = await enforceEventRateLimits(payload, recipients, limits);
  if (!isAllowed) {
    return null;
  }

  try {
    const doc = await EmailNotification.create({
      eventType: payload.eventType,
      fromCategory: payload.fromCategory || "notification",
      organizationId: payload.organizationId || null,
      sessionId: payload.sessionId || null,
      dedupeKey,
      triggeredBy: payload.triggeredBy || null,
      recipients,
      subject: payload.subject,
      html: payload.html,
      text: payload.text || null,
      attachments: payload.attachments || [],
      status: "queued",
      attempts: 0,
      maxAttempts: Math.max(1, Math.min(10, Number(payload.maxAttempts || 5))),
      nextAttemptAt: new Date(),
      metadata: payload.metadata || {},
    });

    return doc.notificationId as string;
  } catch (error: any) {
    // Duplicate dedupeKey race: return the already-created notification.
    if (error?.code === 11000 && dedupeKey) {
      const existing = await EmailNotification.findOne({ dedupeKey })
        .select("notificationId")
        .lean();
      if (existing?.notificationId) {
        return existing.notificationId as string;
      }
      return null;
    }
    throw error;
  }
};

export const enqueueEmailNotificationWithTracking = async (payload: EnqueuePayload): Promise<string | null> => {
  return enqueueEmailNotification(payload);
};

const computeBackoffSeconds = (attempts: number): number => {
  const exponential = RETRY_BASE_SECONDS * Math.pow(2, Math.max(0, attempts - 1));
  return Math.min(exponential, 30 * 60);
};

const isPermanentDeliveryError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.toLowerCase();

  return [
    "invalid recipient",
    "invalid email",
    "suppressed",
    "recipient blocked",
    "recipient rejected",
    "does not exist",
  ].some((pattern) => normalized.includes(pattern));
};

const processSingle = async (): Promise<boolean> => {
  const now = new Date();
  const candidate = await EmailNotification.findOneAndUpdate(
    {
      status: { $in: ["queued", "failed"] },
      nextAttemptAt: { $lte: now },
      $expr: { $lt: ["$attempts", "$maxAttempts"] },
    },
    {
      $set: { status: "processing" },
    },
    {
      sort: { nextAttemptAt: 1, createdAt: 1 },
      returnDocument: "after",
    }
  ).lean();

  if (!candidate) return false;

  try {
    const payload: {
      to: string[];
      subject: string;
      html: string;
      fromCategory?: "default" | "otp" | "report" | "notification";
      text?: string | null;
      attachments?: Array<{
        filename: string;
        content: string;
        contentType?: string;
        contentEncoding?: "base64";
      }>;
    } = {
      to: candidate.recipients || [],
      subject: candidate.subject,
      html: candidate.html,
      fromCategory: (candidate as any).fromCategory || "notification",
    };

    if (typeof candidate.text === "string") {
      payload.text = candidate.text;
    }

    if (Array.isArray(candidate.attachments) && candidate.attachments.length > 0) {
      payload.attachments = candidate.attachments.map((attachment: any) => ({
        filename: String(attachment.filename || "attachment"),
        content: String(attachment.content || ""),
        ...(attachment.contentType ? { contentType: String(attachment.contentType) } : {}),
        ...(attachment.contentEncoding ? { contentEncoding: "base64" as const } : {}),
      }));
    }

    await sendMailNow(payload);

    await EmailNotification.updateOne(
      { notificationId: candidate.notificationId },
      {
        $set: {
          status: "sent",
          sentAt: new Date(),
          lastError: null,
        },
        $inc: { attempts: 1 },
      }
    );
  } catch (error) {
    const nextAttempts = Number(candidate.attempts || 0) + 1;
    const permanentFailure = isPermanentDeliveryError(error);
    const hasMoreRetries = !permanentFailure && nextAttempts < Number(candidate.maxAttempts || 5);
    const backoffSeconds = computeBackoffSeconds(nextAttempts);

    await EmailNotification.updateOne(
      { notificationId: candidate.notificationId },
      {
        $set: {
          status: hasMoreRetries ? "failed" : "dead",
          nextAttemptAt: hasMoreRetries
            ? new Date(Date.now() + backoffSeconds * 1000)
            : new Date(),
          lastError: error instanceof Error ? error.message : "Unknown error",
        },
        $inc: { attempts: 1 },
      }
    );

    logger.warn("Email delivery failed", {
      notificationId: candidate.notificationId,
      attempts: nextAttempts,
      maxAttempts: candidate.maxAttempts,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  return true;
};

export const processPendingEmailNotifications = async (batchSize = 20): Promise<void> => {
  if (isProcessing) return;
  isProcessing = true;

  try {
    for (let i = 0; i < batchSize; i += 1) {
      const processed = await processSingle();
      if (!processed) break;
    }
  } finally {
    isProcessing = false;
  }
};

export const startEmailNotificationWorker = () => {
  if (workerTimer) return;

  workerTimer = setInterval(() => {
    processPendingEmailNotifications().catch((error) => {
      logger.error("Email notification worker tick failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    });
  }, WORKER_INTERVAL_MS);

  processPendingEmailNotifications().catch((error) => {
    logger.error("Initial email notification processing failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  });
};

export const stopEmailNotificationWorker = () => {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
};
