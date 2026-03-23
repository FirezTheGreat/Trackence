import { apiGet, apiPost, apiPatch } from "./api";
import type { User } from "../stores/auth.store";

export interface AuthOtpResponse {
    message: string;
    otpExpiresInSeconds: number;
}

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
            return { user: maybeUser as User };
        }

        // Backward-compatible normalization if backend returns user fields at top level.
        return {
            user: {
                userId: String(response?.userId || ""),
                role: response?.role,
                platformRole: response?.platformRole,
                adminStatus: response?.adminStatus,
                email: String(response?.email || ""),
                name: String(response?.name || ""),
                organizationIds: Array.isArray(response?.organizationIds) ? response.organizationIds : [],
                requestedOrganizationIds: Array.isArray(response?.requestedOrganizationIds)
                    ? response.requestedOrganizationIds
                    : [],
                orgAdmins: Array.isArray(response?.orgAdmins) ? response.orgAdmins : [],
                currentOrganizationId:
                    typeof response?.currentOrganizationId === "string" || response?.currentOrganizationId === null
                        ? response.currentOrganizationId
                        : null,
                userOrgRoles: Array.isArray(response?.userOrgRoles) ? response.userOrgRoles : [],
                notificationDefaults: response?.notificationDefaults,
            } as User,
        };
    },

    /**
     * Resend OTP
     */
    resendOTP: async (email: string) => {
        return apiPost<AuthOtpResponse>("/api/auth/resend-otp", { email }, { skipAuth: true });
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
        return apiGet<User>("/api/auth/me", {
            skipAuth: true,
            attemptRefreshOn401: true,
        });
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
