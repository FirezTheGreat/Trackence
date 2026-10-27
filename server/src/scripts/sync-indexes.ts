/**
 * Create any missing MongoDB indexes declared in the Mongoose schemas.
 * The API also does this at startup; run this to apply them without a deploy, or to inspect.
 *
 *   npm run db:indexes [-- --dry-run] [--env=production --i-know-this-is-prod]
 *
 * Never drops indexes. Indexes present in the database but not in a schema are only reported.
 */
import { connectWithGuard, hasFlag } from "./lib/common";
import mongoose from "mongoose";
import "../models/Absence.model";
import "../models/Attendance.model";
import "../models/AuditLog.model";
import "../models/EmailNotification.model";
import "../models/Organization.model";
import "../models/OrganizationInvite.model";
import "../models/OrganizationJoinRequest.model";
import "../models/Session.model";
import "../models/SuppressedEmail.model";
import "../models/User.model";
import { ensureIndexes } from "../config/mongoose";

const describe = (index: { key: Record<string, unknown>; unique?: boolean; partialFilterExpression?: unknown }) =>
    `${Object.entries(index.key).map(([field, dir]) => `${field}:${dir}`).join(",")}${index.unique ? " (unique)" : ""}${index.partialFilterExpression ? " (partial)" : ""}`;

const main = async () => {
    const dryRun = hasFlag("dry-run");
    await connectWithGuard("sync-indexes");
    console.log(`   mode: ${dryRun ? "DRY RUN (report only)" : "create missing"}\n`);

    let missing = 0;
    for (const name of mongoose.modelNames()) {
        const { toCreate, toDrop } = await mongoose.model(name).diffIndexes();
        missing += toCreate.length;
        const extra = toDrop.length ? `  | not in schema (left alone): ${toDrop.join(", ")}` : "";
        console.log(`   ${name.padEnd(24)} missing ${toCreate.length}${extra}`);
    }

    if (dryRun || missing === 0) {
        console.log(`\n[sync-indexes] ${missing === 0 ? "All schema indexes already exist." : "Dry run: nothing created."}`);
        return;
    }

    const failures = (await ensureIndexes()).filter((result) => result.error);
    for (const failure of failures) console.error(`   ❌ ${failure.model}: ${failure.error}`);

    console.log("\n[sync-indexes] Indexes now present:");
    for (const name of mongoose.modelNames()) {
        const indexes = await mongoose.model(name).collection.indexes();
        console.log(`   ${name}: ${indexes.filter((index) => index.name !== "_id_").map((index) => describe(index as any)).join("; ")}`);
    }

    if (failures.length) {
        process.exitCode = 1;
        console.error(`\n[sync-indexes] ${failures.length} model(s) failed; see errors above.`);
    } else {
        console.log("\n[sync-indexes] ✅ Done.");
    }
};

main()
    .catch((error) => {
        console.error(`\n[sync-indexes] ❌ ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
