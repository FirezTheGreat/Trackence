import { Schema, model } from "mongoose";

const AttendanceSchema = new Schema(
  {
    attendanceId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    sessionId: {
      type: String,
      required: true,
      index: true,
      // references Session.sessionId
    },

    userId: {
      type: String,
      required: true,
      index: true,
      // references User.userId
    },

    markedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Composite unique index to prevent duplicate attendance
AttendanceSchema.index({ sessionId: 1, userId: 1 }, { unique: true });
AttendanceSchema.index({ createdAt: -1 });

export default model("Attendance", AttendanceSchema);
