import { Schema, model } from "mongoose";
import { nanoid } from "nanoid";

export type EmailNotificationStatus = "queued" | "processing" | "sent" | "failed" | "dead";

const EmailNotificationSchema = new Schema(
  {
    notificationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => `NTF-${nanoid(12).toUpperCase()}`,
    },
    eventType: {
      type: String,
      required: true,
      index: true,
    },
    fromCategory: {
      type: String,
      enum: ["default", "otp", "report", "notification"],
      default: "notification",
    },
    organizationId: {
      type: String,
      index: true,
      default: null,
    },
    sessionId: {
      type: String,
      index: true,
      default: null,
    },
    dedupeKey: {
      type: String,
      default: null,
      index: true,
      sparse: true,
      unique: true,
    },
    triggeredBy: {
      type: String,
      default: null,
    },
    recipients: {
      type: [String],
      default: [],
    },
    subject: {
      type: String,
      required: true,
    },
    html: {
      type: String,
      required: true,
    },
    text: {
      type: String,
      default: null,
    },
    attachments: {
      type: [
        {
          filename: { type: String, required: true },
          content: { type: String, required: true },
          contentType: { type: String, default: null },
          contentEncoding: { type: String, default: null },
        },
      ],
      default: [],
    },
    status: {
      type: String,
      enum: ["queued", "processing", "sent", "failed", "dead"],
      default: "queued",
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 5,
    },
    nextAttemptAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    lastError: {
      type: String,
      default: null,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

EmailNotificationSchema.index({ status: 1, nextAttemptAt: 1, createdAt: -1 });
EmailNotificationSchema.index({ organizationId: 1, createdAt: -1 });
EmailNotificationSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });

export default model("EmailNotification", EmailNotificationSchema);
