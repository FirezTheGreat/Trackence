import { Schema, model } from "mongoose";

const SuppressedEmailSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    reason: {
      type: String,
      default: "delivery_failure",
      trim: true,
    },
    source: {
      type: String,
      default: "system",
      trim: true,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastEventAt: {
      type: Date,
      default: Date.now,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

SuppressedEmailSchema.index({ email: 1, active: 1 });

export default model("SuppressedEmail", SuppressedEmailSchema);
