import { create } from "zustand";
import { dashboardAPI } from "../services/dashboard.service";

export interface DashboardMetrics {
    activeUsers: number;
    sessionsToday: number;
    avgAttendance: number;
    totalAbsences: number;
    attendanceTrend: Array<{ date: string; value: number }>;
    sessionDistribution: Array<{ name: string; value: number }>;
    topDepartments: Array<{ name: string; count: number }>;
    actionItems: Array<{ id: string; title: string; priority: "high" | "medium" | "low" }>;
}

export interface Organization {
    organizationId: string;
    name: string;
    code: string;
    plan: "free" | "pro" | "enterprise";
    memberCount: number;
    isActive: boolean;
}

interface DashboardState {
    currentOrgId: string | null;
    organizations: Organization[];

    // Data
    metrics: DashboardMetrics | null;
    loading: boolean;
    error: string | null;

    // Actions
    setOrganizations: (orgs: Organization[]) => void;
    setCurrentOrg: (orgId: string) => Promise<void>;
    fetchMetrics: (orgId: string) => Promise<void>;
    switchOrganization: (orgId: string) => Promise<void>;
    clearError: () => void;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
    currentOrgId: null,
    organizations: [],
    metrics: null,
    loading: false,
    error: null,

    setOrganizations: (orgs) => {
        set({ organizations: orgs });
        // Auto-select first org if none selected
        if (orgs.length > 0 && !get().currentOrgId) {
            set({ currentOrgId: orgs[0].organizationId });
        }
    },

    setCurrentOrg: async (orgId: string) => {
        const org = get().organizations.find((o) => o.organizationId === orgId);
        if (org) {
            set({ currentOrgId: orgId });
        }
    },

    fetchMetrics: async (orgId: string) => {
        set({ loading: true, error: null, currentOrgId: orgId, metrics: null });
        try {
            const data = await dashboardAPI.getMetrics(orgId);
            set({ metrics: data.metrics, loading: false });
        } catch (error) {
            set({
                error: error instanceof Error ? error.message : "Failed to fetch metrics",
                metrics: null,
                loading: false,
            });
        }
    },

    switchOrganization: async (orgId: string) => {
        set({ error: null, currentOrgId: orgId });
        try {
            await get().fetchMetrics(orgId);
        } catch (error) {
            set({
                error: error instanceof Error ? error.message : "Failed to switch organization",
            });
        }
    },

    clearError: () => set({ error: null }),
}));
