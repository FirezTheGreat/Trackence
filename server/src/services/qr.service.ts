import { nanoid } from "nanoid";
import QRCode from "qrcode";
import redis from "../config/redis";

const QR_TTL_SECONDS = 15;
const USED_TOKEN_TTL_SECONDS = 30;

export interface QRPayload {
  sessionId: string;
  qrToken: string;
  issuedAt: number;
  expiresAt: number;
}

/**
 * Generate a QR token via nanoid
 */
export const generateQRToken = (): string => {
  return nanoid(21);
};

/**
 * Store current QR token in Redis for session and mark as valid for TTL
 */
export const setQRToken = async (
  sessionId: string,
  token: string,
  ttl: number = QR_TTL_SECONDS
): Promise<void> => {
  const currentKey = `qr:current:${sessionId}`;
  const validKey = `qr:valid:${sessionId}:${token}`;
  
  await Promise.all([
    redis.set(currentKey, token, { EX: ttl }),
    redis.set(validKey, "1", { EX: ttl })
  ]);
};

/**
 * Get current QR token for session
 */
export const getQRToken = async (
  sessionId: string
): Promise<string | null> => {
  const currentKey = `qr:current:${sessionId}`;
  // Fallback to legacy key if current doesn't exist yet
  return (await redis.get(currentKey)) || (await redis.get(`qr:${sessionId}`));
};

/**
 * Verify token is valid for session
 */
export const verifyQRToken = async (
  sessionId: string,
  token: string
): Promise<boolean> => {
  const exists = await redis.exists(`qr:valid:${sessionId}:${token}`);
  if (exists === 1) return true;
  
  // Fallback to legacy check
  const stored = await getQRToken(sessionId);
  return stored === token;
};

/**
 * Mark token as used (replay protection)
 * Key: qr:used:${sessionId}:${userId}:${qrToken}, TTL: 30 seconds
 */
export const markTokenAsUsed = async (
  sessionId: string,
  userId: string,
  qrToken: string
): Promise<void> => {
  const key = `qr:used:${sessionId}:${userId}:${qrToken}`;
  await redis.set(key, "1", { EX: USED_TOKEN_TTL_SECONDS });
};

/**
 * Check if token was already used
 */
export const isTokenUsed = async (
  sessionId: string,
  userId: string,
  qrToken: string
): Promise<boolean> => {
  const key = `qr:used:${sessionId}:${userId}:${qrToken}`;
  const exists = await redis.exists(key);
  return exists === 1;
};

/**
 * Build QR payload and generate image data URL.
 * Also caches the result in Redis so every consumer gets the identical image.
 */
export const generateQRImage = async (
  sessionId: string,
  qrToken: string,
  ttlSeconds?: number
): Promise<{ qrImage: string; expiresAt: number }> => {
  const issuedAt = Date.now();
  const actualTTL = ttlSeconds || QR_TTL_SECONDS;
  const expiresAt = issuedAt + actualTTL * 1000;
  const payload: QRPayload = {
    sessionId,
    qrToken,
    issuedAt,
    expiresAt,
  };
  const qrImage = await QRCode.toDataURL(JSON.stringify(payload), {
    margin: 2,
    width: 280,
  });

  // Cache in Redis so the GET endpoint returns this exact image
  const cacheKey = `qr:image:${sessionId}`;
  await redis.set(
    cacheKey,
    JSON.stringify({ qrImage, expiresAt }),
    { EX: actualTTL + 5 } // keep a few seconds longer than the token
  );

  return { qrImage, expiresAt };
};

/**
 * Get the cached QR image for a session (set during rotation).
 * Returns null if nothing is cached.
 */
export const getCachedQRImage = async (
  sessionId: string
): Promise<{ qrImage: string; expiresAt: number } | null> => {
  const cacheKey = `qr:image:${sessionId}`;
  const raw = await redis.get(cacheKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/**
 * Create attendance lock to prevent duplicate marking
 */
export const createAttendanceLock = async (
  sessionId: string,
  userId: string,
  ttl: number = 3600
): Promise<boolean> => {
  const key = `attendance:lock:${sessionId}:${userId}`;
  const result = await redis.set(key, "locked", { NX: true, EX: ttl });
  return result === "OK";
};

/**
 * Check if attendance lock exists
 */
export const hasAttendanceLock = async (
  sessionId: string,
  userId: string
): Promise<boolean> => {
  const key = `attendance:lock:${sessionId}:${userId}`;
  const exists = await redis.exists(key);
  return exists === 1;
};

/**
 * Clean up session QR data (call when session ends)
 */
export const cleanupSessionQR = async (sessionId: string): Promise<void> => {
  const key = `qr:${sessionId}`;
  await redis.del(key);
};
