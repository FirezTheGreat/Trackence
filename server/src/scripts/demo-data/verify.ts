/**
 * Runs the real dashboard controllers in-process (same queries the UI hits) for the owner's
 * account and prints what each demo class's Analytics page will show. No HTTP, no tokens.
 * Redis is deliberately not initialised for cacheService, so results are computed, not cached.
 */
import type { Request, Response } from "express";

type OwnerContext = {
    userId: string;
    platformRole: "user" | "platform_owner";
    organizationIds: string[];
    userOrgRoles: Array<{ organizationId: string; role: string }>;
    currentOrganizationId: string | null;
};

type Handler = (req: Request, res: Response) => Promise<unknown>;

const invoke = async (handler: Handler, user: OwnerContext, orgId?: string): Promise<{ status: number; body: any }> => {
    let status = 200;
    let body: any = null;
    const req = { query: orgId ? { orgId } : {}, user: { ...user, role: "admin" } } as unknown as Request;
    const res = {
        status(code: number) {
            status = code;
            return this;
        },
        json(payload: unknown) {
            body = payload;
            return this;
        },
    } as unknown as Response;
    await handler(req, res);
    return { status, body };
};

export const verifyDashboards = async (user: OwnerContext, organizations: Array<{ organizationId: string; name: string }>) => {
    const dashboard = await import("../../controllers/dashboard.controller");
    const problems: string[] = [];

    console.log("\n[verify] Dashboard endpoints as the owner (computed in-process):");
    for (const org of organizations) {
        const [metrics, enhanced, health, stats] = await Promise.all([
            invoke(dashboard.getDashboardMetrics, user, org.organizationId),
            invoke(dashboard.getEnhancedAnalytics, user, org.organizationId),
            invoke(dashboard.getOrganizationHealth, user, org.organizationId),
            invoke(dashboard.getDashboardStats, user, org.organizationId),
        ]);
        for (const [name, result] of Object.entries({ metrics, enhanced, health, stats })) {
            if (result.status !== 200 || result.body?.success !== true) problems.push(`${org.name}: /${name} returned ${result.status}`);
        }

        const m = metrics.body?.metrics || {};
        const e = enhanced.body?.data || {};
        const h = health.body?.health || {};
        const trendDays = (m.attendanceTrend || []).filter((point: any) => point.value > 0).length;
        console.log(`\n   ${org.name}`);
        console.log(`     members ${e.summary?.totalMembers}  active(7d) ${e.summary?.activeMembers}  sessions ${e.summary?.totalSessions} (this week ${e.weeklyComparison?.sessions?.current}, last week ${e.weeklyComparison?.sessions?.previous})`);
        console.log(`     attendance rate ${e.attendanceBreakdown?.rate}%  avg (30d) ${m.avgAttendance}%  attended ${e.attendanceBreakdown?.attended}  absent ${e.attendanceBreakdown?.absent}  excused ${e.attendanceBreakdown?.excused}`);
        console.log(`     today: sessions ${m.sessionsToday}, absences ${m.totalAbsences}, peak ${e.summary?.peakHour}  | trend days with sessions (30d): ${trendDays}`);
        console.log(`     health ${h.status} (${h.score})${h.alerts?.length ? ` alerts: ${h.alerts.join(", ")}` : ""}  | action items: ${(m.actionItems || []).map((a: any) => a.title).join("; ") || "none"}`);
        console.log(`     stats: totalUsers ${stats.body?.stats?.totalUsers}, totalAbsences ${stats.body?.stats?.totalAbsences}`);

        if (!e.summary?.totalSessions) problems.push(`${org.name}: no sessions visible`);
        if (!trendDays) problems.push(`${org.name}: 30-day trend is empty`);
    }

    if (user.platformRole === "platform_owner") {
        const overview = await invoke(dashboard.getPlatformOwnerOverview, user);
        const data = overview.body?.data || {};
        console.log(`\n   Platform insights: status ${overview.status}, organizations ${data.summary?.totalOrganizations ?? "?"}, sessions (7d) ${data.summary?.totalSessionsLast7Days ?? "?"}`);
        if (overview.status !== 200) problems.push(`platform overview returned ${overview.status}`);
    }

    return problems;
};
