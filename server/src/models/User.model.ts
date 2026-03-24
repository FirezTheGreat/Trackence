import { Schema, model } from "mongoose";

export type UserRole = "member" | "admin";
export type PlatformRole = "user" | "platform_owner";

/**
 * USER ROLE MODEL (Organization-Aware)
 * 
 * Users have DIFFERENT ROLES in DIFFERENT ORGANIZATIONS
 * 
 * Each org membership is explicit with role stored together
 */

// Schema for org-specific role
const UserOrgRoleSchema = new Schema(
  {
    organizationId: {
      type: String,
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["member", "admin"],
      default: "member",
      // "admin" = can manage org, members, sessions
      // "member" = can mark attendance, view data
    },
  },
  { _id: false }
);

const UserSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    organizationIds: {
      type: [String],
      default: [],
      index: true,
      // Array of org IDs the user is a MEMBER of
    },

    currentOrganizationId: {
      type: String,
      default: null,
      index: true,
      // The currently selected/active organization ID (for UI state)
    },

    requestedOrganizationIds: {
      type: [String],
      default: [],
      index: true,
      // Array of org IDs the user has PENDING JOIN REQUESTS for
    },

    blockedPublicJoinOrgIds: {
      type: [String],
      default: [],
      index: true,
      // Orgs where this user was explicitly removed by an admin.
      // While blocked, user can only rejoin via a personal invite.
    },

    userOrgRoles: {
      type: [UserOrgRoleSchema],
      default: [],
      // CRITICAL: Array of user's role in each org
      // [{ organizationId: "org-1", role: "admin" }, { organizationId: "org-2", role: "member" }]
      // Use utils/org-role.utils.ts::getUserOrgRole(user, orgId) to get role
    },

    platformRole: {
      type: String,
      enum: ["user", "platform_owner"],
      default: "user",
      index: true,
      // Global role for cross-organization authority
      // platform_owner: internal system/security role
    },

    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },

    notificationDefaults: {
      recipients: {
        type: [String],
        default: [],
      },
      includeSelf: {
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
    },
  },
  { timestamps: true }
);

export default model("User", UserSchema);
