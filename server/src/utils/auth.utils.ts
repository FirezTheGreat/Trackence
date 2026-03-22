import crypto from "crypto";

/**
 * Centralized response messages for auth & OTP
 * Neutral, institutional tone (attendance system)
 */
const RESPONSE_MESSAGE = {
    otp: {
        sent: "A verification code has been sent to your email.",
        validated: "OTP verified successfully.",
        invalid: "Invalid verification code. Please try again.",
        expired: "This verification code has expired. Please request a new one.",
        tooManyAttempts: (minutes: number) =>
            `Too many incorrect attempts. Please try again after ${minutes} minutes.`,
        tooManyRequests: (minutes: number) =>
            `Too many OTP requests. Please wait ${minutes} minutes before retrying.`,
        serviceError:
            "Unable to process OTP request at the moment. Please try again later.",
    },

    auth: {
        userNotFound:
            "No account found for this email. Please sign up to continue.",
        unauthorized:
            "You are not authorized to access this resource.",
        loggedIn: "Login successful. Redirecting...",
    },

    signup: {
        initiated:
            "Signup initiated. Please verify your email to continue.",
    },
} as const;

/**
 * Generates a secure, user-friendly OTP
 * Excludes ambiguous characters (0, O, I, l)
 */
const generateOtp = (
    length = 6
): { otp: string; hashedOtp: string } => {
    const SAFE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const bytes = crypto.randomBytes(length);

    let otp = "";
    for (let i = 0; i < length; i++) {
        otp += SAFE_CHARS[bytes[i] % SAFE_CHARS.length];
    }

    const hashedOtp = crypto
        .createHash("sha256")
        .update(otp + process.env.OTP_PEPPER!)
        .digest("hex");

    return { otp, hashedOtp };
};


const generateBase36Id = () => {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}

const isValidEmail = (email: string): boolean => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
    return regex.test(email);
};

const normalizeUserDisplayName = (name: unknown): { value: string | null; error?: string } => {
    if (typeof name !== "string") {
        return { value: null, error: "Name is required." };
    }

    const normalized = name.trim().replace(/\s+/g, " ");

    if (normalized.length < 2 || normalized.length > 80) {
        return { value: null, error: "Name must be between 2 and 80 characters." };
    }

    return { value: normalized };
};

/**
 * Extract organization ID from email domain
 * E.g., user@manipal.edu -> "manipal"
 * E.g., user@mit.manipal.edu -> "mit-manipal"
 */
const extractOrganizationFromEmail = (email: string): string => {
    const domain = email.split("@")[1];
    if (!domain) {
        throw new Error("Invalid email format");
    }
    // Remove .edu or .com and replace dots with hyphens
    const orgId = domain.replace(/\.(edu|com)$/i, "").replace(/\./g, "-");
    return orgId.toLowerCase();
};

export {
    RESPONSE_MESSAGE,
    generateOtp,
    generateBase36Id,
    isValidEmail,
    extractOrganizationFromEmail,
    normalizeUserDisplayName,
};