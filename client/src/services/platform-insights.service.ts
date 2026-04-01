import { apiGet } from "./api";
import type { PlatformOverviewResponse } from "../types/platformInsights.types";
import { APIError } from "./api";

export const platformInsightsAPI = {
  getOverview: async (): Promise<PlatformOverviewResponse> => {
    try {
      return await apiGet<PlatformOverviewResponse>("/api/admin/dashboard/platform/overview");
    } catch (error) {
      if (error instanceof APIError && error.status === 404) {
        return apiGet<PlatformOverviewResponse>("/api/admin/platform/overview");
      }
      throw error;
    }
  },
};
