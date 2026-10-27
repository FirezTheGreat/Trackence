/**
 * Seed a realistic, clearly-labelled DEMO dataset linked to an existing account.
 *
 *   npm run seed:demo -- --owner=you@example.org [--student=other@example.org --student-name="Name"]
 *                        [--anchor=YYYY-MM-DD] [--env=production --i-know-this-is-prod] [--dry-run]
 *
 * Idempotent: previous demo data is torn down first, and the dataset is generated from a fixed
 * seed relative to the anchor date (default: today, IST). Every document is tagged isDemo: true;
 * `npm run unseed:demo` removes exactly that data. See README "Demo data".
 */
import { chunk, connectWithGuard, getArg, hasFlag, invalidateDashboardCaches } from "./lib/common";
import mongoose, { type Model } from "mongoose";
import Absence from "../models/Absence.model";
import Attendance from "../models/Attendance.model";
import AuditLog from "../models/AuditLog.model";
import EmailNotification from "../models/EmailNotification.model";
import Organization from "../models/Organization.model";
import OrganizationInvite from "../models/OrganizationInvite.model";
import OrganizationJoinRequest from "../models/OrganizationJoinRequest.model";
import Session from "../models/Session.model";
import User from "../models/User.model";
import { DEMO_SEED, generateDemoDataset, istDay, type DemoDataset } from "./demo-data/dataset";
import { teardownDemoData, type LinkedUserRestore } from "./demo-data/teardown";
import { verifyDashboards } from "./demo-data/verify";

type Plain = Record<string, any>;

const COLLECTIONS: Array<[keyof DemoDataset, Model<any>]> = [
    ["organizations", Organization],
    ["users", User],
    ["organizationjoinrequests", OrganizationJoinRequest],
    ["organizationinvites", OrganizationInvite],
    ["sessions", Session],
    ["attendances", Attendance],
    ["absences", Absence],
    ["emailnotifications", EmailNotification],
    ["auditlogs", AuditLog],
];

// Unique business keys that must not collide with real (non-demo) documents.
const UNIQUE_KEYS: Array<[Model<any>, keyof DemoDataset, string]> = [
    [User, "users", "userId"],
    [User, "users", "email"],
    [Organization, "organizations", "organizationId"],
    [Organization, "organizations", "code"],
    [Session, "sessions", "sessionId"],
    [Attendance, "attendances", "attendanceId"],
    [AuditLog, "auditlogs", "auditId"],
    [EmailNotification, "emailnotifications", "notificationId"],
    [EmailNotification, "emailnotifications", "dedupeKey"],
    [OrganizationInvite, "organizationinvites", "token"],
];

/** Cast + defaults + validation through the real schema, then tag as demo. */
const toValidatedDocument = (model: Model<any>, plain: Plain): Plain => {
    const doc = new model({ ...plain, __v: 0 });
    doc.set("isDemo", true, { strict: false });
    const error = doc.validateSync();
    if (error) {
        throw new Error(`${model.modelName} failed validation: ${error.message}`);
    }
    return doc.toObject({ depopulate: true });
};

const parseAnchor = (value: string | undefined, now: Date): Date => {
    const today = istDay(now);
    if (!value) return today;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) throw new Error(`--anchor must be YYYY-MM-DD, got "${value}"`);
    const anchor = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (anchor > today) throw new Error("--anchor cannot be in the future");
    return anchor;
};

const main = async () => {
    const ownerEmail = (getArg("owner") || process.env.DEMO_OWNER_EMAIL || "").trim().toLowerCase();
    const studentEmail = (getArg("student") || process.env.DEMO_STUDENT_EMAIL || "").trim().toLowerCase() || null;
    const studentName = (getArg("student-name") || process.env.DEMO_STUDENT_NAME || "Demo Student").trim();
    const dryRun = hasFlag("dry-run");
    const now = new Date();
    const anchorDay = parseAnchor(getArg("anchor"), now);

    if (!ownerEmail) {
        throw new Error("Pass the owner account with --owner=<email> or DEMO_OWNER_EMAIL.");
    }

    await connectWithGuard("seed-demo");
    console.log(`   mode: ${dryRun ? "DRY RUN (no writes)" : "write"}   anchor: ${anchorDay.toISOString().slice(0, 10)} (IST)   seed: ${DEMO_SEED}`);

    const owner = await User.findOne({ email: ownerEmail }).setOptions({ strictQuery: false }).lean<Plain>();
    if (!owner) throw new Error(`No user with email ${ownerEmail}. Sign up / log in once first.`);
    if (owner.isDemo) throw new Error(`${ownerEmail} is a demo user; pass your real account.`);
    console.log(`\n[seed-demo] Owner: ${owner.name} <${owner.email}> (${owner.userId}, ${owner.platformRole})`);

    console.log(dryRun ? "\n[seed-demo] Existing demo data that would be removed first:" : "\n[seed-demo] Removing previous demo data...");
    const previous = await teardownDemoData({ dryRun });
    console.log(`   ${Object.entries(previous.deleted).map(([name, count]) => `${name}=${count}`).join("  ")}`);

    let student: { userId: string | null; name: string; email: string } | null = null;
    if (studentEmail) {
        if (studentEmail === ownerEmail) throw new Error("--student must differ from --owner.");
        const existing = await User.findOne({ email: studentEmail }).setOptions({ strictQuery: false }).lean<Plain>();
        const isReal = existing && !existing.isDemo;
        student = { userId: isReal ? existing.userId : null, name: isReal ? existing.name : studentName, email: studentEmail };
        console.log(`[seed-demo] Student account: ${student.email} (${isReal ? `existing ${existing.userId}, will be linked` : "not found, will be created as a demo user"})`);
    }

    const data = generateDemoDataset({
        owner: { userId: owner.userId, name: owner.name, email: owner.email },
        student,
        anchorDay,
        now,
    });

    for (const [model, collection, key] of UNIQUE_KEYS) {
        const values = data[collection] as Plain[];
        const keys = values.map((doc) => doc[key]).filter((value) => value != null);
        for (const batch of chunk(keys, 2000)) {
            const clash = await model.collection.findOne({ [key]: { $in: batch }, isDemo: { $ne: true } }, { projection: { [key]: 1 } });
            if (clash) throw new Error(`Refusing to seed: ${model.modelName}.${key} "${clash[key]}" already exists in non-demo data.`);
        }
    }

    // Remember what to restore on teardown, stored on the primary demo org.
    const restores: LinkedUserRestore[] = [];
    for (const link of data.realUserLinks) {
        const user = await User.findOne({ userId: link.userId }).select("currentOrganizationId").lean<Plain>();
        restores.push({ userId: link.userId, previousCurrentOrganizationId: user?.currentOrganizationId || null });
    }

    const prepared = new Map<keyof DemoDataset, Plain[]>();
    for (const [collection, model] of COLLECTIONS) {
        prepared.set(
            collection,
            (data[collection] as Plain[]).map((plain) => toValidatedDocument(model, plain))
        );
    }
    const primary = prepared.get("organizations")!.find((org) => org.organizationId === data.primaryOrganizationId)!;
    primary.demoMeta = { seed: DEMO_SEED, anchor: anchorDay.toISOString().slice(0, 10), seededAt: now, linkedUsers: restores };

    console.log(`\n[seed-demo] Generated (window ${data.window.from.toISOString().slice(0, 10)} → ${data.window.to.toISOString().slice(0, 16)}Z):`);
    for (const [collection] of COLLECTIONS) console.log(`   ${collection.padEnd(26)} ${prepared.get(collection)!.length}`);

    if (dryRun) {
        console.log("\n[seed-demo] Dry run complete: every document passed schema validation. Nothing was written.");
        return;
    }

    for (const [collection, model] of COLLECTIONS) {
        for (const batch of chunk(prepared.get(collection)!, 1000)) {
            await model.collection.insertMany(batch, { ordered: true });
        }
    }

    // Link real accounts (owner + optional existing student). Only membership/current-org fields change.
    for (const link of data.realUserLinks) {
        const user = await User.findOne({ userId: link.userId }).select("userOrgRoles").lean<Plain>();
        const existingRoleOrgs = new Set((user?.userOrgRoles || []).map((role: Plain) => role.organizationId));
        await User.updateOne(
            { userId: link.userId },
            {
                $addToSet: { organizationIds: { $each: link.memberships.map((m) => m.organizationId) } },
                $push: { userOrgRoles: { $each: link.memberships.filter((m) => !existingRoleOrgs.has(m.organizationId)) } },
                $set: { currentOrganizationId: link.currentOrganizationId },
            },
            { timestamps: false }
        );
    }

    const organizationIds = data.organizations.map((org) => org.organizationId as string);
    await invalidateDashboardCaches(organizationIds);

    console.log("\n[seed-demo] Counts now in the database (demo-tagged):");
    for (const [collection, model] of COLLECTIONS) {
        console.log(`   ${collection.padEnd(26)} ${await model.collection.countDocuments({ isDemo: true })}`);
    }

    const ownerNow = await User.findOne({ userId: owner.userId }).lean<Plain>();
    const problems = await verifyDashboards(
        {
            userId: ownerNow!.userId,
            platformRole: ownerNow!.platformRole === "platform_owner" ? "platform_owner" : "user",
            organizationIds: ownerNow!.organizationIds || [],
            userOrgRoles: ownerNow!.userOrgRoles || [],
            currentOrganizationId: ownerNow!.currentOrganizationId || null,
        },
        data.organizations.map((org) => ({ organizationId: org.organizationId, name: org.name }))
    );

    console.log(problems.length ? `\n[seed-demo] ⚠️  Verification problems:\n   - ${problems.join("\n   - ")}` : "\n[seed-demo] ✅ Verification passed.");
    console.log(`\n[seed-demo] Done. ${ownerEmail} now opens on "${primary.name}". Remove everything with: npm run unseed:demo`);
};

main()
    .catch((error) => {
        console.error(`\n[seed-demo] ❌ ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
