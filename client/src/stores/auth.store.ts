import { create } from "zustand";
import { authAPI } from "../services/auth.service";
import { disconnectAdminSocket } from "../services/socket.service";

export interface User {
    userId: string;
    role: "admin" | "faculty";
    platformRole: "user" | "superAdmin" | "platform_owner";
    adminStatus: "none" | "pending" | "approved";
    email: string;
    name: string;
    organizationIds: string[];
    requestedOrganizationIds: string[];
    orgAdmins?: string[];
    currentOrganizationId?: string | null;
    userOrgRoles?: Array<{ organizationId: string; role: "admin" | "faculty" }>;
    notificationDefaults?: {
        recipients: string[];
        includeSelf: boolean;
        sendSessionEndEmail: boolean;
        sendAbsenceEmail: boolean;
        attachReport: boolean;
    };
}

interface AuthState {
    user: User | null;
    loading: boolean;
    isAuthenticated: boolean;
    loginEmail: string | null;

    setLoginEmail: (email: string) => void;
    setUser: (user: User) => void;
    clearUser: () => void;
    logout: () => Promise<void>;
    checkAuth: () => Promise<void>;
    setCurrentOrganization: (organizationId: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    loading: true,
    isAuthenticated: false,
    loginEmail: null,

    setLoginEmail: (email) => set({ loginEmail: email }),

    setUser: (user) =>
        set({
            user,
            isAuthenticated: true,
            loading: false,
            loginEmail: null,
        }),

    clearUser: () =>
        set({
            user: null,
            isAuthenticated: false,
            loading: false,
            loginEmail: null,
        }),

    logout: async () => {
        try {
            // Call backend logout endpoint
            await authAPI.logout();
        } catch (error) {
            console.error("Logout error:", error);
            // Continue with local logout even if API fails
        } finally {
            // Disconnect admin socket if connected
            disconnectAdminSocket();

            // Clear local state
            set({
                user: null,
                isAuthenticated: false,
                loading: false,
            });

            // Redirect to login
            window.location.href = "/auth/login";
        }
    },

    checkAuth: async () => {
        try {
            const data = await authAPI.getMe();

            set({
                user: data,
                isAuthenticated: true,
                loading: false,
            });
        } catch (error) {
            set({
                user: null,
                isAuthenticated: false,
                loading: false,
            });
        }
    },

    setCurrentOrganization: async (organizationId: string) => {
        try {
            await authAPI.updateCurrentOrganization(organizationId);

            // Fetch updated user data to get the new role from backend
            const data = await authAPI.getMe();

            set({
                user: data,
                isAuthenticated: true,
                loading: false,
            });
        } catch (error) {
            console.error("Failed to update current organization:", error);
            throw error;
        }
    },
}));
