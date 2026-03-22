import { Schema, model } from "mongoose";

export interface IOrgMember {
    userId: string;
    name: string;
    email: string;
    role: string;
    isOrgAdmin: boolean;
}

const OrgMemberSchema = new Schema(
    {
        userId: { type: String, required: true },
        name: { type: String, required: true },
        email: { type: String, required: true },
        role: { type: String, default: "faculty" },
        isOrgAdmin: { type: Boolean, default: false },
    },
    { _id: false }
);

const OrganizationSchema = new Schema(
    {
        organizationId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },

        name: {
            type: String,
            required: true,
            trim: true,
        },

        code: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true,
            index: true,
            // Short unique join code set by superAdmin (e.g., "MIT-CSE", "MANIPAL")
        },

        description: {
            type: String,
            default: "",
            trim: true,
        },

        createdBy: {
            type: String,
            required: true,
            index: true,
            // references User.userId (superAdmin who created it)
        },

        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },

        owner: {
            type: String,
            required: true,
            index: true,
            // User ID of the organization owner (can transfer ownership)
        },

        members: {
            type: [OrgMemberSchema],
            default: [],
            // Denormalized member list, kept in sync on join/leave/promote/demote
        },

        notificationDefaults: {
            recipients: {
                type: [String],
                default: [],
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

// Compound index for listing active orgs by creator
OrganizationSchema.index({ createdBy: 1, isActive: 1 });

export default model("Organization", OrganizationSchema);
