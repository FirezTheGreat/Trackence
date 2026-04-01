export type PlatformOrgSlice = {
  organizationId: string;
  organizationName: string;
  organizationCode: string;
  memberCount: number;
  adminCount: number;
  activeMembers: number;
  activePercentage: number;
  totalSessionsHosted: number;
  liveSessionsNow: number;
  endedSessions: number;
  activeDepartmentsNow: number;
  sessionsToday: number;
  sessionsLast7Days: number;
  sessionsLast30Days: number;
  attendanceRate: number;
  absenceRate: number;
  staleActiveSessions: number;
  status: "healthy" | "warning" | "critical" | "masked";
  isMasked?: boolean;
  organizationsGrouped?: number;
};

export type PlatformDepartmentSlice = {
  organizationId: string;
  organizationName: string;
  departmentName: string;
  memberCount: number;
  totalSessionsHosted: number;
  liveSessionsNow: number;
  endedSessions: number;
  sessionsLast7Days: number;
  sessionsLast30Days: number;
  attendanceRate: number;
  absenceRate: number;
  trendQuality: "stable" | "monitoring" | "needs_attention" | "masked";
  isMasked?: boolean;
  departmentsGrouped?: number;
};

export type PlatformAlert = {
  severity: "warning" | "critical";
  type: "stale_sessions" | "low_activity" | "low_attendance";
  organizationId?: string;
  organizationName?: string;
  message: string;
};

export type PlatformOverview = {
  generatedAt: string;
  privacyThreshold: number;
  summary: {
    totalOrganizations: number;
    visibleOrganizations: number;
    maskedOrganizations: number;
    totalMembers: number;
    activeMembers: number;
    totalSessionsHosted: number;
    liveSessionsNow: number;
    endedSessions: number;
    totalDepartments: number;
    activeDepartmentsNow: number;
    departmentsWithSessions: number;
    totalSessionsToday: number;
    totalSessionsLast7Days: number;
    staleActiveSessions: number;
    platformAttendanceRate: number;
    platformAbsenceRate: number;
    healthyOrganizations: number;
    warningOrganizations: number;
    criticalOrganizations: number;
  };
  organizations: PlatformOrgSlice[];
  departments: PlatformDepartmentSlice[];
  alerts: PlatformAlert[];
};

export type PlatformOverviewResponse = {
  success: boolean;
  data: PlatformOverview;
  source: "cache" | "computed";
};
