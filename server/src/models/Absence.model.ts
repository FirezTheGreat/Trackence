import mongoose, { Document, Schema } from "mongoose";

interface IAbsence extends Document {
  sessionId: string;
  memberId: string;
  memberName: string;
  memberEmail: string;
  reason?: string;
  isExcused: boolean;
  excusedAt?: Date;
  excusedBy?: string; // admin ID who marked as excused
  markedManually?: boolean; // if attendance was marked manually later
  markedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const absenceSchema = new Schema<IAbsence>(
  {
    sessionId: {
      type: String,
      required: true,
      index: true,
    },
    memberId: {
      type: String,
      required: true,
      index: true,
    },
    memberName: {
      type: String,
      required: true,
    },
    memberEmail: {
      type: String,
      required: true,
    },
    reason: {
      type: String,
      enum: ["Late Submission", "Medical", "Leave", "Other", "Not Provided"],
      default: "Not Provided",
    },
    isExcused: {
      type: Boolean,
      default: false,
      index: true,
    },
    excusedAt: {
      type: Date,
    },
    excusedBy: {
      type: String,
    },
    markedManually: {
      type: Boolean,
      default: false,
    },
    markedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries
absenceSchema.index({ sessionId: 1, memberId: 1 }, { unique: true });
absenceSchema.index({ isExcused: 1, createdAt: -1 });
absenceSchema.index({ createdAt: -1 });

const Absence = mongoose.model<IAbsence>("Absence", absenceSchema);

export default Absence;
export type { IAbsence };
