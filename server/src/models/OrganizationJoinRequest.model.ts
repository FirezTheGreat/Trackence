import { Schema, model } from "mongoose";

export type OrganizationJoinRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

const OrganizationJoinRequestSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    organizationId: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
      index: true,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    processedBy: {
      type: String,
      default: null,
    },
    requestSource: {
      type: String,
      enum: ["direct", "invite"],
      default: "direct",
      index: true,
    },
    inviteToken: {
      type: String,
      default: null,
      trim: true,
    },
    decisionNote: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1000,
    },
  },
  { timestamps: true }
);

OrganizationJoinRequestSchema.index({ userId: 1, organizationId: 1 }, { unique: true });
OrganizationJoinRequestSchema.index({ organizationId: 1, status: 1, requestedAt: -1 });

export default model("OrganizationJoinRequest", OrganizationJoinRequestSchema);
