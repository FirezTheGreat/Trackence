/**
 * Remove the demo dataset created by seed-demo, and nothing else.
 *
 *   npm run unseed:demo [-- --env=production --i-know-this-is-prod] [--dry-run]
 */
import { connectWithGuard, hasFlag, invalidateDashboardCaches } from "./lib/common";
import mongoose from "mongoose";
import { teardownDemoData } from "./demo-data/teardown";

const main = async () => {
    const dryRun = hasFlag("dry-run");
    await connectWithGuard("unseed-demo");
    console.log(`   mode: ${dryRun ? "DRY RUN (counting only)" : "delete"}`);

    const result = await teardownDemoData({ dryRun });
    console.log(`\n[unseed-demo] ${dryRun ? "Would remove" : "Removed"}:`);
    for (const [collection, count] of Object.entries(result.deleted)) {
        console.log(`   ${collection.padEnd(26)} ${count}`);
    }
    console.log(`   real users ${dryRun ? "to unlink" : "unlinked"}: ${result.unlinkedUsers}`);

    if (!dryRun && result.organizationIds.length) {
        await invalidateDashboardCaches(result.organizationIds);
    }
    console.log(`\n[unseed-demo] Done.`);
};

main()
    .catch((error) => {
        console.error(`\n[unseed-demo] ❌ ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
