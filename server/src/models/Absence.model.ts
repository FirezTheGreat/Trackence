import mongoose, { Document, Schema } from "mongoose";

interface IAbsence extends Document {
  sessionId: string;
  facultyId: string;
  facultyName: string;
  facultyEmail: string;
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
    facultyId: {
      type: String,
      required: true,
      index: true,
    },
    facultyName: {
      type: String,
      required: true,
    },
    facultyEmail: {
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
absenceSchema.index({ sessionId: 1, facultyId: 1 }, { unique: true });
absenceSchema.index({ isExcused: 1, createdAt: -1 });
absenceSchema.index({ createdAt: -1 });

const Absence = mongoose.model<IAbsence>("Absence", absenceSchema);

export default Absence;
export type { IAbsence };
