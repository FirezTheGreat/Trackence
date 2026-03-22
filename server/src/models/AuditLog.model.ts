import { Schema, model } from "mongoose";
import { generateAuditId } from "../utils/id.utils";

const AuditLogSchema = new Schema(
  {
    auditId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => generateAuditId(),
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    performedBy: {
      type: String,
      required: true,
      index: true,
    },
    performedByName: {
      type: String,
    },
    performedByEmail: {
      type: String,
    },
    targetId: {
      type: String,
      index: true,
    },
    targetResourceType: {
      type: String,
      enum: ["session", "user", "organization", "absence", "admin_request", "unknown"],
    },
    targetResourceName: {
      type: String,
    },
    organizationId: {
      type: String,
      index: true,
    },
    organizationName: {
      type: String,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
    details: {
      type: {
        affectedUsers: [String],
        affectedUsersCount: Number,
        changesSummary: String,
        sessionCode: String,
        sessionStatus: String,
        reason: String,
        result: String,
      },
      default: {},
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ organizationId: 1, timestamp: -1 });
AuditLogSchema.index({ performedBy: 1, timestamp: -1 });

export default model("AuditLog", AuditLogSchema);
