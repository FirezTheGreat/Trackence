import { Schema, model } from "mongoose";

const OrganizationInviteSchema = new Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    organizationId: {
      type: String,
      required: true,
      index: true,
    },
    createdBy: {
      type: String,
      required: true,
      index: true,
    },
    invitedEmail: {
      type: String,
      default: null,
      lowercase: true,
      trim: true,
      index: true,
    },
    invitedUserId: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    revokedAt: {
      type: Date,
      default: null,
      index: true,
    },
    revokedBy: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    rejectedAt: {
      type: Date,
      default: null,
      index: true,
    },
    rejectedBy: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    useCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

OrganizationInviteSchema.index({ organizationId: 1, createdAt: -1 });
OrganizationInviteSchema.index({ organizationId: 1, invitedUserId: 1, createdAt: -1 });

export default model("OrganizationInvite", OrganizationInviteSchema);
