import EmailNotification from "../models/EmailNotification.model";
import { sendMailNow } from "./mail-delivery.service";
import { logger } from "../utils/logger";

type EnqueuePayload = {
  eventType: string;
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

let workerTimer: NodeJS.Timeout | null = null;
let isProcessing = false;

const RETRY_BASE_SECONDS = 20;
const WORKER_INTERVAL_MS = 5000;

export const enqueueEmailNotification = async (payload: EnqueuePayload): Promise<string | null> => {
  const recipients = Array.from(
    new Set((payload.to || []).map((email) => String(email || "").trim().toLowerCase()).filter(Boolean))
  );

  if (recipients.length === 0) return null;

  const doc = await EmailNotification.create({
    eventType: payload.eventType,
    organizationId: payload.organizationId || null,
    sessionId: payload.sessionId || null,
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
};

export const enqueueEmailNotificationWithTracking = async (payload: EnqueuePayload): Promise<string | null> => {
  return enqueueEmailNotification(payload);
};

const computeBackoffSeconds = (attempts: number): number => {
  const exponential = RETRY_BASE_SECONDS * Math.pow(2, Math.max(0, attempts - 1));
  return Math.min(exponential, 30 * 60);
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
    const hasMoreRetries = nextAttempts < Number(candidate.maxAttempts || 5);
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
