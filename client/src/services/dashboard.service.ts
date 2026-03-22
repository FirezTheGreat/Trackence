import { apiGet } from "./api";
import type { DashboardMetrics } from "../stores/dashboard.store";

export const dashboardAPI = {
    /**
     * Fetch complete dashboard metrics (stats, trends, actions)
     */
    getMetrics: async (orgId?: string): Promise<{ metrics: DashboardMetrics }> => {
        let endpoint = "/api/admin/dashboard/metrics";
        if (orgId) {
            endpoint += `?orgId=${encodeURIComponent(orgId)}`;
        }
        return apiGet<{ metrics: DashboardMetrics }>(endpoint);
    }
};
