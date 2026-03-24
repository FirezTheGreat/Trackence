import { create } from "zustand";
import { authAPI } from "../services/auth.service";
import { APIError } from "../services/api";
import { disconnectAdminSocket } from "../services/socket.service";

export interface User {
    userId: string;
    role: "admin" | "member";
    platformRole: "user" | "platform_owner";
    email: string;
    name: string;
    organizationIds: string[];
    requestedOrganizationIds: string[];
    orgAdmins?: string[];
    currentOrganizationId?: string | null;
    userOrgRoles?: Array<{ organizationId: string; role: "admin" | "member" }>;
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

const normalizePlatformOwnerRole = (user: User): User => {
    const rawPlatformRole = String(user?.platformRole || "").trim();
    const normalizedPlatformRole = rawPlatformRole.toLowerCase();

    const platformRole: User["platformRole"] =
        normalizedPlatformRole === "platform_owner" ||
        normalizedPlatformRole === "platform owner"
            ? "platform_owner"
            : "user";

    return {
        ...user,
        platformRole,
    };
};

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    loading: true,
    isAuthenticated: false,
    loginEmail: null,

    setLoginEmail: (email) => {
        const normalized = String(email || "").trim().toLowerCase();
        if (normalized) {
            sessionStorage.setItem("authLoginEmail", normalized);
        }
        set({ loginEmail: normalized || null });
    },

    setUser: (user) =>
        {
            if (!user || !user.userId || !user.email) {
                sessionStorage.removeItem("authLoginEmail");
                set({
                    user: null,
                    isAuthenticated: false,
                    loading: false,
                    loginEmail: null,
                });
                return;
            }

            sessionStorage.removeItem("authLoginEmail");
            const normalizedUser = normalizePlatformOwnerRole(user);
            set({
                user: normalizedUser,
                isAuthenticated: true,
                loading: false,
                loginEmail: null,
            });
        },

    clearUser: () =>
        {
            sessionStorage.removeItem("authLoginEmail");
            set({
                user: null,
                isAuthenticated: false,
                loading: false,
                loginEmail: null,
            });
        },

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

            sessionStorage.removeItem("authLoginEmail");

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
            const normalizedUser = normalizePlatformOwnerRole(data as User);

            set({
                user: normalizedUser,
                isAuthenticated: true,
                loading: false,
            });
        } catch (error) {
            // Only clear auth state for explicit authentication failures.
            // For network/transient issues, preserve existing session state.
            if (error instanceof APIError && error.status === 401) {
                set({
                    user: null,
                    isAuthenticated: false,
                    loading: false,
                });
                return;
            }

            set((state) => ({
                user: state.user,
                isAuthenticated: state.isAuthenticated,
                loading: false,
            }));
        }
    },

    setCurrentOrganization: async (organizationId: string) => {
        try {
            await authAPI.updateCurrentOrganization(organizationId);

            // Fetch updated user data to get the new role from backend
            const data = await authAPI.getMe();
            const normalizedUser = normalizePlatformOwnerRole(data as User);

            set({
                user: normalizedUser,
                isAuthenticated: true,
                loading: false,
            });
        } catch (error) {
            console.error("Failed to update current organization:", error);
            throw error;
        }
    },
}));
