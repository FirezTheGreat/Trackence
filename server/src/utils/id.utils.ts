import { customAlphabet } from "nanoid";

const nanoid = customAlphabet(
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
    8
);

/**
 * Generates unique user ID
 * Example: USR-8FK29XQW
 */
const generateUserId = (): string => {
    return `USR-${nanoid()}`;
};

/**
 * Generates unique admin request ID
 * Example: REQ-4GH7KPQZ
 */
const generateRequestId = (): string => {
    return `REQ-${nanoid()}`;
};

/**
 * Generates unique session ID
 * Example: SES-9JK3LMNO
 */
const generateSessionId = (): string => {
    return `SES-${nanoid()}`;
};

/**
 * Generates unique attendance ID
 * Example: ATT-5PQ7RSTU
 */
const generateAttendanceId = (): string => {
    return `ATT-${nanoid()}`;
};

/**
 * Generates unique audit log ID
 */
const generateAuditId = (): string => {
    return `AUD-${nanoid()}`;
};

/**
 * Generates unique organization ID
 * Example: ORG-3MN7QRST
 */
const generateOrganizationId = (): string => {
    return `ORG-${nanoid()}`;
};

export { generateUserId, generateRequestId, generateSessionId, generateAttendanceId, generateAuditId, generateOrganizationId };
