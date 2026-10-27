/**
 * Removes exactly the demo dataset:
 *  - every document tagged isDemo: true
 *  - anything scoped to a demo organization or demo session (this also catches data
 *    created by hand during a live walkthrough, e.g. a session started from the UI)
 *  - email history / suppressions addressed only to demo users
 * Real users are never deleted; demo org references are pulled from them and their
 * selected organization is restored.
 */
import type { Model } from "mongoose";
import Absence from "../../models/Absence.model";
import Attendance from "../../models/Attendance.model";
import AuditLog from "../../models/AuditLog.model";
import EmailNotification from "../../models/EmailNotification.model";
import Organization from "../../models/Organization.model";
import OrganizationInvite from "../../models/OrganizationInvite.model";
import OrganizationJoinRequest from "../../models/OrganizationJoinRequest.model";
import Session from "../../models/Session.model";
import SuppressedEmail from "../../models/SuppressedEmail.model";
import User from "../../models/User.model";

export type LinkedUserRestore = {
    userId: string;
    previousCurrentOrganizationId: string | null;
};

export type TeardownResult = {
    organizationIds: string[];
    deleted: Record<string, number>;
    unlinkedUsers: number;
};

// Filters on isDemo go through the native driver so Mongoose strictQuery can never strip them.
const DEMO = { isDemo: true };

export const teardownDemoData = async (options: { dryRun: boolean }): Promise<TeardownResult> => {
    const demoOrgs = await Organization.collection
        .find(DEMO, { projection: { organizationId: 1, demoMeta: 1 } })
        .toArray();
    const organizationIds = demoOrgs.map((org) => String(org.organizationId));
    const restores: LinkedUserRestore[] = demoOrgs.flatMap((org) => (org.demoMeta?.linkedUsers || []) as LinkedUserRestore[]);

    const sessionIds = (
        await Session.collection
            .find({ $or: [DEMO, { organizationId: { $in: organizationIds } }] }, { projection: { sessionId: 1 } })
            .toArray()
    ).map((session) => String(session.sessionId));

    const demoEmails = (
        await User.collection.find(DEMO, { projection: { email: 1 } }).toArray()
    ).map((user) => String(user.email));

    const byOrg = { $or: [DEMO, { organizationId: { $in: organizationIds } }] };
    const bySession = { $or: [DEMO, { sessionId: { $in: sessionIds } }] };

    const plan: Array<[string, Model<any>, Record<string, unknown>]> = [
        ["attendances", Attendance, bySession],
        ["absences", Absence, bySession],
        ["sessions", Session, { $or: [DEMO, { sessionId: { $in: sessionIds } }] }],
        ["auditlogs", AuditLog, { $or: [DEMO, { organizationId: { $in: organizationIds } }, { targetId: { $in: sessionIds } }] }],
        [
            "emailnotifications",
            EmailNotification,
            {
                $or: [
                    DEMO,
                    { organizationId: { $in: organizationIds } },
                    { sessionId: { $in: sessionIds } },
                    // Only when every recipient is a demo user, so real recipients' history is untouched.
                    { recipients: { $not: { $elemMatch: { $nin: demoEmails } } }, "recipients.0": { $exists: true } },
                ],
            },
        ],
        ["suppressedemails", SuppressedEmail, { email: { $in: demoEmails } }],
        ["organizationjoinrequests", OrganizationJoinRequest, byOrg],
        ["organizationinvites", OrganizationInvite, byOrg],
        ["users", User, DEMO],
        ["organizations", Organization, DEMO],
    ];

    const deleted: Record<string, number> = {};
    for (const [name, model, filter] of plan) {
        deleted[name] = options.dryRun
            ? await model.collection.countDocuments(filter)
            : (await model.collection.deleteMany(filter)).deletedCount;
    }

    // Real (non-demo) users that reference demo orgs: the owner, the linked student
    // account, or anyone who joined/requested a demo org during the walkthrough.
    const linkedUsers = await User.find({
        isDemo: { $ne: true },
        $or: [
            { organizationIds: { $in: organizationIds } },
            { requestedOrganizationIds: { $in: organizationIds } },
            { blockedPublicJoinOrgIds: { $in: organizationIds } },
            { "userOrgRoles.organizationId": { $in: organizationIds } },
            { currentOrganizationId: { $in: organizationIds } },
        ],
    }).setOptions({ strictQuery: false });

    const demoOrgSet = new Set(organizationIds);
    for (const user of linkedUsers) {
        const remainingOrgIds = (user.organizationIds || []).filter((id) => !demoOrgSet.has(id));
        const saved = restores.find((entry) => entry.userId === user.userId)?.previousCurrentOrganizationId;
        let nextCurrent: string | null = user.currentOrganizationId || null;
        if (!nextCurrent || demoOrgSet.has(nextCurrent)) {
            nextCurrent = saved && remainingOrgIds.includes(saved) ? saved : remainingOrgIds[0] || null;
        }

        if (options.dryRun) continue;
        await User.updateOne(
            { userId: user.userId },
            {
                $pull: {
                    organizationIds: { $in: organizationIds },
                    requestedOrganizationIds: { $in: organizationIds },
                    blockedPublicJoinOrgIds: { $in: organizationIds },
                    userOrgRoles: { organizationId: { $in: organizationIds } },
                },
                $set: { currentOrganizationId: nextCurrent },
            },
            { timestamps: false }
        );
    }

    return { organizationIds, deleted, unlinkedUsers: linkedUsers.length };
};
