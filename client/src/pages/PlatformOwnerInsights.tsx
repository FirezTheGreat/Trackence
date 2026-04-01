import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  Clock3,
  Layers3,
  RefreshCw,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import useAppSeo from "../hooks/useAppSeo";
import { APP_NAME } from "../config/app";
import { platformInsightsAPI } from "../services/platform-insights.service";
import type { PlatformOverview } from "../types/platformInsights.types";

const statCardClass =
  "backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl p-4 sm:p-5 shadow-lg shadow-black/10";

const toCount = (value: number | undefined | null) => Number.isFinite(value) ? Number(value) : 0;
const toPercent = (value: number, total: number) => {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
};

const PlatformOwnerInsights = () => {
  useAppSeo({
    title: `${APP_NAME} | Platform Insights`,
    description: `Monitor aggregate organization and department session performance across ${APP_NAME}.`,
    path: "/admin/platform-insights",
    isPrivate: true,
  });

  const [data, setData] = useState<PlatformOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await platformInsightsAPI.getOverview();
      setData(response.data);
      setError(null);
    } catch (overviewError) {
      const message =
        overviewError instanceof Error ? overviewError.message : "Failed to load platform insights.";
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview(false);
  }, [loadOverview]);

  const summaryCards = useMemo(() => {
    if (!data) return [];

    return [
      {
        key: "sessions-hosted",
        title: "Total Sessions Hosted",
        value: toCount(data.summary.totalSessionsHosted),
        helper: "All organizations, all time",
        icon: Layers3,
        accent: "text-cyan-300",
      },
      {
        key: "sessions-live",
        title: "Live Sessions Now",
        value: toCount(data.summary.liveSessionsNow),
        helper: "Currently active and valid",
        icon: Wifi,
        accent: "text-emerald-300",
      },
      {
        key: "sessions-ended",
        title: "Ended Sessions",
        value: toCount(data.summary.endedSessions),
        helper: "Completed or expired",
        icon: Clock3,
        accent: "text-orange-300",
      },
      {
        key: "departments-total",
        title: "Total Departments",
        value: toCount(data.summary.totalDepartments),
        helper: "Detected from org members",
        icon: Building2,
        accent: "text-violet-300",
      },
      {
        key: "departments-active",
        title: "Active Departments Now",
        value: toCount(data.summary.activeDepartmentsNow),
        helper: "At least one live session",
        icon: Activity,
        accent: "text-amber-300",
      },
      {
        key: "organizations-total",
        title: "Organizations",
        value: toCount(data.summary.totalOrganizations),
        helper: `Visible ${toCount(data.summary.visibleOrganizations)} | Masked ${toCount(data.summary.maskedOrganizations)}`,
        icon: ShieldCheck,
        accent: "text-slate-300",
      },
    ];
  }, [data]);

  const sessionMix = useMemo(() => {
    if (!data) {
      return {
        liveCount: 0,
        endedCount: 0,
        livePercent: 0,
        endedPercent: 0,
      };
    }

    const liveCount = toCount(data.summary.liveSessionsNow);
    const endedCount = toCount(data.summary.endedSessions);
    const totalCount = liveCount + endedCount;

    return {
      liveCount,
      endedCount,
      livePercent: toPercent(liveCount, totalCount),
      endedPercent: toPercent(endedCount, totalCount),
    };
  }, [data]);

  if (loading) {
    return (
      <div className="px-3 sm:px-6 md:px-16 pt-8 md:pt-10 pb-16">
        <div className="animate-pulse rounded-2xl bg-white/5 h-28 mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="animate-pulse rounded-2xl bg-white/5 h-28" />
          ))}
        </div>
        <div className="animate-pulse rounded-2xl bg-white/5 h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-3 sm:px-6 md:px-16 pt-8 md:pt-10 pb-16">
        <div className="max-w-xl mx-auto rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <p className="text-red-200 font-semibold mb-2">Unable to load platform insights</p>
          <p className="text-white/70 text-sm mb-5">{error}</p>
          <button
            onClick={() => void loadOverview(false)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/20 text-white hover:bg-white/10 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="px-3 sm:px-6 md:px-16 pt-8 md:pt-10 pb-16 flex flex-col gap-6 md:gap-8 animate-fade-in-up">
      <header className="backdrop-blur-2xl rounded-2xl p-4 sm:p-6 bg-secondary/45 border border-white/10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white font-satoshi tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-accent" />
            Platform Session Command Center
          </h1>
          <p className="text-white/55 text-sm mt-1 font-inter">
            General platform session health, live operations, and department activity at a glance.
          </p>
          <p className="text-white/45 text-xs mt-2 font-outfit">
            Privacy mode active: slices below {data.privacyThreshold} members are grouped as Insufficient data.
          </p>
        </div>
        <button
          onClick={() => void loadOverview(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/20 text-white/80 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </header>

      <section>
        <h2 className="text-white font-satoshi font-bold text-xl sm:text-2xl mb-3">General Session Overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <article key={card.key} className={statCardClass}>
                <div className="flex items-center justify-between">
                  <p className="text-white/55 text-xs uppercase tracking-[0.12em] font-outfit">{card.title}</p>
                  <Icon className={`w-4 h-4 ${card.accent}`} />
                </div>
                <p className="text-white text-3xl sm:text-4xl mt-2 font-geist-mono font-semibold tracking-tight">
                  {card.value}
                </p>
                <p className="text-white/55 text-xs mt-2 font-inter">{card.helper}</p>
              </article>
            );
          })}
          <article className={statCardClass}>
            <p className="text-white/55 text-xs uppercase tracking-[0.12em] font-outfit">Attendance Quality</p>
            <p className="text-white text-3xl sm:text-4xl mt-2 font-geist-mono font-semibold tracking-tight">
              {toCount(data.summary.platformAttendanceRate)}%
            </p>
            <p className="text-white/55 text-xs mt-2 font-inter">Absence rate {toCount(data.summary.platformAbsenceRate)}% | Stale sessions {toCount(data.summary.staleActiveSessions)}</p>
          </article>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4 md:gap-5">
        <article className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl p-5 sm:p-6 shadow-lg shadow-black/10">
          <h2 className="text-white font-satoshi font-bold text-xl mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-300" />
            Session Mix
          </h2>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-xs text-white/65 mb-1.5 font-outfit">
                <span>Live Sessions</span>
                <span>{sessionMix.liveCount} ({sessionMix.livePercent}%)</span>
              </div>
              <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-linear-to-r from-emerald-500 to-cyan-400" style={{ width: `${sessionMix.livePercent}%` }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs text-white/65 mb-1.5 font-outfit">
                <span>Ended Sessions</span>
                <span>{sessionMix.endedCount} ({sessionMix.endedPercent}%)</span>
              </div>
              <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-linear-to-r from-orange-500 to-amber-400" style={{ width: `${sessionMix.endedPercent}%` }} />
              </div>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-white/50 text-[11px] font-outfit uppercase tracking-[0.12em]">7d Sessions</p>
              <p className="text-white text-lg font-geist-mono mt-1">{toCount(data.summary.totalSessionsLast7Days)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-white/50 text-[11px] font-outfit uppercase tracking-[0.12em]">Today</p>
              <p className="text-white text-lg font-geist-mono mt-1">{toCount(data.summary.totalSessionsToday)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-white/50 text-[11px] font-outfit uppercase tracking-[0.12em]">Members</p>
              <p className="text-white text-lg font-geist-mono mt-1">{toCount(data.summary.totalMembers)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-white/50 text-[11px] font-outfit uppercase tracking-[0.12em]">Active</p>
              <p className="text-white text-lg font-geist-mono mt-1">{toCount(data.summary.activeMembers)}</p>
            </div>
          </div>
        </article>

        <article className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl p-5 sm:p-6 shadow-lg shadow-black/10">
          <h2 className="text-white font-satoshi font-bold text-xl mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-300" />
            Organization Health
          </h2>
          <div className="grid grid-cols-1 gap-3">
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3">
              <p className="text-emerald-200 text-xs uppercase tracking-widest font-outfit">Healthy</p>
              <p className="text-white text-2xl font-geist-mono mt-1">{toCount(data.summary.healthyOrganizations)}</p>
            </div>
            <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3">
              <p className="text-amber-200 text-xs uppercase tracking-widest font-outfit">Warning</p>
              <p className="text-white text-2xl font-geist-mono mt-1">{toCount(data.summary.warningOrganizations)}</p>
            </div>
            <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3">
              <p className="text-red-200 text-xs uppercase tracking-widest font-outfit">Critical</p>
              <p className="text-white text-2xl font-geist-mono mt-1">{toCount(data.summary.criticalOrganizations)}</p>
            </div>
          </div>
        </article>
      </section>

      <section className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl p-5 sm:p-6 shadow-lg shadow-black/10">
        <h2 className="text-white font-satoshi font-bold text-xl mb-4 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-300" />
          Operational Alerts
        </h2>
        {data.alerts.length === 0 ? (
          <p className="text-white/60 text-sm font-inter">No active alerts right now.</p>
        ) : (
          <div className="space-y-3">
            {data.alerts.slice(0, 10).map((alert, index) => (
              <div
                key={`${alert.type}-${index}`}
                className={`rounded-xl border px-3 py-2 text-sm font-inter ${
                  alert.severity === "critical"
                    ? "border-red-400/30 bg-red-500/10 text-red-200"
                    : "border-amber-400/30 bg-amber-500/10 text-amber-200"
                }`}
              >
                {alert.message}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default PlatformOwnerInsights;
