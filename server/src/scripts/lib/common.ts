/**
 * Shared runtime for maintenance scripts (seed-demo, unseed-demo, sync-indexes): CLI args, env loading,
 * the production guard and dashboard cache invalidation.
 *
 * This module must be imported before anything that reads process.env.
 */
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

const argv = process.argv.slice(2);

export const hasFlag = (name: string): boolean => argv.includes(`--${name}`);

export const getArg = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    const match = argv.find((value) => value.startsWith(prefix));
    return match ? match.slice(prefix.length) : undefined;
};

// --env=production loads .env.production; otherwise follow NODE_ENV like the other scripts.
const envName = getArg("env") || (process.env.NODE_ENV === "production" ? "production" : "development");
process.env.NODE_ENV = envName;
dotenv.config({ path: path.resolve(process.cwd(), `.env.${envName}`), quiet: true });

// Belt and braces: nothing in these scripts imports the mail/socket/scheduler modules,
// but force the mock provider in case anything ever does.
process.env.EMAIL_PROVIDER = "mock";
// Keep the app logger (pulled in by models/controllers) quiet; the scripts print their own progress.
process.env.LOG_LEVEL = process.env.LOG_LEVEL || "error";

export const PROD_FLAG = "i-know-this-is-prod";

const describeMongoUri = (uri: string): { host: string; dbName: string } => {
    const parsed = new URL(uri.replace(/^mongodb(\+srv)?:\/\//, "http://"));
    return {
        host: parsed.hostname,
        dbName: decodeURIComponent(parsed.pathname.replace(/^\//, "")) || "test",
    };
};

const readProductionMongoUri = (): string | null => {
    const prodEnvPath = path.resolve(process.cwd(), ".env.production");
    if (!fs.existsSync(prodEnvPath)) return null;
    return dotenv.parse(fs.readFileSync(prodEnvPath)).MONGODB_URI || null;
};

/**
 * Connect to MongoDB after printing the target and enforcing the production guard.
 */
export const connectWithGuard = async (scriptName: string): Promise<{ host: string; dbName: string; isProd: boolean }> => {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error("MONGODB_URI is not set (looked in the environment and .env." + envName + ").");
    }

    const target = describeMongoUri(uri);
    const prodUri = readProductionMongoUri();
    const prodReasons = [
        envName === "production" ? "NODE_ENV/--env is production" : null,
        /prod/i.test(target.host) ? `host "${target.host}" contains "prod"` : null,
        /prod/i.test(target.dbName) ? `database "${target.dbName}" contains "prod"` : null,
        prodUri && describeMongoUri(prodUri).host === target.host ? "host matches .env.production" : null,
    ].filter((reason): reason is string => Boolean(reason));
    const isProd = prodReasons.length > 0;

    console.log(`\n[${scriptName}] Target MongoDB`);
    console.log(`   host: ${target.host}`);
    console.log(`   db:   ${target.dbName}`);

    if (isProd) {
        console.log(`   ⚠️  Looks like PRODUCTION: ${prodReasons.join("; ")}`);
        if (!hasFlag(PROD_FLAG)) {
            console.error(`\nRefusing to run against production without --${PROD_FLAG}.`);
            process.exit(2);
        }
        if (!hasFlag("dry-run")) {
            console.log("   Proceeding in 5 seconds (Ctrl+C to abort)...");
            await new Promise((resolve) => setTimeout(resolve, 5000));
        }
    }

    await mongoose.connect(uri, { autoIndex: false, family: 4, connectTimeoutMS: 10000 });
    return { ...target, isProd };
};

/**
 * Drop the 5-minute dashboard caches so the UI shows the new data immediately.
 * Failure is non-fatal: the caches expire on their own.
 */
export const invalidateDashboardCaches = async (organizationIds: string[]): Promise<void> => {
    if (!process.env.REDIS_URL) {
        console.log("   (REDIS_URL not set; dashboard caches will expire within 5 minutes)");
        return;
    }

    try {
        const { default: redisClient } = await import("../../config/redis");
        await redisClient.connect();
        const keys = [
            ...organizationIds.flatMap((orgId) => [`dashboard:metrics:${orgId}`, `dashboard:enhanced:${orgId}`]),
            "dashboard:platform:overview:v1:5",
        ];
        const removed = await redisClient.del(keys);
        console.log(`   Cleared ${removed} cached dashboard entr${removed === 1 ? "y" : "ies"}.`);
        redisClient.removeAllListeners("end"); // a deliberate quit is not a HEALTH_ALERT
        await redisClient.quit();
    } catch (error) {
        console.warn(`   Could not clear dashboard caches (${error instanceof Error ? error.message : error}); they expire within 5 minutes.`);
    }
};

export const chunk = <T>(items: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
};
