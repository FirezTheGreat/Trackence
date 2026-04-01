import React, { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Users,
  Calendar,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  RefreshCw,
  Loader,
  Clock,
  Activity,
  Zap,
  BarChart3,
  PieChart as PieChartIcon,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Timer,
  UserCheck,
  Radio,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useAuthStore } from "../../stores/auth.store";
import { useDashboardStore } from "../../stores/dashboard.store";
import type { EnhancedData, HealthData } from "../../types/analytics.types";
import StatCard from "./StatCard";
import CustomTooltip from "./CustomTooltip";
import ActionItem from "./ActionItem";
import HealthGauge from "./HealthGauge";
import AnimatedCounter from "./AnimatedCounter";
import useAppSeo from "../../hooks/useAppSeo";
import { APP_NAME } from "../../config/app";

export const Analytics: React.FC = () => {
  useAppSeo({
    title: `${APP_NAME} | Attendance Analytics`,
    description: `Analyze attendance trends, session performance, and member engagement with ${APP_NAME} analytics.`,
    path: "/admin/analytics",
    isPrivate: true,
  });

  const { user } = useAuthStore();
  const { metrics, loading, fetchMetrics, error } = useDashboardStore();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [enhanced, setEnhanced] = useState<EnhancedData | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loadingExtra, setLoadingExtra] = useState(true);
  const fetchRequestIdRef = useRef(0);
  const disableChartAnimation =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const orgId = user?.currentOrganizationId || user?.organizationIds?.[0] || "";

  const fetchAll = useCallback(async (targetOrgId: string) => {
    if (!targetOrgId) {
      setEnhanced(null);
      setHealth(null);
      setLoadingExtra(false);
      return;
    }

    const requestId = ++fetchRequestIdRef.current;
    setLoadingExtra(true);
    try {
      const [enhancedRes, healthRes] = await Promise.all([
        fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/admin/dashboard/enhanced?orgId=${encodeURIComponent(targetOrgId)}`,
          { credentials: "include" }
        ),
        fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/admin/dashboard/health?orgId=${encodeURIComponent(targetOrgId)}`,
          { credentials: "include" }
        ),
      ]);
      if (requestId !== fetchRequestIdRef.current) return;

      if (enhancedRes.ok) {
        const eData = await enhancedRes.json();
        if (eData.success) setEnhanced(eData.data);
      }
      if (healthRes.ok) {
        const hData = await healthRes.json();
        if (hData.success) setHealth(hData.health);
      }
    } catch (err) {
      console.error("Failed to fetch enhanced analytics:", err);
    } finally {
      if (requestId === fetchRequestIdRef.current) {
        setLoadingExtra(false);
      }
    }
  }, []);

  useEffect(() => {
    if (orgId) {
      setEnhanced(null);
      setHealth(null);
      fetchMetrics(orgId);
      fetchAll(orgId);
    }
  }, [orgId, fetchMetrics, fetchAll]);

  const handleRefresh = async () => {
    if (!orgId) return;
    setIsRefreshing(true);
    await Promise.all([fetchMetrics(orgId), fetchAll(orgId)]);
    setIsRefreshing(false);
  };

  const isLoading = loading && !metrics;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-2 border-blue-500/20 mx-auto" />
            <Loader className="w-8 h-8 animate-spin text-blue-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <div>
            <p className="text-white font-medium">Loading Analytics</p>
            <p className="text-white/40 text-sm">Crunching the numbers...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <p className="text-white font-semibold mb-1">Failed to load analytics</p>
          <p className="text-white/50 text-sm mb-6">{error}</p>
          <button
            onClick={handleRefresh}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors text-sm"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-white font-semibold mb-2">No analytics data</p>
          <button
            onClick={handleRefresh}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-500 transition-colors text-sm"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  const donutData = enhanced
    ? [
        { name: "Attended", value: enhanced.attendanceBreakdown.attended, color: "#10B981" },
        { name: "Absent", value: enhanced.attendanceBreakdown.absent, color: "#EF4444" },
        { name: "Excused", value: enhanced.attendanceBreakdown.excused, color: "#F59E0B" },
      ].filter((d) => d.value > 0)
    : [];

  const DONUT_COLORS = ["#10B981", "#EF4444", "#F59E0B"];
  const filteredDistribution = metrics.sessionDistribution.filter((_, i) => i >= 6 && i <= 22);

  const dedupedTrendMap = new Map<string, number>();
  metrics.attendanceTrend.forEach((point) => {
    if (!point?.date) return;
    dedupedTrendMap.set(point.date, Number.isFinite(point.value) ? point.value : 0);
  });
  const dedupedTrend = Array.from(dedupedTrendMap.entries()).map(([date, value]) => ({ date, value }));

  const sparkAttendance = (enhanced?.sparklines?.attendance || []).map((d) => ({
    value: Number.isFinite(d.value) ? d.value : 0,
  }));
  const sparkFromTrend = dedupedTrend.slice(-7).map((d) => ({ value: d.value }));

  const safeNumber = (value: number | undefined | null) => (Number.isFinite(value) ? Number(value) : 0);
  const safeChange = (value: number | undefined | null) => (Number.isFinite(value) ? Number(value) : 0);

  const statTotalMember = safeNumber(enhanced?.summary.totalMembers ?? health?.organization?.memberCount ?? 0);
  const statActiveSessions = safeNumber(enhanced?.summary.activeSessions ?? 0);
  const statSessionsToday = safeNumber(metrics.sessionsToday ?? 0);
  const statAttendanceRate = safeNumber(enhanced?.attendanceBreakdown.rate ?? metrics.avgAttendance ?? 0);
  const statAbsencesToday = safeNumber(metrics.totalAbsences ?? 0);

  const sessionsChange = safeChange(enhanced?.weeklyComparison.sessions.change);
  const attendanceChange = safeChange(enhanced?.weeklyComparison.attendance.change);
  const absencesChange = safeChange(enhanced?.weeklyComparison.absences.change);

  const DeferredRenderSection: React.FC<{
    className?: string;
    minHeight: number;
    children: ReactNode;
  }> = ({ className, minHeight, children }) => {
    const [isVisible, setIsVisible] = useState(false);
    const sectionRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      if (isVisible) return;

      const target = sectionRef.current;
      if (!target) return;

      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setIsVisible(true);
            observer.disconnect();
          }
        },
        { root: null, rootMargin: "320px 0px", threshold: 0.01 }
      );

      observer.observe(target);

      return () => {
        observer.disconnect();
      };
    }, [isVisible]);

    return (
      <div ref={sectionRef} className={className}>
        {isVisible ? (
          children
        ) : (
          <div className="rounded-2xl bg-white/3" style={{ minHeight }} />
        )}
      </div>
    );
  };

  return (
    <div className="px-3 sm:px-6 md:px-16 pt-8 md:pt-10 flex flex-col gap-6 md:gap-8 pb-16 animate-fade-in-up">
      <header className="perf-section flex flex-col backdrop-blur-2xl rounded-2xl p-4 sm:p-6 bg-secondary/45 md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-bold text-white font-satoshi tracking-tight">Analytics</h1>
            {health?.organization?.name && (
              <span className="hidden sm:inline text-sm text-white/25 font-medium">- {health.organization.name}</span>
            )}
          </div>
          <p className="text-white/40 text-sm mt-1 flex items-center gap-2">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            {enhanced && enhanced.summary.activeSessions > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-medium">
                <Radio className="w-3 h-3 animate-pulse" />
                {enhanced.summary.activeSessions} live
              </span>
            )}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="group flex items-center cursor-pointer gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm text-white/60 hover:text-white bg-white/4 hover:bg-white/8 border border-white/10 hover:border-white/20 rounded-xl transition-all disabled:opacity-50 touch-manipulation"
        >
          <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform ${isRefreshing ? "animate-spin" : "group-hover:rotate-45"}`} />
          Refresh
        </button>
      </header>

      <section className="perf-section grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Total Members"
          value={statTotalMember}
          change={0}
          icon={<Users className="w-4 h-4 text-blue-400" />}
          iconBg="bg-blue-500/15"
          sparkData={sparkFromTrend}
          sparkColor="#3B82F6"
          sparkId="total-members"
          loading={loadingExtra}
          animateValue={!disableChartAnimation}
        />
        <StatCard
          title="Active Sessions"
          value={statActiveSessions}
          change={0}
          icon={<Activity className="w-4 h-4 text-emerald-400" />}
          iconBg="bg-emerald-500/15"
          sparkData={sparkFromTrend}
          sparkColor="#10B981"
          sparkId="active-sessions"
          loading={loadingExtra}
          animateValue={!disableChartAnimation}
        />
        <StatCard
          title="Sessions Today"
          value={statSessionsToday}
          change={sessionsChange}
          icon={<Calendar className="w-4 h-4 text-violet-400" />}
          iconBg="bg-violet-500/15"
          sparkData={sparkFromTrend}
          sparkColor="#8B5CF6"
          sparkId="sessions-today"
          loading={loadingExtra}
          animateValue={!disableChartAnimation}
        />
        <StatCard
          title="Attendance Rate"
          value={statAttendanceRate}
          suffix="%"
          change={attendanceChange}
          icon={<TrendingUp className="w-4 h-4 text-cyan-400" />}
          iconBg="bg-cyan-500/15"
          sparkData={sparkAttendance.length ? sparkAttendance : sparkFromTrend}
          sparkColor="#06B6D4"
          sparkId="attendance-rate"
          loading={loading || loadingExtra}
          animateValue={!disableChartAnimation}
        />
        <StatCard
          title="Absences Today"
          value={statAbsencesToday}
          change={-absencesChange}
          icon={<XCircle className="w-4 h-4 text-rose-400" />}
          iconBg="bg-rose-500/15"
          sparkData={sparkFromTrend}
          sparkColor="#F43F5E"
          sparkId="absences-today"
          loading={loading}
          animateValue={!disableChartAnimation}
        />
      </section>

      <DeferredRenderSection className="perf-section" minHeight={420}>
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl p-6 shadow-lg shadow-black/10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-400" />
                Daily Sessions
              </h3>
              <p className="text-xs text-white/35 mt-0.5">Sessions created per day - last 30 days</p>
            </div>
            {enhanced && (
              <div className="text-right">
                <p className="text-xs text-white/35">This Month</p>
                <p className="text-lg font-bold text-white tabular-nums">
                  {enhanced.summary.thisMonthSessions}
                  <span className="text-xs text-white/40 ml-1">sessions</span>
                </p>
              </div>
            )}
          </div>
          {loading ? (
            <div className="h-64 bg-white/3 rounded-xl animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={dedupedTrend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="date" stroke="rgba(255,255,255,0.15)" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(val) => {
                  const d = new Date(val);
                  return `${d.getDate()}/${d.getMonth() + 1}`;
                }} interval={4} />
                <YAxis domain={[0, "dataMax + 1"]} allowDecimals={false} stroke="rgba(255,255,255,0.15)" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip valueLabel="Sessions" />} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  fill="url(#trendGradient)"
                  dot={false}
                  activeDot={{ r: 5, fill: "#3B82F6", stroke: "#1e3a5f", strokeWidth: 2 }}
                  isAnimationActive={!disableChartAnimation}
                  animationDuration={disableChartAnimation ? 0 : 450}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
          </div>

          <div className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl p-6 shadow-lg shadow-black/10">
          <h3 className="text-base font-semibold text-white flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            Organization Health
          </h3>
          <p className="text-xs text-white/35 mb-4">Overall engagement score</p>

          <HealthGauge score={health?.score ?? 0} loading={loadingExtra} animate={!disableChartAnimation} />

          {health && !loadingExtra && (
            <div className="space-y-3 mt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/50">Active Members</span>
                <span className="text-white font-medium">{health.organization.activeMembers} / {health.organization.memberCount}</span>
              </div>
              <div className="w-full bg-white/6 rounded-full h-1.5">
                <div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-700" style={{ width: `${health.organization.activePercentage}%` }} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/50">Engagement</span>
                <span className="text-white font-medium">{health.organization.activePercentage}%</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/50">Admins</span>
                <span className="text-white font-medium">{health.organization.adminCount}</span>
              </div>
              {health.alerts.length > 0 && (
                <div className="pt-2 space-y-1.5">
                  {health.alerts.map((alert, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-amber-400/80 bg-amber-500/10 rounded-lg px-3 py-2">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      {alert}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          </div>
        </section>
      </DeferredRenderSection>

      <DeferredRenderSection className="perf-section" minHeight={380}>
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl p-6 shadow-lg shadow-black/10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-violet-400" />
                Session Distribution
              </h3>
              <p className="text-xs text-white/35 mt-0.5">Today's sessions by hour (6 AM - 10 PM)</p>
            </div>
            {enhanced && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/10 rounded-lg border border-violet-500/15">
                <Zap className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-xs text-violet-300 font-medium">Peak: {enhanced.summary.peakHour}</span>
              </div>
            )}
          </div>
          {loading ? (
            <div className="h-56 bg-white/3 rounded-xl animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={filteredDistribution} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.15)" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} tickLine={false} axisLine={false} interval={1} />
                <YAxis stroke="rgba(255,255,255,0.15)" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip valueLabel="Sessions" />} />
                <Bar
                  dataKey="value"
                  fill="url(#barGradient)"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={32}
                  isAnimationActive={!disableChartAnimation}
                  animationDuration={disableChartAnimation ? 0 : 450}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
          </div>

          <div className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl p-6 shadow-lg shadow-black/10">
          <h3 className="text-base font-semibold text-white flex items-center gap-2 mb-1">
            <PieChartIcon className="w-4 h-4 text-amber-400" />
            Attendance Breakdown
          </h3>
          <p className="text-xs text-white/35 mb-4">All-time participation</p>

          {loadingExtra ? (
            <div className="w-48 h-48 rounded-full bg-white/3 animate-pulse mx-auto" />
          ) : donutData.length > 0 ? (
            <>
              <div className="relative h-52.5">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                      strokeWidth={0}
                      isAnimationActive={!disableChartAnimation}
                      animationDuration={disableChartAnimation ? 0 : 450}
                    >
                      {donutData.map((entry, index) => (
                        <Cell key={entry.name} fill={DONUT_COLORS[index]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }} itemStyle={{ color: "#fff", fontSize: 13 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-white font-geist-sans">{enhanced?.attendanceBreakdown.rate ?? 0}%</span>
                  <span className="text-[10px] text-white/40">Rate</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 mt-1">
                {donutData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="text-xs text-white/50">{entry.name}</span>
                    <span className="text-xs font-semibold text-white/70">{entry.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-48 text-white/30 text-sm">No attendance data yet</div>
          )}
          </div>
        </section>
      </DeferredRenderSection>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl p-6 shadow-lg shadow-black/10">
          <h3 className="text-base font-semibold text-white flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Attendance Summary
          </h3>
          <p className="text-xs text-white/35 mb-5">All-time participation across all sessions</p>

          {loadingExtra ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-white/3 rounded-xl animate-pulse" />)}</div>
          ) : enhanced ? (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-500/8 border border-emerald-500/15 rounded-xl p-3.5 text-center">
                  <p className="text-2xl font-bold text-emerald-400 tabular-nums font-geist-sans"><AnimatedCounter value={enhanced.attendanceBreakdown.attended} animate={!disableChartAnimation} /></p>
                  <p className="text-[11px] text-white/40 mt-1 font-medium">Check-ins</p>
                </div>
                <div className="bg-red-500/8 border border-red-500/15 rounded-xl p-3.5 text-center">
                  <p className="text-2xl font-bold text-red-400 tabular-nums font-geist-sans"><AnimatedCounter value={enhanced.attendanceBreakdown.absent} animate={!disableChartAnimation} /></p>
                  <p className="text-[11px] text-white/40 mt-1 font-medium">Unexcused</p>
                </div>
                <div className="bg-amber-500/8 border border-amber-500/15 rounded-xl p-3.5 text-center">
                  <p className="text-2xl font-bold text-amber-400 tabular-nums font-geist-sans"><AnimatedCounter value={enhanced.attendanceBreakdown.excused} animate={!disableChartAnimation} /></p>
                  <p className="text-[11px] text-white/40 mt-1 font-medium">Excused</p>
                </div>
              </div>

              {(() => {
                const att = enhanced.attendanceBreakdown.attended;
                const abs = enhanced.attendanceBreakdown.absent;
                const exc = enhanced.attendanceBreakdown.excused;
                const total = att + abs + exc;
                if (total === 0) {
                  return <p className="text-white/30 text-sm text-center py-2">No participation data yet</p>;
                }
                const attPct = (att / total) * 100;
                const absPct = (abs / total) * 100;
                const excPct = (exc / total) * 100;
                return (
                  <div>
                    <div className="flex h-3 rounded-full overflow-hidden bg-white/5">
                      <div className="bg-emerald-500 transition-all duration-700" style={{ width: `${attPct}%` }} />
                      <div className="bg-red-500 transition-all duration-700" style={{ width: `${absPct}%` }} />
                      <div className="bg-amber-500 transition-all duration-700" style={{ width: `${excPct}%` }} />
                    </div>
                    <div className="flex items-center justify-between mt-2.5 text-xs">
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-white/40">{attPct.toFixed(1)}% attended</span></span>
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /><span className="text-white/40">{absPct.toFixed(1)}% absent</span></span>
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /><span className="text-white/40">{excPct.toFixed(1)}% excused</span></span>
                    </div>
                  </div>
                );
              })()}

              {enhanced.attendanceBreakdown.absent + enhanced.attendanceBreakdown.excused > 0 && (
                <div className="flex items-center gap-2 text-xs text-white/30 bg-white/3 rounded-lg px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-white/20" />
                  {enhanced.attendanceBreakdown.excused} of {enhanced.attendanceBreakdown.absent + enhanced.attendanceBreakdown.excused} total absences have been excused ({((enhanced.attendanceBreakdown.excused / (enhanced.attendanceBreakdown.absent + enhanced.attendanceBreakdown.excused)) * 100).toFixed(0)}%)
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-40 text-white/30 text-sm">No attendance data</div>
          )}
        </div>

        <div className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl p-6 shadow-lg shadow-black/10">
          <h3 className="text-base font-semibold text-white flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4 text-blue-400" />
            Session Insights
          </h3>
          <p className="text-xs text-white/35 mb-5">Key session &amp; member metrics</p>

          {loadingExtra ? (
            <div className="space-y-3">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-12 bg-white/3 rounded-xl animate-pulse" />)}</div>
          ) : enhanced ? (
            <div className="space-y-2.5">
              <div className="flex items-center gap-3 p-3 bg-white/3 hover:bg-white/5 rounded-xl border border-white/5 transition-colors">
                <Calendar className="w-4 h-4 text-violet-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-white/40 uppercase tracking-wider font-medium">Total Sessions</p>
                  <p className="text-sm font-semibold text-white tabular-nums">{enhanced.summary.totalSessions.toLocaleString()}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-white/3 hover:bg-white/5 rounded-xl border border-white/5 transition-colors">
                <TrendingUp className="w-4 h-4 text-cyan-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-white/40 uppercase tracking-wider font-medium">This Month</p>
                  <p className="text-sm font-semibold text-white tabular-nums">
                    {enhanced.summary.thisMonthSessions}
                    <span className="text-xs text-white/30 ml-2">
                      vs {enhanced.summary.lastMonthSessions} last month
                      {enhanced.summary.lastMonthSessions > 0 && (
                        <span className={`ml-1.5 ${enhanced.summary.monthlyChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          ({enhanced.summary.monthlyChange >= 0 ? "+" : ""}{enhanced.summary.monthlyChange}%)
                        </span>
                      )}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-white/3 hover:bg-white/5 rounded-xl border border-white/5 transition-colors">
                <Timer className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-white/40 uppercase tracking-wider font-medium">Avg Sessions / Day</p>
                  <p className="text-sm font-semibold text-white tabular-nums">{enhanced.summary.avgSessionsPerDay}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-white/3 hover:bg-white/5 rounded-xl border border-white/5 transition-colors">
                <Zap className="w-4 h-4 text-orange-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-white/40 uppercase tracking-wider font-medium">Peak Hour</p>
                  <p className="text-sm font-semibold text-white tabular-nums">{enhanced.summary.peakHour}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-white/3 hover:bg-white/5 rounded-xl border border-white/5 transition-colors">
                <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-white/40 uppercase tracking-wider font-medium">Active Members (7-Day)</p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white tabular-nums">{enhanced.summary.activeMembers} of {enhanced.summary.totalMembers}</p>
                    {enhanced.summary.totalMembers > 0 && (
                      <span className="text-[11px] text-white/25">({Math.round((enhanced.summary.activeMembers / enhanced.summary.totalMembers) * 100)}% engagement)</span>
                    )}
                  </div>
                </div>
              </div>

              {metrics.sessionsToday > 0 && (
                <div className="flex items-center gap-3 p-3 bg-blue-500/5 hover:bg-blue-500/8 rounded-xl border border-blue-500/10 transition-colors">
                  <Radio className="w-4 h-4 text-blue-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-blue-400/60 uppercase tracking-wider font-medium">Today</p>
                    <p className="text-sm font-semibold text-white tabular-nums">
                      {metrics.sessionsToday} session{metrics.sessionsToday !== 1 ? "s" : ""} created
                      {enhanced.summary.activeSessions > 0 && (
                        <span className="text-emerald-400 ml-2"> - {enhanced.summary.activeSessions} active now</span>
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-40 text-white/30 text-sm">No session data</div>
          )}
        </div>
      </section>

      {enhanced && (
        <section className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl p-6 shadow-lg shadow-black/10">
          <h3 className="text-base font-semibold text-white flex items-center gap-2 mb-5">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            Week over Week
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "Sessions", data: enhanced.weeklyComparison.sessions, icon: <Calendar className="w-4 h-4" />, invertChange: false },
              { label: "Attendance", data: enhanced.weeklyComparison.attendance, icon: <CheckCircle2 className="w-4 h-4" />, invertChange: false },
              { label: "Absences", data: enhanced.weeklyComparison.absences, icon: <XCircle className="w-4 h-4" />, invertChange: true },
            ].map((item) => {
              const changeVal = safeChange(item.data.change);
              const isPositive = item.invertChange ? changeVal <= 0 : changeVal >= 0;
              return (
                <div key={item.label} className="backdrop-blur-xl bg-secondary/40 border border-white/15 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-white/40 mb-3">
                    {item.icon}
                    <span className="text-xs font-medium uppercase tracking-wider">{item.label}</span>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-2xl font-bold text-white tabular-nums">{item.data.current}</p>
                      <p className="text-xs text-white/30 mt-0.5">vs {item.data.previous} last week</p>
                    </div>
                    <div className={`flex items-center gap-0.5 px-2 py-1 rounded-lg text-xs font-semibold ${isPositive ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                      {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {Math.abs(changeVal)}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {metrics.actionItems.length > 0 && (
        <section className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl p-6 shadow-lg shadow-black/10">
          <h3 className="text-base font-semibold text-white flex items-center gap-2 mb-4">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            Action Items
            <span className="ml-auto text-xs text-white/30 font-normal">
              {metrics.actionItems.length} item{metrics.actionItems.length > 1 ? "s" : ""}
            </span>
          </h3>
          <div className="space-y-2.5">
            {metrics.actionItems.map((item: any) => (
              <ActionItem key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default Analytics;

