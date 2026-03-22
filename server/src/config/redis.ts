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

const reconnectStrategy: NonNullable<RedisClientOptions["socket"]>["reconnectStrategy"] = (retries) => {
    if (retries > 10) {
        console.error("Redis: max reconnection attempts reached");
        return new Error("Max reconnections reached");
    }
    return Math.min(retries * 100, 3000);
};

const redisUrl = parseOptionalEnv(process.env.REDIS_URL);
const redisPassword = parseOptionalEnv(process.env.REDIS_PASSWORD);
const redisHost = process.env.REDIS_HOST || "127.0.0.1";
const redisPort = Number(process.env.REDIS_PORT) || 6379;

const redisOptions: RedisClientOptions = redisUrl
    ? {
        url: redisUrl,
        socket: {
            reconnectStrategy,
        },
    }
    : {
        socket: {
            host: redisHost,
            port: redisPort,
            reconnectStrategy,
        },
    };

if (redisPassword) {
    // If password is already embedded in REDIS_URL, avoid setting it twice.
    if (!hasPasswordInRedisUrl(redisUrl)) {
        redisOptions.password = redisPassword;
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
