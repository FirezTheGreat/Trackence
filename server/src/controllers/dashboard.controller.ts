import { Request, Response } from "express";
import Session from "../models/Session.model";
import Attendance from "../models/Attendance.model";
import Absence from "../models/Absence.model";
import User from "../models/User.model";
import OrganizationJoinRequest from "../models/OrganizationJoinRequest.model";
import Organization from "../models/Organization.model";
import { cacheService } from "../services/cache.service";
import { logger } from "../utils/logger";

interface DashboardMetrics {
  activeUsers: number;
  sessionsToday: number;
  avgAttendance: number;
  totalAbsences: number;
  attendanceTrend: Array<{ date: string; value: number }>;
  sessionDistribution: Array<{ name: string; value: number }>;
  topDepartments: Array<{ name: string; count: number }>;
  actionItems: Array<{ id: string; title: string; priority: "high" | "medium" | "low" }>;
}

type PlatformOrgSlice = {
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

type PlatformDepartmentSlice = {
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

type PlatformAlert = {
  severity: "warning" | "critical";
  type: "stale_sessions" | "low_activity" | "low_attendance";
  organizationId?: string;
  organizationName?: string;
  message: string;
};

type PlatformOverviewResponse = {
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

const WEEK_START_DAY = 1; // Monday

const getStartOfWeek = (date: Date, weekStartDay: number = WEEK_START_DAY): Date => {
  const start = new Date(date);
  const day = start.getDay();
  const diff = (day - weekStartDay + 7) % 7;
  start.setDate(start.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  return start;
};

const getOrgAdminCount = async (organizationId: string): Promise<number> => {
  const count = await User.countDocuments({
    $or: [
      {
        userOrgRoles: {
          $elemMatch: {
            organizationId,
            role: "admin",
          },
        },
      }
    ],
  });
  return count;
};

const getActiveMemberCount = async (
  organizationId: string,
  windowDays: number
): Promise<number> => {
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const [orgUsers, recentSessions] = await Promise.all([
    User.find({ organizationIds: organizationId }).select("userId").lean(),
    Session.find({ organizationId, createdAt: { $gte: cutoff } })
      .select("sessionId createdBy")
      .lean(),
  ]);

  const orgUserIds = new Set(orgUsers.map((u: any) => u.userId));
  const recentSessionIds = recentSessions.map((s: any) => s.sessionId);

  const attendeeIds = recentSessionIds.length
    ? await Attendance.distinct("userId", { sessionId: { $in: recentSessionIds } })
    : [];

  const activeIds = new Set<string>();

  recentSessions.forEach((session: any) => {
    if (orgUserIds.has(session.createdBy)) {
      activeIds.add(session.createdBy);
    }
  });

  attendeeIds.forEach((userId: string) => {
    if (orgUserIds.has(userId)) {
      activeIds.add(userId);
    }
  });

  return activeIds.size;
};

const resolveOrganizationId = (req: Request): { organizationId?: string; status?: number; message?: string } => {
  const requestedOrgId = typeof req.query.orgId === "string" ? req.query.orgId : undefined;
  const userOrgIds = req.user?.organizationIds || [];
  const hasPlatformOwnerAccess = req.user?.platformRole === "platform_owner";

  if (requestedOrgId && !userOrgIds.includes(requestedOrgId) && !hasPlatformOwnerAccess) {
    return { status: 403, message: "Forbidden: invalid organization context." };
  }

  const organizationId = requestedOrgId || req.user?.currentOrganizationId || userOrgIds[0];
  if (!organizationId) {
    return { status: 401, message: "No organization assigned" };
  }

  return { organizationId };
};

export const getDashboardMetrics = async (req: Request, res: Response): Promise<any> => {
  try {
    const orgContext = resolveOrganizationId(req);
    const organizationId = orgContext.organizationId;

    if (!organizationId) {
      return res.status(orgContext.status || 401).json({
        success: false,
        message: orgContext.message || "No organization assigned",
      });
    }

    const cacheKey = `dashboard:metrics:${organizationId}`;

    // Try to get from cache first
    const cachedMetrics = await cacheService.get<DashboardMetrics>(cacheKey);
    if (cachedMetrics) {
      return res.json({
        success: true,
        metrics: cachedMetrics,
        source: "cache",
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Parallel queries for better performance
    const [
      sessionsCount,
      attendanceTrend,
      sessionDistribution,
      topDepartments,
      pendingJoinRequests,
      organization,
      totalMembers,
      sessionsForAverage,
      todaySessions,
    ] = await Promise.all([
      // Sessions created today
      Session.countDocuments({
        organizationId,
        createdAt: { $gte: today },
      }),

      // Attendance trend: last 30 days
      getAttendanceTrend(organizationId),

      // Session distribution by time of day
      getSessionDistribution(organizationId),

      // Top departments by session count
      getTopDepartments(organizationId),

      // Pending org join requests
      OrganizationJoinRequest.countDocuments({
        organizationId,
        status: "pending",
      }),

      // Organization info for display
      Organization.findOne({ organizationId }).select("name"),

      // Total members in this org
      User.countDocuments({ organizationIds: organizationId }),

      // Last 30-day sessions for attendance rate baseline
      Session.find({
        organizationId,
        createdAt: { $gte: last30Days },
      })
        .select("sessionId memberCountAtStart")
        .lean(),

      // Today's sessions for absence counts
      Session.find({
        organizationId,
        createdAt: { $gte: today },
      })
        .select("sessionId")
        .lean(),
    ]);

    const activeUsersCount = await getActiveMemberCount(organizationId, 7);

    const todaySessionIds = todaySessions.map((session: any) => session.sessionId);
    const absencesCount = todaySessionIds.length
      ? await Absence.countDocuments({
          sessionId: { $in: todaySessionIds },
          markedManually: { $ne: true },
        })
      : 0;

    const averageSessionIds = sessionsForAverage.map((session: any) => session.sessionId);
    const attendanceCountForAverage = averageSessionIds.length
      ? await Attendance.countDocuments({ sessionId: { $in: averageSessionIds } })
      : 0;
    const expectedForAverage = sessionsForAverage.reduce((sum: number, session: any) => {
      const expectedCount =
        typeof session.memberCountAtStart === "number" && session.memberCountAtStart > 0
          ? session.memberCountAtStart
          : totalMembers;
      return sum + expectedCount;
    }, 0);
    const avgAttendance = expectedForAverage > 0
      ? Math.round((attendanceCountForAverage / expectedForAverage) * 100)
      : 0;

    // Action items: high priority alerts
    const actionItems: DashboardMetrics["actionItems"] = [];

    if (pendingJoinRequests > 0) {
      actionItems.push({
        id: "pending-join-requests",
        title: `${pendingJoinRequests} pending organization join requests`,
        priority: "high",
      });
    }

    if (absencesCount > 10) {
      actionItems.push({
        id: "high-absence",
        title: `High absences today (${absencesCount} records)`,
        priority: "medium",
      });
    }

    if (totalMembers > 0 && Math.round((activeUsersCount / totalMembers) * 100) < 40) {
      actionItems.push({
        id: "low-engagement",
        title: "Low member engagement in last 7 days",
        priority: "medium",
      });
    }

    const metrics: DashboardMetrics = {
      activeUsers: activeUsersCount,
      sessionsToday: sessionsCount,
      avgAttendance,
      totalAbsences: absencesCount,
      attendanceTrend,
      sessionDistribution,
      topDepartments,
      actionItems,
    };

    // Cache for 5 minutes
    await cacheService.set(cacheKey, metrics, 300);

    res.json({
      success: true,
      metrics,
      organization: {
        name: organization?.name,
      },
      source: "computed",
    });
  } catch (error) {
    logger.error("Error fetching dashboard metrics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard metrics",
    });
  }
};

async function getAttendanceTrend(organizationId: string): Promise<Array<{ date: string; value: number }>> {
  try {
    const trend: Array<{ date: string; value: number }> = [];
    const today = new Date();

    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const count = await Session.countDocuments({
        organizationId,
        createdAt: { $gte: date, $lt: nextDate },
      });

      trend.push({
        date: date.toISOString().split("T")[0],
        value: count,
      });
    }

    return trend;
  } catch (error) {
    logger.error("Error computing attendance trend:", error);
    return [];
  }
}

async function getSessionDistribution(organizationId: string): Promise<Array<{ name: string; value: number }>> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const distribution = await Session.aggregate([
    {
      $match: {
        organizationId: organizationId,
        createdAt: { $gte: today },
      },
    },
    {
      $group: {
        _id: {
          $hour: "$createdAt",
        },
        count: { $sum: 1 },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ]);

  const timeSlots = [
    "00:00",
    "01:00",
    "02:00",
    "03:00",
    "04:00",
    "05:00",
    "06:00",
    "07:00",
    "08:00",
    "09:00",
    "10:00",
    "11:00",
    "12:00",
    "13:00",
    "14:00",
    "15:00",
    "16:00",
    "17:00",
    "18:00",
    "19:00",
    "20:00",
    "21:00",
    "22:00",
    "23:00",
  ];

  return timeSlots.map((slot, index) => {
    const found = distribution.find((d) => d._id === index);
    return {
      name: slot,
      value: found?.count || 0,
    };
  });
}

async function getTopDepartments(organizationId: string): Promise<Array<{ name: string; count: number }>> {
  const result = await Session.aggregate([
    {
      $match: {
        organizationId: organizationId,
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "createdBy",
        foreignField: "userId",
        as: "user",
      },
    },
    {
      $unwind: {
        path: "$user",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $addFields: {
        departmentName: {
          $let: {
            vars: {
              dept: {
                $trim: {
                  input: {
                    $ifNull: ["$user.department", ""],
                  },
                },
              },
            },
            in: {
              $cond: [{ $eq: ["$$dept", ""] }, "Unassigned", "$$dept"],
            },
          },
        },
      },
    },
    {
      $group: {
        _id: "$departmentName",
        count: { $sum: 1 },
      },
    },
    {
      $sort: { count: -1 },
    },
    {
      $limit: 5,
    },
  ]);

  return result.map((item) => ({
    name: item._id || "Unassigned",
    count: item.count,
  }));
}

export const getEnhancedAnalytics = async (req: Request, res: Response): Promise<any> => {
  try {
    const orgContext = resolveOrganizationId(req);
    const organizationId = orgContext.organizationId;

    if (!organizationId) {
      return res.status(orgContext.status || 401).json({
        success: false,
        message: orgContext.message || "No organization assigned",
      });
    }

    const cacheKey = `dashboard:enhanced:${organizationId}`;
    const cachedData = await cacheService.get(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData, source: "cache" });
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const thisWeekStart = getStartOfWeek(now);
    const nextWeekStart = new Date(thisWeekStart);
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);

    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    // Get all session IDs for this org
    const orgSessions = await Session.find({ organizationId }).select("sessionId createdAt startTime isActive memberCountAtStart").lean();
    const allSessionIds = orgSessions.map((s: any) => s.sessionId);

    const thisWeekSessionIds = orgSessions
      .filter((session: any) => {
        const createdAt = new Date(session.createdAt);
        return createdAt >= thisWeekStart && createdAt < nextWeekStart;
      })
      .map((session: any) => session.sessionId);

    const lastWeekSessionIds = orgSessions
      .filter((session: any) => {
        const createdAt = new Date(session.createdAt);
        return createdAt >= lastWeekStart && createdAt < thisWeekStart;
      })
      .map((session: any) => session.sessionId);

    const thisMonthSessionsCount = orgSessions.filter((session: any) => new Date(session.createdAt) >= thisMonthStart).length;
    const lastMonthSessionsCount = orgSessions.filter((session: any) => {
      const createdAt = new Date(session.createdAt);
      return createdAt >= lastMonthStart && createdAt <= lastMonthEnd;
    }).length;

    const [
      // Attendance breakdown
      totalAttendanceRecords,
      totalAbsenceRecords,
      excusedAbsenceRecords,

      // Weekly comparison
      thisWeekAttendance,
      lastWeekAttendance,
      thisWeekAbsences,
      lastWeekAbsences,

      // Total members
      totalMembers,

      // Recent activity: last 7 days attendance per day
      recentAttendanceByDay,
    ] = await Promise.all([
      // Attendance breakdown (all time for this org's sessions)
      allSessionIds.length > 0
        ? Attendance.countDocuments({ sessionId: { $in: allSessionIds } })
        : 0,
      allSessionIds.length > 0
        ? Absence.countDocuments({
            sessionId: { $in: allSessionIds },
            markedManually: { $ne: true },
          })
        : 0,
      allSessionIds.length > 0
        ? Absence.countDocuments({
            sessionId: { $in: allSessionIds },
            isExcused: true,
            markedManually: { $ne: true },
          })
        : 0,

      thisWeekSessionIds.length > 0
        ? Attendance.countDocuments({ sessionId: { $in: thisWeekSessionIds } })
        : 0,
      lastWeekSessionIds.length > 0
        ? Attendance.countDocuments({ sessionId: { $in: lastWeekSessionIds } })
        : 0,
      thisWeekSessionIds.length > 0
        ? Absence.countDocuments({
            sessionId: { $in: thisWeekSessionIds },
            markedManually: { $ne: true },
          })
        : 0,
      lastWeekSessionIds.length > 0
        ? Absence.countDocuments({
            sessionId: { $in: lastWeekSessionIds },
            markedManually: { $ne: true },
          })
        : 0,

      // Members
      User.countDocuments({ organizationIds: organizationId }),

      // Last 7 days attendance sparkline
      getRecentAttendanceSparkline(organizationId, allSessionIds),
    ]);

    const activeMembers = await getActiveMemberCount(organizationId, 7);

    // Calculate percentage changes
    const calcChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    // Attendance rate
    const totalParticipation = totalAttendanceRecords + totalAbsenceRecords;
    const attendanceRate = totalParticipation > 0
      ? Math.round((totalAttendanceRecords / totalParticipation) * 100)
      : 0;

    // Pending (unexcused) absences
    const pendingAbsences = totalAbsenceRecords - excusedAbsenceRecords;

    // Peak hour detection from today's sessions
    const todaySessions = orgSessions.filter((s: any) => {
      const sessionStart = s.startTime ? new Date(s.startTime) : new Date(s.createdAt);
      return sessionStart >= todayStart;
    });
    const hourCounts: Record<number, number> = {};
    todaySessions.forEach((s: any) => {
      const sessionStart = s.startTime ? new Date(s.startTime) : new Date(s.createdAt);
      const hour = sessionStart.getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    const peakHour = Object.entries(hourCounts).sort(([, a], [, b]) => b - a)[0];
    const peakHourFormatted = peakHour
      ? `${parseInt(peakHour[0]) % 12 || 12}:00 ${parseInt(peakHour[0]) >= 12 ? "PM" : "AM"}`
      : "N/A";

    // Active sessions right now
    const activeSessions = orgSessions.filter((s: any) => s.isActive).length;

    const data = {
      attendanceBreakdown: {
        attended: totalAttendanceRecords,
        absent: pendingAbsences,
        excused: excusedAbsenceRecords,
        rate: attendanceRate,
      },
      weekDefinition: {
        startDay: "monday",
      },
      weeklyComparison: {
        sessions: {
          current: thisWeekSessionIds.length,
          previous: lastWeekSessionIds.length,
          change: calcChange(thisWeekSessionIds.length, lastWeekSessionIds.length),
        },
        attendance: { current: thisWeekAttendance, previous: lastWeekAttendance, change: calcChange(thisWeekAttendance, lastWeekAttendance) },
        absences: { current: thisWeekAbsences, previous: lastWeekAbsences, change: calcChange(thisWeekAbsences, lastWeekAbsences) },
      },
      summary: {
        totalMembers,
        activeMembers,
        totalSessions: orgSessions.length,
        thisMonthSessions: thisMonthSessionsCount,
        lastMonthSessions: lastMonthSessionsCount,
        monthlyChange: calcChange(thisMonthSessionsCount, lastMonthSessionsCount),
        activeSessions,
        peakHour: peakHourFormatted,
        avgSessionsPerDay: Math.round(thisMonthSessionsCount / Math.max(now.getDate(), 1)),
      },
      sparklines: {
        attendance: recentAttendanceByDay,
      },
    };

    await cacheService.set(cacheKey, data, 300);

    res.json({ success: true, data, source: "computed" });
  } catch (error) {
    logger.error("Error fetching enhanced analytics:", error);
    res.status(500).json({ success: false, message: "Failed to fetch enhanced analytics" });
  }
};

async function getRecentAttendanceSparkline(
  _organizationId: string,
  sessionIds: string[]
): Promise<Array<{ date: string; value: number }>> {
  const result: Array<{ date: string; value: number }> = [];
  const today = new Date();

  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);

    let count = 0;

    if (sessionIds.length > 0) {
      const daySessions = await Session.find({
        sessionId: { $in: sessionIds },
        createdAt: { $gte: date, $lt: nextDate },
      })
        .select("sessionId")
        .lean();

      const daySessionIds = daySessions.map((session: any) => session.sessionId);
      count = daySessionIds.length
        ? await Attendance.countDocuments({ sessionId: { $in: daySessionIds } })
        : 0;
    }

    result.push({
      date: date.toISOString().split("T")[0],
      value: count,
    });
  }

  return result;
}

export const getDashboardStats = async (req: Request, res: Response): Promise<any> => {
  try {
    const orgContext = resolveOrganizationId(req);
    const organizationId = orgContext.organizationId;

    if (!organizationId) {
      return res.status(orgContext.status || 401).json({
        success: false,
        message: orgContext.message || "No organization assigned",
      });
    }

    const orgSessionIds = await Session.find({ organizationId }).select("sessionId").lean();
    const sessionIds = orgSessionIds.map((s: any) => s.sessionId);

    const [totalUsers, totalSessions, thisMonthSessions, totalAbsences] = await Promise.all([
      User.countDocuments({ organizationIds: organizationId }),
      Session.countDocuments({ organizationId }),
      Session.countDocuments({
        organizationId,
        createdAt: {
          $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      }),
      sessionIds.length > 0
        ? Absence.countDocuments({
            sessionId: { $in: sessionIds },
            markedManually: { $ne: true },
          })
        : 0,
    ]);

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalSessions,
        thisMonthSessions,
        totalAbsences,
        avgSessionsPerDay: Math.round(thisMonthSessions / 30),
      },
    });
  } catch (error) {
    logger.error("Error fetching dashboard stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard stats",
    });
  }
};

export const getOrganizationHealth = async (req: Request, res: Response): Promise<any> => {
  try {
    const orgContext = resolveOrganizationId(req);
    const organizationId = orgContext.organizationId;

    if (!organizationId) {
      return res.status(orgContext.status || 401).json({
        success: false,
        message: orgContext.message || "No organization assigned",
      });
    }

    const org = await Organization.findOne({ organizationId });
    const userCount = await User.countDocuments({ organizationIds: organizationId });
    const [activeUserCount, adminCount, sessionsLast7Days] = await Promise.all([
      getActiveMemberCount(organizationId, 7),
      getOrgAdminCount(organizationId),
      Session.countDocuments({
        organizationId,
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      }),
    ]);

    let status: "healthy" | "warning" = "healthy";
    let score = 100;
    const alerts: string[] = [];

    const activePercentage = userCount > 0 ? Math.round((activeUserCount / userCount) * 100) : 0;

    // Check for health issues
    if (activePercentage < 50) {
      alerts.push("Low user engagement");
      score -= 20;
      status = "warning";
    }

    if (adminCount === 0) {
      alerts.push("No admin assigned");
      score -= 15;
      status = "warning";
    }

    if (sessionsLast7Days === 0) {
      alerts.push("No sessions created in last 7 days");
      score -= 25;
      status = "warning";
    }

    score = Math.max(0, Math.min(100, score));

    const health = {
      status,
      score,
      organization: {
        name: org?.name,
        code: org?.code,
        memberCount: userCount,
        activeMembers: activeUserCount,
        activePercentage,
        adminCount,
      },
      alerts,
    };

    res.json({
      success: true,
      health,
    });
  } catch (error) {
    logger.error("Error fetching organization health:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch organization health",
    });
  }
};

export const getPlatformOwnerOverview = async (_req: Request, res: Response): Promise<any> => {
  try {
    const privacyThreshold = 5;
    const cacheKey = `dashboard:platform:overview:v1:${privacyThreshold}`;
    const cached = await cacheService.get<PlatformOverviewResponse>(cacheKey);

    if (cached) {
      return res.json({
        success: true,
        data: cached,
        source: "cache",
      });
    }

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const organizations = await Organization.find({})
      .select("organizationId name code")
      .lean();

    if (!organizations.length) {
      const emptyData: PlatformOverviewResponse = {
        generatedAt: now.toISOString(),
        privacyThreshold,
        summary: {
          totalOrganizations: 0,
          visibleOrganizations: 0,
          maskedOrganizations: 0,
          totalMembers: 0,
          activeMembers: 0,
          totalSessionsHosted: 0,
          liveSessionsNow: 0,
          endedSessions: 0,
          totalDepartments: 0,
          activeDepartmentsNow: 0,
          departmentsWithSessions: 0,
          totalSessionsToday: 0,
          totalSessionsLast7Days: 0,
          staleActiveSessions: 0,
          platformAttendanceRate: 0,
          platformAbsenceRate: 0,
          healthyOrganizations: 0,
          warningOrganizations: 0,
          criticalOrganizations: 0,
        },
        organizations: [],
        departments: [],
        alerts: [],
      };

      await cacheService.set(cacheKey, emptyData, 300);
      return res.json({ success: true, data: emptyData, source: "computed" });
    }

    const orgIds = organizations.map((org: any) => org.organizationId);
    const orgNameMap = new Map<string, string>(
      organizations.map((org: any) => [org.organizationId, org.name || "Unknown Organization"])
    );
    const orgCodeMap = new Map<string, string>(
      organizations.map((org: any) => [org.organizationId, org.code || "-"])
    );

    const [memberCountsAgg, adminCountsAgg, allOrgSessions, activeMemberEntries] = await Promise.all([
      User.aggregate([
        { $match: { organizationIds: { $in: orgIds } } },
        { $unwind: "$organizationIds" },
        { $match: { organizationIds: { $in: orgIds } } },
        { $group: { _id: "$organizationIds", count: { $sum: 1 } } },
      ]),
      User.aggregate([
        { $unwind: "$userOrgRoles" },
        {
          $match: {
            "userOrgRoles.organizationId": { $in: orgIds },
            "userOrgRoles.role": "admin",
          },
        },
        { $group: { _id: "$userOrgRoles.organizationId", count: { $sum: 1 } } },
      ]),
      Session.find({
        organizationId: { $in: orgIds },
      })
        .select("sessionId organizationId createdBy memberCountAtStart createdAt endTime isActive")
        .lean(),
      Promise.all(
        orgIds.map(async (organizationId) => {
          const activeMembers = await getActiveMemberCount(organizationId, 7);
          return [organizationId, activeMembers] as const;
        })
      ),
    ]);

    const memberCountByOrg = new Map<string, number>(
      memberCountsAgg.map((item: any) => [String(item._id), Number(item.count || 0)])
    );
    const adminCountByOrg = new Map<string, number>(
      adminCountsAgg.map((item: any) => [String(item._id), Number(item.count || 0)])
    );
    const activeMembersByOrg = new Map<string, number>(activeMemberEntries);

    const sessionsLast30 = allOrgSessions.filter(
      (session: any) => new Date(session.createdAt) >= thirtyDaysAgo
    );

    const recentSessionIds = sessionsLast30.map((session: any) => String(session.sessionId));

    const [attendanceAgg, absenceAgg, creatorDocs, deptMemberAgg] = await Promise.all([
      recentSessionIds.length
        ? Attendance.aggregate([
            { $match: { sessionId: { $in: recentSessionIds } } },
            { $group: { _id: "$sessionId", count: { $sum: 1 } } },
          ])
        : Promise.resolve([]),
      recentSessionIds.length
        ? Absence.aggregate([
            {
              $match: {
                sessionId: { $in: recentSessionIds },
                markedManually: { $ne: true },
              },
            },
            { $group: { _id: "$sessionId", count: { $sum: 1 } } },
          ])
        : Promise.resolve([]),
      User.find({
        userId: {
          $in: Array.from(
            new Set(
              allOrgSessions
                .map((session: any) => String(session.createdBy || ""))
                .filter(Boolean)
            )
          ),
        },
      })
        .select("userId department")
        .lean(),
      User.aggregate([
        { $match: { organizationIds: { $in: orgIds } } },
        {
          $project: {
            organizationIds: 1,
            departmentName: {
              $let: {
                vars: {
                  dept: {
                    $trim: {
                      input: {
                        $ifNull: ["$department", ""],
                      },
                    },
                  },
                },
                in: {
                  $cond: [{ $eq: ["$$dept", ""] }, "Unassigned", "$$dept"],
                },
              },
            },
          },
        },
        { $unwind: "$organizationIds" },
        { $match: { organizationIds: { $in: orgIds } } },
        {
          $group: {
            _id: {
              organizationId: "$organizationIds",
              departmentName: "$departmentName",
            },
            memberCount: { $sum: 1 },
          },
        },
      ]),
    ]);

    const attendanceBySession = new Map<string, number>(
      attendanceAgg.map((item: any) => [String(item._id), Number(item.count || 0)])
    );
    const absenceBySession = new Map<string, number>(
      absenceAgg.map((item: any) => [String(item._id), Number(item.count || 0)])
    );
    const creatorDepartmentByUser = new Map<string, string>(
      creatorDocs.map((creator: any) => {
        const normalizedDepartment = String(creator.department || "").trim() || "Unassigned";
        return [String(creator.userId), normalizedDepartment];
      })
    );
    const departmentMemberMap = new Map<string, number>(
      deptMemberAgg.map((item: any) => [
        `${String(item._id.organizationId)}::${String(item._id.departmentName)}`,
        Number(item.memberCount || 0),
      ])
    );

    const sessionsByOrgAll = new Map<string, any[]>();
    const sessionsByOrgLast30 = new Map<string, any[]>();
    for (const session of allOrgSessions) {
      const organizationId = String(session.organizationId);
      const listAll = sessionsByOrgAll.get(organizationId) || [];
      listAll.push(session);
      sessionsByOrgAll.set(organizationId, listAll);
    }

    for (const session of sessionsLast30) {
      const organizationId = String(session.organizationId);
      const list30 = sessionsByOrgLast30.get(organizationId) || [];
      list30.push(session);
      sessionsByOrgLast30.set(organizationId, list30);
    }

    const toPercent = (value: number, total: number): number => {
      if (!total || total <= 0) return 0;
      return Math.round((value / total) * 100);
    };

    const isLiveSessionNow = (session: any): boolean => {
      const ended = new Date(session.endTime) < now;
      return Boolean(session.isActive) && !ended;
    };

    const departmentBuckets = new Map<
      string,
      { organizationId: string; departmentName: string; sessionsAll: any[]; sessionsLast30: any[] }
    >();

    for (const session of allOrgSessions) {
      const organizationId = String(session.organizationId);
      const departmentName =
        creatorDepartmentByUser.get(String(session.createdBy || "")) || "Unassigned";
      const key = `${organizationId}::${departmentName}`;
      const bucket = departmentBuckets.get(key) || {
        organizationId,
        departmentName,
        sessionsAll: [],
        sessionsLast30: [],
      };

      bucket.sessionsAll.push(session);
      if (new Date(session.createdAt) >= thirtyDaysAgo) {
        bucket.sessionsLast30.push(session);
      }

      departmentBuckets.set(key, bucket);
    }

    const orgActiveDepartmentsNowMap = new Map<string, number>();
    for (const bucket of departmentBuckets.values()) {
      if (bucket.sessionsAll.some((session) => isLiveSessionNow(session))) {
        const current = orgActiveDepartmentsNowMap.get(bucket.organizationId) || 0;
        orgActiveDepartmentsNowMap.set(bucket.organizationId, current + 1);
      }
    }

    const orgSlicesRaw: PlatformOrgSlice[] = organizations.map((org: any) => {
      const organizationId = String(org.organizationId);
      const orgSessionsAll = sessionsByOrgAll.get(organizationId) || [];
      const orgSessionsLast30 = sessionsByOrgLast30.get(organizationId) || [];
      const memberCount = memberCountByOrg.get(organizationId) || 0;
      const adminCount = adminCountByOrg.get(organizationId) || 0;
      const activeMembers = activeMembersByOrg.get(organizationId) || 0;
      const totalSessionsHosted = orgSessionsAll.length;
      const liveSessionsNow = orgSessionsAll.filter((session: any) => isLiveSessionNow(session)).length;
      const endedSessions = Math.max(totalSessionsHosted - liveSessionsNow, 0);
      const activeDepartmentsNow = orgActiveDepartmentsNowMap.get(organizationId) || 0;

      const sessionsToday = orgSessionsAll.filter(
        (session: any) => new Date(session.createdAt) >= startOfToday
      ).length;
      const sessionsLast7Days = orgSessionsAll.filter(
        (session: any) => new Date(session.createdAt) >= sevenDaysAgo
      ).length;
      const staleActiveSessions = orgSessionsAll.filter(
        (session: any) => Boolean(session.isActive) && new Date(session.endTime) < now
      ).length;

      const expectedAttendance = orgSessionsLast30.reduce((sum: number, session: any) => {
        const baseline =
          typeof session.memberCountAtStart === "number" && session.memberCountAtStart > 0
            ? Number(session.memberCountAtStart)
            : memberCount;
        return sum + baseline;
      }, 0);

      const attendanceCount = orgSessionsLast30.reduce(
        (sum: number, session: any) => sum + (attendanceBySession.get(String(session.sessionId)) || 0),
        0
      );
      const absenceCount = orgSessionsLast30.reduce(
        (sum: number, session: any) => sum + (absenceBySession.get(String(session.sessionId)) || 0),
        0
      );

      const attendanceRate = toPercent(attendanceCount, expectedAttendance);
      const absenceRate = toPercent(absenceCount, expectedAttendance);
      const activePercentage = toPercent(activeMembers, memberCount);

      let status: PlatformOrgSlice["status"] = "healthy";
      if (staleActiveSessions > 0 || sessionsLast7Days === 0 || adminCount === 0) {
        status = "critical";
      } else if (attendanceRate < 60 || activePercentage < 50) {
        status = "warning";
      }

      return {
        organizationId,
        organizationName: orgNameMap.get(organizationId) || "Unknown Organization",
        organizationCode: orgCodeMap.get(organizationId) || "-",
        memberCount,
        adminCount,
        activeMembers,
        activePercentage,
        totalSessionsHosted,
        liveSessionsNow,
        endedSessions,
        activeDepartmentsNow,
        sessionsToday,
        sessionsLast7Days,
        sessionsLast30Days: orgSessionsLast30.length,
        attendanceRate,
        absenceRate,
        staleActiveSessions,
        status,
      };
    });

    const visibleOrgSlices: PlatformOrgSlice[] = [];
    let maskedOrganizations = 0;
    const maskedOrgAccumulator: PlatformOrgSlice = {
      organizationId: "masked",
      organizationName: "Insufficient data",
      organizationCode: "-",
      memberCount: 0,
      adminCount: 0,
      activeMembers: 0,
      activePercentage: 0,
      totalSessionsHosted: 0,
      liveSessionsNow: 0,
      endedSessions: 0,
      activeDepartmentsNow: 0,
      sessionsToday: 0,
      sessionsLast7Days: 0,
      sessionsLast30Days: 0,
      attendanceRate: 0,
      absenceRate: 0,
      staleActiveSessions: 0,
      status: "masked",
      isMasked: true,
      organizationsGrouped: 0,
    };

    for (const orgSlice of orgSlicesRaw) {
      if (orgSlice.memberCount < privacyThreshold) {
        maskedOrganizations += 1;
        maskedOrgAccumulator.organizationsGrouped = (maskedOrgAccumulator.organizationsGrouped || 0) + 1;
        maskedOrgAccumulator.memberCount += orgSlice.memberCount;
        maskedOrgAccumulator.adminCount += orgSlice.adminCount;
        maskedOrgAccumulator.activeMembers += orgSlice.activeMembers;
        maskedOrgAccumulator.totalSessionsHosted += orgSlice.totalSessionsHosted;
        maskedOrgAccumulator.liveSessionsNow += orgSlice.liveSessionsNow;
        maskedOrgAccumulator.endedSessions += orgSlice.endedSessions;
        maskedOrgAccumulator.activeDepartmentsNow += orgSlice.activeDepartmentsNow;
        maskedOrgAccumulator.sessionsToday += orgSlice.sessionsToday;
        maskedOrgAccumulator.sessionsLast7Days += orgSlice.sessionsLast7Days;
        maskedOrgAccumulator.sessionsLast30Days += orgSlice.sessionsLast30Days;
        maskedOrgAccumulator.staleActiveSessions += orgSlice.staleActiveSessions;
      } else {
        visibleOrgSlices.push(orgSlice);
      }
    }

    if ((maskedOrgAccumulator.organizationsGrouped || 0) > 0) {
      maskedOrgAccumulator.activePercentage = toPercent(
        maskedOrgAccumulator.activeMembers,
        maskedOrgAccumulator.memberCount
      );
      visibleOrgSlices.push(maskedOrgAccumulator);
    }

    visibleOrgSlices.sort((a, b) => b.sessionsLast7Days - a.sessionsLast7Days);

    const departmentSlicesRaw: PlatformDepartmentSlice[] = [];
    const visibleDepartmentSlices: PlatformDepartmentSlice[] = [];
    const maskedDepartmentAccumulator: PlatformDepartmentSlice = {
      organizationId: "masked",
      organizationName: "Insufficient data",
      departmentName: "Insufficient data",
      memberCount: 0,
      totalSessionsHosted: 0,
      liveSessionsNow: 0,
      endedSessions: 0,
      sessionsLast7Days: 0,
      sessionsLast30Days: 0,
      attendanceRate: 0,
      absenceRate: 0,
      trendQuality: "masked",
      isMasked: true,
      departmentsGrouped: 0,
    };

    for (const [key, bucket] of departmentBuckets.entries()) {
      const departmentMemberCount = departmentMemberMap.get(key) || 0;
      const organizationId = bucket.organizationId;
      const orgMemberCount = memberCountByOrg.get(organizationId) || 0;
      const totalSessionsHosted = bucket.sessionsAll.length;
      const liveSessionsNow = bucket.sessionsAll.filter((session) => isLiveSessionNow(session)).length;
      const endedSessions = Math.max(totalSessionsHosted - liveSessionsNow, 0);

      const expectedAttendance = bucket.sessionsLast30.reduce((sum, session: any) => {
        const baseline =
          typeof session.memberCountAtStart === "number" && session.memberCountAtStart > 0
            ? Number(session.memberCountAtStart)
            : departmentMemberCount || orgMemberCount;
        return sum + baseline;
      }, 0);

      const attendanceCount = bucket.sessionsLast30.reduce(
        (sum, session: any) => sum + (attendanceBySession.get(String(session.sessionId)) || 0),
        0
      );
      const absenceCount = bucket.sessionsLast30.reduce(
        (sum, session: any) => sum + (absenceBySession.get(String(session.sessionId)) || 0),
        0
      );

      const sessionsLast7Days = bucket.sessionsAll.filter(
        (session: any) => new Date(session.createdAt) >= sevenDaysAgo
      ).length;
      const attendanceRate = toPercent(attendanceCount, expectedAttendance);
      const absenceRate = toPercent(absenceCount, expectedAttendance);

      let trendQuality: PlatformDepartmentSlice["trendQuality"] = "stable";
      if (attendanceRate < 60 || (liveSessionsNow === 0 && sessionsLast7Days === 0)) {
        trendQuality = "needs_attention";
      } else if (attendanceRate < 75 || sessionsLast7Days < 3 || liveSessionsNow === 0) {
        trendQuality = "monitoring";
      }

      const slice: PlatformDepartmentSlice = {
        organizationId,
        organizationName: orgNameMap.get(organizationId) || "Unknown Organization",
        departmentName: bucket.departmentName,
        memberCount: departmentMemberCount,
        totalSessionsHosted,
        liveSessionsNow,
        endedSessions,
        sessionsLast7Days,
        sessionsLast30Days: bucket.sessionsLast30.length,
        attendanceRate,
        absenceRate,
        trendQuality,
      };

      departmentSlicesRaw.push(slice);

      if (slice.memberCount < privacyThreshold) {
        maskedDepartmentAccumulator.departmentsGrouped =
          (maskedDepartmentAccumulator.departmentsGrouped || 0) + 1;
        maskedDepartmentAccumulator.memberCount += slice.memberCount;
        maskedDepartmentAccumulator.totalSessionsHosted += slice.totalSessionsHosted;
        maskedDepartmentAccumulator.liveSessionsNow += slice.liveSessionsNow;
        maskedDepartmentAccumulator.endedSessions += slice.endedSessions;
        maskedDepartmentAccumulator.sessionsLast7Days += slice.sessionsLast7Days;
        maskedDepartmentAccumulator.sessionsLast30Days += slice.sessionsLast30Days;
      } else {
        visibleDepartmentSlices.push(slice);
      }
    }

    if ((maskedDepartmentAccumulator.departmentsGrouped || 0) > 0) {
      visibleDepartmentSlices.push(maskedDepartmentAccumulator);
    }

    visibleDepartmentSlices.sort((a, b) => {
      if (b.liveSessionsNow !== a.liveSessionsNow) return b.liveSessionsNow - a.liveSessionsNow;
      return b.totalSessionsHosted - a.totalSessionsHosted;
    });

    const alerts: PlatformAlert[] = [];
    for (const orgSlice of orgSlicesRaw) {
      const masked = orgSlice.memberCount < privacyThreshold;
      const alertOrgContext = masked
        ? {}
        : {
            organizationId: orgSlice.organizationId,
            organizationName: orgSlice.organizationName,
          };

      if (orgSlice.staleActiveSessions > 0) {
        alerts.push({
          severity: "critical",
          type: "stale_sessions",
          ...alertOrgContext,
          message: `${masked ? "One or more masked organizations" : orgSlice.organizationName} has ${orgSlice.staleActiveSessions} stale active sessions.`,
        });
      }
      if (orgSlice.sessionsLast7Days === 0) {
        alerts.push({
          severity: "warning",
          type: "low_activity",
          ...alertOrgContext,
          message: `${masked ? "One or more masked organizations" : orgSlice.organizationName} has no sessions in the last 7 days.`,
        });
      }
      if (orgSlice.attendanceRate < 60 && orgSlice.sessionsLast30Days > 0) {
        alerts.push({
          severity: "warning",
          type: "low_attendance",
          ...alertOrgContext,
          message: `${masked ? "One or more masked organizations" : orgSlice.organizationName} has low attendance completion (${orgSlice.attendanceRate}%).`,
        });
      }
    }

    const totalExpectedAttendance = orgSlicesRaw.reduce((sum, orgSlice) => {
      return sum + Math.max(orgSlice.memberCount * orgSlice.sessionsLast30Days, 0);
    }, 0);
    const totalAttendanceApprox = orgSlicesRaw.reduce((sum, orgSlice) => {
      return sum + Math.round((orgSlice.attendanceRate / 100) * orgSlice.memberCount * orgSlice.sessionsLast30Days);
    }, 0);
    const totalAbsenceApprox = orgSlicesRaw.reduce((sum, orgSlice) => {
      return sum + Math.round((orgSlice.absenceRate / 100) * orgSlice.memberCount * orgSlice.sessionsLast30Days);
    }, 0);

    const data: PlatformOverviewResponse = {
      generatedAt: now.toISOString(),
      privacyThreshold,
      summary: {
        totalOrganizations: organizations.length,
        visibleOrganizations: visibleOrgSlices.filter((slice) => !slice.isMasked).length,
        maskedOrganizations,
        totalMembers: orgSlicesRaw.reduce((sum, orgSlice) => sum + orgSlice.memberCount, 0),
        activeMembers: orgSlicesRaw.reduce((sum, orgSlice) => sum + orgSlice.activeMembers, 0),
        totalSessionsHosted: orgSlicesRaw.reduce((sum, orgSlice) => sum + orgSlice.totalSessionsHosted, 0),
        liveSessionsNow: orgSlicesRaw.reduce((sum, orgSlice) => sum + orgSlice.liveSessionsNow, 0),
        endedSessions: orgSlicesRaw.reduce((sum, orgSlice) => sum + orgSlice.endedSessions, 0),
        totalDepartments: deptMemberAgg.length,
        activeDepartmentsNow: departmentSlicesRaw.filter((slice) => slice.liveSessionsNow > 0).length,
        departmentsWithSessions: departmentSlicesRaw.length,
        totalSessionsToday: orgSlicesRaw.reduce((sum, orgSlice) => sum + orgSlice.sessionsToday, 0),
        totalSessionsLast7Days: orgSlicesRaw.reduce((sum, orgSlice) => sum + orgSlice.sessionsLast7Days, 0),
        staleActiveSessions: orgSlicesRaw.reduce((sum, orgSlice) => sum + orgSlice.staleActiveSessions, 0),
        platformAttendanceRate: toPercent(totalAttendanceApprox, totalExpectedAttendance),
        platformAbsenceRate: toPercent(totalAbsenceApprox, totalExpectedAttendance),
        healthyOrganizations: orgSlicesRaw.filter((orgSlice) => orgSlice.status === "healthy").length,
        warningOrganizations: orgSlicesRaw.filter((orgSlice) => orgSlice.status === "warning").length,
        criticalOrganizations: orgSlicesRaw.filter((orgSlice) => orgSlice.status === "critical").length,
      },
      organizations: visibleOrgSlices,
      departments: visibleDepartmentSlices,
      alerts,
    };

    await cacheService.set(cacheKey, data, 300);

    return res.json({
      success: true,
      data,
      source: "computed",
    });
  } catch (error) {
    logger.error("Error fetching platform owner overview:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch platform owner overview",
    });
  }
};
