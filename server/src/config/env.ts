import dotenv from "dotenv";
import path from "node:path";

dotenv.config({
    path: path.resolve(
        process.cwd(),
        process.env.NODE_ENV === "production" ? ".env.production" : ".env.development"
    ),
});

export const APP_NAME = process.env.APP_NAME || "Trackence";

/**
 * Validate required environment variables at startup
 */
export function validateEnv(): void {
    const required = [
        "MONGODB_URI",
        "JWT_SECRET",
        "REDIS_URL",
    ];

    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        throw new Error(
            `Missing required environment variables: ${missing.join(", ")}`
        );
    }

    if (process.env.NODE_ENV === "production") {
        const productionRecommended = ["FRONTEND_URL"];
        const missingProd = productionRecommended.filter((key) => !process.env[key]);
        if (missingProd.length > 0) {
            console.warn(
                `[Env] Production: consider setting: ${missingProd.join(", ")}`
            );
        }
    }

    const provider = String(process.env.EMAIL_PROVIDER || "smtp").trim().toLowerCase();
    if (provider === "resend") {
        const resendRequired = ["RESEND_API_KEY", "EMAIL_FROM"];
        const missingResend = resendRequired.filter((key) => !process.env[key]);
        if (missingResend.length > 0) {
            throw new Error(
                `EMAIL_PROVIDER=resend requires: ${missingResend.join(", ")}`
            );
        }
    } else if (provider === "smtp") {
        const smtpRequired = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"];
        const missingSmtp = smtpRequired.filter((key) => !process.env[key]);
        if (missingSmtp.length > 0) {
            console.warn(
                `[Env] EMAIL_PROVIDER=smtp is missing: ${missingSmtp.join(", ")}. Email delivery will fail.`
            );
        }
    }
}
