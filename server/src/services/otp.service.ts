import crypto from "crypto";
import { generateOtp, RESPONSE_MESSAGE } from "../utils/auth.utils";
import {
  redisDelSafe,
  redisExpireSafe,
  redisGetSafe,
  redisIncrSafe,
  redisSetExSafe,
  redisTtlSafe,
} from "./redis-fallback.service";

export default class OTPService {
  private static key = {
    otp: (email: string) => `auth:otp:${email}`,
    attempts: (email: string) => `auth:otp:attempts:${email}`,
    requests: (email: string) => `auth:otp:requests:${email}`,
    cooldown: (email: string) => `auth:otp:cooldown:${email}`,
  };

  private static OTP_EXPIRY = 5 * 60; // 5 minutes
  private static MAX_ATTEMPTS = 3;
  private static MAX_REQUESTS = 8;

  static get OTP_EXPIRY_MINS() {
    return this.OTP_EXPIRY / 60;
  }

  static get OTP_EXPIRY_SECONDS() {
    return this.OTP_EXPIRY;
  }

  /**
   * Generates & stores OTP with rate limiting
   */
  static async generate(email: string): Promise<string> {
    const requestKey = this.key.requests(email);
    const otpKey = this.key.otp(email);
    const attemptsKey = this.key.attempts(email);

    const requestCount = await redisIncrSafe(requestKey);

    if (requestCount === 1) {
      await redisExpireSafe(requestKey, this.OTP_EXPIRY * 2);
    }

    if (requestCount > this.MAX_REQUESTS) {
      const ttl = Math.max(await redisTtlSafe(requestKey), 0);
      throw new Error(
        RESPONSE_MESSAGE.otp.tooManyRequests(Math.ceil(ttl / 60))
      );
    }

    const { otp, hashedOtp } = generateOtp();

    await redisSetExSafe(otpKey, this.OTP_EXPIRY, hashedOtp);
    await redisSetExSafe(attemptsKey, this.OTP_EXPIRY, "0");

    return otp;
  }

  /**
   * Verifies OTP securely with attempt tracking
   */
  static async verify(email: string, otp: string): Promise<boolean> {
    const otpKey = this.key.otp(email);
    const attemptsKey = this.key.attempts(email);
    const cooldownKey = this.key.cooldown(email);

    if (await redisGetSafe(cooldownKey)) {
      const ttl = Math.max(await redisTtlSafe(cooldownKey), 0);
      throw new Error(
        RESPONSE_MESSAGE.otp.tooManyAttempts(Math.ceil(ttl / 60))
      );
    }

    const storedHash = await redisGetSafe(otpKey);
    if (!storedHash) throw new Error(RESPONSE_MESSAGE.otp.expired);

    const inputHash = crypto
      .createHash("sha256")
      .update(otp + process.env.OTP_PEPPER!)
      .digest("hex");

    const isValid =
      storedHash.length === inputHash.length &&
      crypto.timingSafeEqual(
        Buffer.from(storedHash),
        Buffer.from(inputHash)
      );

    if (isValid) {
      await redisDelSafe(otpKey);
      await redisDelSafe(attemptsKey);
      return true;
    }

    const attempts = await redisIncrSafe(attemptsKey);

    if (attempts > this.MAX_ATTEMPTS) {
      await redisDelSafe(otpKey);
      await redisDelSafe(attemptsKey);
      await redisSetExSafe(this.key.cooldown(email), this.OTP_EXPIRY, "1");

      const ttl = Math.max(
        await redisTtlSafe(this.key.cooldown(email)),
        0
      );

      throw new Error(
        RESPONSE_MESSAGE.otp.tooManyAttempts(Math.ceil(ttl / 60))
      );
    }

    return false;
  }

  /**
   * Clears OTP state (used on logout or restart flow)
   */
  static async invalidate(
    email: string,
    keepRateLimit = false
  ): Promise<void> {
    await redisDelSafe(this.key.otp(email));
    await redisDelSafe(this.key.attempts(email));

    if (!keepRateLimit) {
      await redisDelSafe(this.key.requests(email));
      await redisDelSafe(this.key.cooldown(email));
    }
  }
}
