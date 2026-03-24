import { apiGet, apiPost, apiPatch } from "./api";
import type { User } from "../stores/auth.store";

export interface AuthOtpResponse {
    message: string;
    otpExpiresInSeconds: number;
}

export interface OtpDeliveryStatusResponse {
    email: string;
    suppressed: boolean;
    reason?: string;
    source?: string;
    lastEventAt?: string | null;
}

const normalizePlatformRoleValue = (value: unknown): User["platformRole"] => {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "platform_owner" || normalized === "platform owner") {
        return "platform_owner";
    }
    return "user";
};

const normalizeUserPayload = (source: any): User => ({
    userId: String(source?.userId || ""),
    role: source?.role,
    platformRole: normalizePlatformRoleValue(source?.platformRole),
    email: String(source?.email || ""),
    name: String(source?.name || ""),
    organizationIds: Array.isArray(source?.organizationIds) ? source.organizationIds : [],
    requestedOrganizationIds: Array.isArray(source?.requestedOrganizationIds)
        ? source.requestedOrganizationIds
        : [],
    orgAdmins: Array.isArray(source?.orgAdmins) ? source.orgAdmins : [],
    currentOrganizationId:
        typeof source?.currentOrganizationId === "string" || source?.currentOrganizationId === null
            ? source.currentOrganizationId
            : null,
    userOrgRoles: Array.isArray(source?.userOrgRoles) ? source.userOrgRoles : [],
    notificationDefaults: source?.notificationDefaults,
});

export const authAPI = {
    /**
     * Send OTP for login
     */
    login: async (email: string) => {
        return apiPost<AuthOtpResponse>("/api/auth/login", { email }, { skipAuth: true });
    },

    /**
     * Register a new user
     */
    signup: async (data: { email: string; name: string; inviteToken?: string }) => {
        return apiPost<AuthOtpResponse>("/api/auth/signup", data, { skipAuth: true });
    },

    /**
     * Verify OTP to complete login/signup
     */
    verifyOTP: async (email: string, otp: string) => {
        const response = await apiPost<any>("/api/auth/verify-otp", { email, otp }, { skipAuth: true });

        const maybeUser = response?.user;
        if (maybeUser && typeof maybeUser === "object" && maybeUser.userId) {
            return { user: normalizeUserPayload(maybeUser) };
        }

        // Backward-compatible normalization if backend returns user fields at top level.
        return {
            user: normalizeUserPayload(response),
        };
    },

    /**
     * Resend OTP
     */
    resendOTP: async (email: string) => {
        return apiPost<AuthOtpResponse>("/api/auth/resend-otp", { email }, { skipAuth: true });
    },

    getOtpDeliveryStatus: async (email: string) => {
        const query = encodeURIComponent(String(email || "").trim().toLowerCase());
        return apiGet<OtpDeliveryStatusResponse>(`/api/auth/otp-delivery-status?email=${query}`, {
            skipAuth: true,
        });
    },

    /**
     * Logout
     */
    logout: async () => {
        return apiPost("/api/auth/logout", undefined, { skipAuth: true });
    },

    /**
     * Get current authenticated user
     */
    getMe: async () => {
        const response = await apiGet<any>("/api/auth/me", {
            skipAuth: true,
            attemptRefreshOn401: true,
        });

        // Support both payload shapes: { ...userFields } and { user: { ...userFields } }.
        const source = response?.user && typeof response.user === "object" ? response.user : response;
        return normalizeUserPayload(source);
    },

    /**
     * Update current organization context for the user
     */
    updateCurrentOrganization: async (organizationId: string) => {
        return apiPatch("/api/auth/current-organization", { organizationId });
    },

    /**
     * Update authenticated user's name
     */
    updateMyName: async (name: string) => {
        return apiPatch<{ message: string; user: Pick<User, "userId" | "name" | "email"> }>(
            "/api/auth/me/name",
            { name }
        );
    },

    getMyNotificationDefaults: async () => {
        return apiGet<{
            notificationDefaults: {
                recipients: string[];
                includeSelf: boolean;
                sendSessionEndEmail: boolean;
                sendAbsenceEmail: boolean;
                attachReport: boolean;
            };
        }>("/api/auth/me/notification-defaults");
    },

    updateMyNotificationDefaults: async (payload: {
        recipients: string[];
        includeSelf: boolean;
        sendSessionEndEmail: boolean;
        sendAbsenceEmail: boolean;
        attachReport: boolean;
    }) => {
        return apiPatch<{
            message: string;
            notificationDefaults: {
                recipients: string[];
                includeSelf: boolean;
                sendSessionEndEmail: boolean;
                sendAbsenceEmail: boolean;
                attachReport: boolean;
            };
        }>("/api/auth/me/notification-defaults", payload);
    }
};
