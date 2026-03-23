import redisClient from "../config/redis";
import { logger } from "../utils/logger";

type MemoryValue = {
  value: string;
  expiresAt: number | null;
};

const memoryStore = new Map<string, MemoryValue>();

const isDevelopment = process.env.NODE_ENV !== "production";

const isRedisAuthError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const message = error.message.toUpperCase();
  return message.includes("NOAUTH") || message.includes("WRONGPASS") || message.includes("AUTH");
};

const canFallback = (error: unknown): boolean => isDevelopment && isRedisAuthError(error);

const readMemory = async (key: string): Promise<string | null> => {
  const entry = memoryStore.get(key);
  if (!entry) return null;

  if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
    memoryStore.delete(key);
    return null;
  }

  return entry.value;
};

const setMemory = async (key: string, value: string, ttlSeconds?: number): Promise<void> => {
  const expiresAt = ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null;
  memoryStore.set(key, { value, expiresAt });
};

const deleteMemory = async (key: string): Promise<void> => {
  memoryStore.delete(key);
};

const incrMemory = async (key: string): Promise<number> => {
  const current = await readMemory(key);
  const parsed = Number(current ?? "0");
  const next = Number.isFinite(parsed) ? parsed + 1 : 1;
  await setMemory(key, String(next));
  return next;
};

const expireMemory = async (key: string, ttlSeconds: number): Promise<void> => {
  const current = await readMemory(key);
  if (current === null) return;
  await setMemory(key, current, ttlSeconds);
};

const ttlMemory = async (key: string): Promise<number> => {
  const entry = memoryStore.get(key);
  if (!entry) return -2;
  if (entry.expiresAt === null) return -1;

  const leftMs = entry.expiresAt - Date.now();
  if (leftMs <= 0) {
    memoryStore.delete(key);
    return -2;
  }

  return Math.ceil(leftMs / 1000);
};

const logFallback = (operation: string, error: unknown) => {
  logger.warn(`[RedisFallback] Using in-memory fallback for ${operation}`, {
    error: error instanceof Error ? error.message : String(error),
  });
};

export const redisGetSafe = async (key: string): Promise<string | null> => {
  try {
    return await redisClient.get(key);
  } catch (error) {
    if (!canFallback(error)) throw error;
    logFallback("GET", error);
    return readMemory(key);
  }
};

export const redisSetExSafe = async (key: string, ttlSeconds: number, value: string): Promise<void> => {
  try {
    await redisClient.setEx(key, ttlSeconds, value);
  } catch (error) {
    if (!canFallback(error)) throw error;
    logFallback("SETEX", error);
    await setMemory(key, value, ttlSeconds);
  }
};

export const redisDelSafe = async (key: string): Promise<void> => {
  try {
    await redisClient.del(key);
  } catch (error) {
    if (!canFallback(error)) throw error;
    logFallback("DEL", error);
    await deleteMemory(key);
  }
};

export const redisIncrSafe = async (key: string): Promise<number> => {
  try {
    return await redisClient.incr(key);
  } catch (error) {
    if (!canFallback(error)) throw error;
    logFallback("INCR", error);
    return incrMemory(key);
  }
};

export const redisExpireSafe = async (key: string, ttlSeconds: number): Promise<void> => {
  try {
    await redisClient.expire(key, ttlSeconds);
  } catch (error) {
    if (!canFallback(error)) throw error;
    logFallback("EXPIRE", error);
    await expireMemory(key, ttlSeconds);
  }
};

export const redisTtlSafe = async (key: string): Promise<number> => {
  try {
    return await redisClient.ttl(key);
  } catch (error) {
    if (!canFallback(error)) throw error;
    logFallback("TTL", error);
    return ttlMemory(key);
  }
};
