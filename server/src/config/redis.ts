import { createClient, RedisClientOptions } from "redis";
import { logger } from "../utils/logger";

const parseOptionalEnv = (value?: string): string | undefined => {
    if (!value) return undefined;
    const normalized = value.trim();
    if (!normalized) return undefined;

    const lowered = normalized.toLowerCase();
    if (lowered === "null" || lowered === "undefined" || lowered === "false") {
        return undefined;
    }

    return normalized;
};

const hasPasswordInRedisUrl = (redisUrl?: string): boolean => {
    if (!redisUrl) return false;
    try {
        const parsed = new URL(redisUrl);
        return parsed.password.trim().length > 0;
    } catch {
        return false;
    }
};

const isLikelyUpstashUrl = (redisUrl?: string): boolean => {
    if (!redisUrl) return false;
    try {
        const parsed = new URL(redisUrl);
        return parsed.hostname.includes("upstash.io") || parsed.protocol === "rediss:";
    } catch {
        return false;
    }
};

const reconnectStrategy: NonNullable<RedisClientOptions["socket"]>["reconnectStrategy"] = (retries) => {
    if (retries > 10) {
        console.error("Redis: max reconnection attempts reached");
        return new Error("Max reconnections reached");
    }
    return Math.min(retries * 100, 3000);
};

const redisUrl = parseOptionalEnv(process.env.REDIS_URL);
const redisUsername = parseOptionalEnv(process.env.REDIS_USERNAME);
const redisPassword = parseOptionalEnv(process.env.REDIS_PASSWORD);
const forceRedisAcl = String(process.env.REDIS_FORCE_ACL || "").trim().toLowerCase() === "true";

if (!redisUrl) {
    throw new Error("REDIS_URL is required. Set your Upstash Redis URL in environment variables.");
}

const redisOptions: RedisClientOptions = {
    url: redisUrl,
    socket: {
        reconnectStrategy,
    },
};

if (!hasPasswordInRedisUrl(redisUrl) && redisPassword) {
    redisOptions.password = redisPassword;
    const shouldUseAclUsername = forceRedisAcl || isLikelyUpstashUrl(redisUrl);
    if (redisUsername && shouldUseAclUsername) {
        redisOptions.username = redisUsername;
    } else if (redisUsername && !shouldUseAclUsername) {
        logger.warn("Ignoring REDIS_USERNAME for local/non-Upstash Redis. Set REDIS_FORCE_ACL=true if your local Redis uses ACL auth.");
    }
}

if (isLikelyUpstashUrl(redisUrl) && !hasPasswordInRedisUrl(redisUrl)) {
    if (!redisPassword) {
        logger.warn("REDIS_URL does not include a password. Verify your Upstash connection string.");
    }
}

const redisClient = createClient(redisOptions);

redisClient.on("connect", () => {
    console.log("✅ Redis connected");
    logger.info("Redis connected");
});

redisClient.on("error", (err) => {
    console.error("🔴 Redis error:", err);
    logger.error("Redis error", {
        error: err instanceof Error ? err.message : String(err),
    });
});

redisClient.on("reconnecting", () => {
    console.log("🟡 Redis reconnecting...");
    logger.warn("Redis reconnecting");
});

redisClient.on("end", () => {
    logger.error("HEALTH_ALERT: Redis connection ended");
});

export default redisClient;
