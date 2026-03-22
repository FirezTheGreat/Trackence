import { Schema, model } from "mongoose";

const SessionSchema = new Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    organizationId: {
      type: String,
      required: true,
      index: true,
      // references organization from User
    },

    createdBy: {
      type: String,
      required: true,
      index: true,
      // references User.userId
    },

    startTime: {
      type: Date,
      required: true,
      default: Date.now,
    },

    endTime: {
      type: Date,
      required: true,
    },

    duration: {
      type: Number,
      required: true,
      // in minutes
    },

    refreshInterval: {
      type: Number,
      required: true,
      default: 10,
      // in seconds
    },

    memberCountAtStart: {
      type: Number,
      default: null,
      // Snapshot of org member count when session started
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    notification: {
      recipients: {
        type: [String],
        default: [],
      },
      includeCreator: {
        type: Boolean,
        default: true,
      },
      sendSessionEndEmail: {
        type: Boolean,
        default: true,
      },
      sendAbsenceEmail: {
        type: Boolean,
        default: true,
      },
      attachReport: {
        type: Boolean,
        default: true,
      },
      inheritedDefaultRecipients: {
        type: [String],
        default: [],
      },
    },
  },
  { timestamps: true }
);

SessionSchema.index({ createdAt: -1 });

export default model("Session", SessionSchema);
