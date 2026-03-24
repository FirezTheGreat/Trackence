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
