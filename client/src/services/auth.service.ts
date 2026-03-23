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
        return apiPost<{ user: User }>("/api/auth/verify-otp", { email, otp }, { skipAuth: true });
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
        return apiPost("/api/auth/logout");
    },

    /**
     * Get current authenticated user
     */
    getMe: async () => {
        return apiGet<User>("/api/auth/me", { skipAuth: true });
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
