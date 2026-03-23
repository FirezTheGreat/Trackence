import crypto from "crypto";
import redisClient from "../config/redis";
import { generateOtp, RESPONSE_MESSAGE } from "../utils/auth.utils";

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

    const requestCount = await redisClient.incr(requestKey);

    if (requestCount === 1) {
      await redisClient.expire(requestKey, this.OTP_EXPIRY * 2);
    }

    if (requestCount > this.MAX_REQUESTS) {
      const ttl = Math.max(await redisClient.ttl(requestKey), 0);
      throw new Error(
        RESPONSE_MESSAGE.otp.tooManyRequests(Math.ceil(ttl / 60))
      );
    }

    const { otp, hashedOtp } = generateOtp();

    await redisClient
      .multi()
      .setEx(otpKey, this.OTP_EXPIRY, hashedOtp)
      .setEx(attemptsKey, this.OTP_EXPIRY, "0")
      .exec();

    return otp;
  }

  /**
   * Verifies OTP securely with attempt tracking
   */
  static async verify(email: string, otp: string): Promise<boolean> {
    const otpKey = this.key.otp(email);
    const attemptsKey = this.key.attempts(email);
    const cooldownKey = this.key.cooldown(email);

    if (await redisClient.get(cooldownKey)) {
      const ttl = Math.max(await redisClient.ttl(cooldownKey), 0);
      throw new Error(
        RESPONSE_MESSAGE.otp.tooManyAttempts(Math.ceil(ttl / 60))
      );
    }

    const storedHash = await redisClient.get(otpKey);
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
      await redisClient.del(otpKey);
      await redisClient.del(attemptsKey);
      return true;
    }

    const attempts = await redisClient.incr(attemptsKey);

    if (attempts > this.MAX_ATTEMPTS) {
      await redisClient
        .multi()
        .del(otpKey)
        .del(attemptsKey)
        .set(this.key.cooldown(email), "1", {
          EX: this.OTP_EXPIRY,
        })
        .exec();

      const ttl = Math.max(
        await redisClient.ttl(this.key.cooldown(email)),
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
    const multi = redisClient.multi();

    multi.del(this.key.otp(email));
    multi.del(this.key.attempts(email));

    if (!keepRateLimit) {
      multi.del(this.key.requests(email));
      multi.del(this.key.cooldown(email));
    }

    await multi.exec();
  }
}
