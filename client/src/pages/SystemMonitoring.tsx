import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Cpu, Database, Gauge, HardDrive, RefreshCw, Server, Wifi } from "lucide-react";
import { adminMonitoringAPI } from "../services/admin-monitoring.service";
import type {
  SystemHealthResponse,
  SystemMetricsResponse,
} from "../services/admin-monitoring.service";

const formatBytes = (bytes?: number | null): string => {
  if (!Number.isFinite(bytes) || bytes === null || bytes === undefined || bytes < 0) return "N/A";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
};

const formatUptime = (uptimeSeconds?: number | null): string => {
  if (!Number.isFinite(uptimeSeconds) || uptimeSeconds === null || uptimeSeconds === undefined) return "N/A";
  const total = Math.max(0, Math.floor(uptimeSeconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  return `${hours}h ${minutes}m ${seconds}s`;
};

const formatMs = (value?: number | null): string => {
  if (!Number.isFinite(value) || value === null || value === undefined) return "N/A";
  return `${Number(value).toFixed(2)} ms`;
};

const formatPercent = (value?: number | null): string => {
  if (!Number.isFinite(value) || value === null || value === undefined) return "N/A";
  return `${Number(value).toFixed(2)}%`;
};

const formatTimestamp = (iso?: string, timestamp?: number): string => {
  if (iso) {
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString();
  }
  if (Number.isFinite(timestamp)) {
    return new Date(Number(timestamp)).toLocaleString();
  }
  return "N/A";
};

const scoreLatency = (p95Ms?: number): "good" | "warn" | "bad" => {
  if (!Number.isFinite(p95Ms)) return "warn";
  const latencyMs = Number(p95Ms);
  if (latencyMs <= 600) return "good";
  if (latencyMs <= 1500) return "warn";
  return "bad";
};

const scoreLoopLag = (lagMs?: number): "good" | "warn" | "bad" => {
  if (!Number.isFinite(lagMs)) return "warn";
  const loopLagMs = Number(lagMs);
  if (loopLagMs <= 20) return "good";
  if (loopLagMs <= 50) return "warn";
  return "bad";
};

const statusBadgeClass = (status: "good" | "warn" | "bad") => {
  if (status === "good") return "bg-emerald-500/20 text-emerald-300 border-emerald-500/35";
  if (status === "warn") return "bg-amber-500/20 text-amber-300 border-amber-500/35";
  return "bg-red-500/20 text-red-300 border-red-500/35";
};

const metricValueClass = (status: "good" | "warn" | "bad") => {
  if (status === "good") return "text-emerald-300";
  if (status === "warn") return "text-amber-300";
  return "text-red-300";
};

const SystemMonitoring = () => {
  const [health, setHealth] = useState<SystemHealthResponse | null>(null);
  const [metrics, setMetrics] = useState<SystemMetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const loadData = useCallback(async (backgroundRefresh = false) => {
    try {
      if (!backgroundRefresh) setLoading(true);
      setRefreshing(backgroundRefresh);

      const [healthResponse, metricsResponse] = await Promise.all([
        adminMonitoringAPI.getSystemHealth(),
        adminMonitoringAPI.getSystemMetrics(),
      ]);

      setForbidden(false);
      setHealth(healthResponse);
      setMetrics(metricsResponse);
      setError(null);
    } catch (loadError) {
      const maybeStatus =
        typeof loadError === "object" && loadError !== null && "status" in loadError
          ? Number((loadError as { status?: unknown }).status)
          : 0;

      const message =
        loadError instanceof Error ? loadError.message : "Failed to fetch system monitoring data.";
      const normalized = message.toLowerCase();

      if (
        maybeStatus === 403 ||
        normalized.includes("permission") ||
        normalized.includes("forbidden") ||
        normalized.includes("access")
      ) {
        setForbidden(true);
        setError(null);
      } else {
        setForbidden(false);
        setError(message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    loadData(false);

    const interval = window.setInterval(() => {
      if (active) {
        loadData(true);
      }
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [loadData]);

  const memoryCards = useMemo(() => {
    if (!metrics?.memoryUsage) return [];

    return [
      { label: "RSS", value: formatBytes(metrics.memoryUsage.rss) },
      { label: "Heap Used", value: formatBytes(metrics.memoryUsage.heapUsed) },
      { label: "Heap Total", value: formatBytes(metrics.memoryUsage.heapTotal) },
      { label: "External", value: formatBytes(metrics.memoryUsage.external) },
      { label: "Array Buffers", value: formatBytes(metrics.memoryUsage.arrayBuffers) },
    ];
  }, [metrics]);

  const overallStatus: "good" | "warn" | "bad" = useMemo(() => {
    if (!health || !metrics) return "warn";

    const degradedDeps = health.mongodb !== "connected" || health.redis !== "connected";
    const p95State = scoreLatency(metrics.apiResponseTime?.p95Ms);
    const loopLagState = scoreLoopLag(metrics.eventLoopLagMs);

    if (degradedDeps || p95State === "bad" || loopLagState === "bad") return "bad";
    if (p95State === "warn" || loopLagState === "warn" || health.status !== "ok") return "warn";
    return "good";
  }, [health, metrics]);

  const heapPressure = useMemo<"good" | "warn" | "bad">(() => {
    const pct = metrics?.memoryUsage?.heapUsagePercent;
    if (!Number.isFinite(pct)) return "warn";
    if (Number(pct) >= 90) return "bad";
    if (Number(pct) >= 75) return "warn";
    return "good";
  }, [metrics?.memoryUsage?.heapUsagePercent]);

  const systemMemoryPressure = useMemo<"good" | "warn" | "bad">(() => {
    const pct = metrics?.systemMemory?.usedPercent;
    if (!Number.isFinite(pct)) return "warn";
    if (Number(pct) >= 90) return "bad";
    if (Number(pct) >= 75) return "warn";
    return "good";
  }, [metrics?.systemMemory?.usedPercent]);

  if (forbidden) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl px-8 py-6 shadow-lg shadow-black/10 max-w-md">
          <p className="text-white text-xl font-semibold mb-2">Access Denied</p>
          <p className="text-white/60">System monitoring is only accessible to platform owners.</p>
          <button
            onClick={() => window.location.assign("/dashboard")}
            className="mt-5 inline-flex items-center justify-center px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl transition-all duration-200 cursor-pointer text-sm"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 sm:px-6 md:px-16 pt-8 md:pt-10 flex flex-col gap-6 md:gap-8 pb-16 animate-fade-in-up">
      <section className="backdrop-blur-2xl bg-secondary/40 border border-white/10 rounded-3xl px-6 md:px-8 py-8 shadow-2xl shadow-black/20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-linear-to-r from-white via-white/90 to-white/60 font-satoshi tracking-tight">System Health Center</h1>
            <p className="text-white/50 text-sm md:text-base mt-2 font-medium tracking-wide">Full runtime, dependency, latency, CPU and memory visibility. Auto-refresh every 5 seconds.</p>
            <p className="text-white/30 text-xs mt-3 font-mono">
              Last updated: {formatTimestamp(metrics?.timestampIso, metrics?.timestamp ?? health?.timestamp)}
            </p>
          </div>

          <button
            onClick={() => loadData(true)}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-white/10 text-white/90 bg-white/5 hover:bg-white/10 hover:border-white/20 hover:shadow-lg transition-all duration-300 font-medium tracking-wide cursor-pointer"
            disabled={refreshing}
          >
            <RefreshCw className={`w-4 h-4 text-accent ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing..." : "Refresh now"}
          </button>
        </div>
      </section>

      {error && (
        <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="backdrop-blur-2xl bg-secondary/30 rounded-3xl border border-white/5 px-6 md:px-8 py-12 shadow-xl shadow-black/10 text-white/50 text-center font-medium tracking-wide">
          Loading complete health snapshot...
        </div>
      ) : (
        <div className="flex flex-col gap-6 md:gap-8">
          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">
            <div className="backdrop-blur-xl bg-secondary/30 border border-white/5 rounded-2xl px-6 py-5 shadow-lg shadow-black/10 hover:border-white/10 transition-colors">
              <p className="text-white/40 text-xs sm:text-sm font-semibold uppercase tracking-[0.15em] mb-3">Overall Quality</p>
              <div className="flex items-center gap-3">
                <Gauge className={`w-5 h-5 ${overallStatus === "good" ? "text-emerald-400" : overallStatus === "warn" ? "text-amber-400" : "text-red-400"}`} />
                <span className={`px-3 py-1 rounded-lg border text-sm font-bold tracking-wide ${statusBadgeClass(overallStatus)}`}>
                  {overallStatus === "good" ? "Healthy" : overallStatus === "warn" ? "Attention" : "Critical"}
                </span>
              </div>
            </div>

            <div className="backdrop-blur-xl bg-secondary/30 border border-white/5 rounded-2xl px-6 py-5 shadow-lg shadow-black/10 hover:border-white/10 transition-colors">
              <p className="text-white/40 text-xs sm:text-sm font-semibold uppercase tracking-[0.15em] mb-3">Node Uptime</p>
              <p className="text-white text-xl md:text-2xl font-bold tracking-tight">{formatUptime(metrics?.uptime ?? health?.uptime)}</p>
            </div>

            <div className="backdrop-blur-xl bg-secondary/30 border border-white/5 rounded-2xl px-6 py-5 shadow-lg shadow-black/10 hover:border-white/10 transition-colors">
              <p className="text-white/40 text-xs sm:text-sm font-semibold uppercase tracking-[0.15em] mb-3">Event Loop Lag</p>
              <p className={`text-xl md:text-2xl font-bold tracking-tight ${metricValueClass(scoreLoopLag(metrics?.eventLoopLagMs))}`}>
                {formatMs(metrics?.eventLoopLagMs)}
              </p>
            </div>

            <div className="backdrop-blur-xl bg-secondary/30 border border-white/5 rounded-2xl px-6 py-5 shadow-lg shadow-black/10 hover:border-white/10 transition-colors">
              <p className="text-white/40 text-xs sm:text-sm font-semibold uppercase tracking-[0.15em] mb-3">API P95</p>
              <p className={`text-xl md:text-2xl font-bold tracking-tight ${metricValueClass(scoreLatency(metrics?.apiResponseTime?.p95Ms))}`}>
                {formatMs(metrics?.apiResponseTime?.p95Ms)}
              </p>
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
            <div className="backdrop-blur-xl bg-secondary/30 rounded-3xl border border-white/5 px-6 md:px-8 py-7 shadow-xl shadow-black/10 transition-colors hover:border-white/10">
              <h2 className="text-xl md:text-2xl font-bold text-white mb-6 flex items-center gap-3 tracking-tight">
                <Server className="w-6 h-6 text-accent drop-shadow-[0_0_8px_rgba(var(--accent),0.5)]" /> Runtime Environment
              </h2>
              <div className="space-y-4 text-sm md:text-base font-medium">
                <div className="flex justify-between gap-3 items-center border-b border-white/5 pb-3">
                  <span className="text-white/50 tracking-wide">Environment</span>
                  <span className="text-white/90 bg-white/5 px-3 py-1 rounded-sm">{metrics?.runtime?.environment || health?.runtime?.environment || "N/A"}</span>
                </div>
                <div className="flex justify-between gap-3 items-center border-b border-white/5 pb-3">
                  <span className="text-white/50 tracking-wide">Node Version</span>
                  <span className="text-white/90 font-mono bg-white/5 px-3 py-1 rounded-sm">{metrics?.runtime?.nodeVersion || health?.runtime?.nodeVersion || "N/A"}</span>
                </div>
                <div className="flex justify-between gap-3 items-center border-b border-white/5 pb-3">
                  <span className="text-white/50 tracking-wide">Host</span>
                  <span className="text-white/90 bg-white/5 px-3 py-1 rounded-sm">{metrics?.runtime?.hostname || health?.runtime?.hostname || "N/A"}</span>
                </div>
                <div className="flex justify-between gap-3 items-center border-b border-white/5 pb-3">
                  <span className="text-white/50 tracking-wide">Platform</span>
                  <span className="text-white/90 font-mono bg-white/5 px-3 py-1 rounded-sm">{metrics?.runtime?.platform || health?.runtime?.platform || "N/A"} ({metrics?.runtime?.arch || health?.runtime?.arch || "N/A"})</span>
                </div>
                <div className="flex justify-between gap-3 items-center border-b border-white/5 pb-3">
                  <span className="text-white/50 tracking-wide">PID</span>
                  <span className="text-white/90 font-mono bg-white/5 px-3 py-1 rounded-sm">{metrics?.runtime?.pid ?? health?.runtime?.pid ?? "N/A"}</span>
                </div>
                <div className="flex justify-between gap-3 items-center border-b border-white/5 pb-3">
                  <span className="text-white/50 tracking-wide">Timezone</span>
                  <span className="text-white/90 bg-white/5 px-3 py-1 rounded-sm">{metrics?.runtime?.timezone || health?.runtime?.timezone || "N/A"}</span>
                </div>
                <div className="flex justify-between gap-3 items-center">
                  <span className="text-white/50 tracking-wide">System Uptime</span>
                  <span className="text-white/90 bg-white/5 px-3 py-1 rounded-sm font-mono">{formatUptime(metrics?.systemUptime ?? health?.systemUptime)}</span>
                </div>
              </div>
            </div>

            <div className="backdrop-blur-xl bg-secondary/30 rounded-3xl border border-white/5 px-6 md:px-8 py-7 shadow-xl shadow-black/10 transition-colors hover:border-white/10">
              <h2 className="text-xl md:text-2xl font-bold text-white mb-6 flex items-center gap-3 tracking-tight">
                <Database className="w-6 h-6 text-accent drop-shadow-[0_0_8px_rgba(var(--accent),0.5)]" /> Infrastructure & Services
              </h2>
              <div className="space-y-4 text-sm md:text-base font-medium">
                <div className="flex justify-between items-center gap-3 border-b border-white/5 pb-3">
                  <span className="text-white/50 tracking-wide">MongoDB</span>
                  <span className={`px-3 py-1 rounded-lg border text-xs font-bold tracking-wider ${health?.mongodb === "connected" ? statusBadgeClass("good") : statusBadgeClass("bad")}`}>
                    {health?.mongodb?.toUpperCase() || "UNKNOWN"}
                  </span>
                </div>
                <div className="flex justify-between items-center gap-3 border-b border-white/5 pb-3">
                  <span className="text-white/50 tracking-wide">Redis</span>
                  <span className={`px-3 py-1 rounded-lg border text-xs font-bold tracking-wider ${metrics?.redis?.status === "connected" ? statusBadgeClass("good") : statusBadgeClass("bad")}`}>
                    {(metrics?.redis?.status || health?.redis || "UNKNOWN").toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between gap-3 items-center border-b border-white/5 pb-3">
                  <span className="text-white/50 tracking-wide">Redis Ping</span>
                  <span className="text-white/90 font-mono bg-white/5 px-3 py-1 rounded-sm">{formatMs(metrics?.redis?.pingMs)}</span>
                </div>
                <div className="flex justify-between gap-3 items-center border-b border-white/5 pb-3">
                  <span className="text-white/50 tracking-wide">Redis Memory</span>
                  <span className="text-white/90 font-mono bg-white/5 px-3 py-1 rounded-sm">{metrics?.redis?.memoryHuman || formatBytes(metrics?.redis?.memoryBytes)}</span>
                </div>
                {metrics?.redis?.error && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs md:text-sm text-amber-200/90 shadow-inner">
                    <p className="font-semibold mb-1">Redis detail: {metrics.redis.error}</p>
                    {String(metrics.redis.error).toUpperCase().includes("NOAUTH") && (
                      <p className="text-amber-200/70 mt-1 leading-relaxed">
                        Set REDIS_PASSWORD (and REDIS_USERNAME=default if ACL) in server/.env.development, then restart the server.
                      </p>
                    )}
                  </div>
                )}
                <div className="flex justify-between gap-3 items-center border-b border-white/5 pb-3">
                  <span className="text-white/50 tracking-wide">Active Sessions</span>
                  <span className="text-white/90 font-mono bg-white/5 px-3 py-1 rounded-sm">{metrics?.activeSessionsCount ?? "N/A"}</span>
                </div>
                <div className="flex justify-between gap-3 items-center">
                  <span className="text-white/50 tracking-wide">Socket Clients</span>
                  <span className="text-white/90 font-mono bg-white/5 px-3 py-1 rounded-sm">{metrics?.connectedSocketClients ?? "N/A"}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
            <div className="backdrop-blur-xl bg-secondary/30 rounded-3xl border border-white/5 px-6 md:px-8 py-7 shadow-xl shadow-black/10 transition-colors hover:border-white/10">
              <h2 className="text-xl md:text-2xl font-bold text-white mb-6 flex items-center gap-3 tracking-tight">
                <Cpu className="w-6 h-6 text-accent drop-shadow-[0_0_8px_rgba(var(--accent),0.5)]" /> CPU & Latency
              </h2>
              <div className="space-y-4 text-sm md:text-base font-medium">
                <div className="flex justify-between gap-3 items-center border-b border-white/5 pb-3">
                  <span className="text-white/50 tracking-wide">CPU Cores</span>
                  <span className="text-white/90 bg-white/5 px-3 py-1 rounded-sm">{metrics?.cpu?.cores ?? "N/A"}</span>
                </div>
                <div className="flex justify-between gap-3 items-center border-b border-white/5 pb-3">
                  <span className="text-white/50 tracking-wide">Load Avg (1m, 5m, 15m)</span>
                  <span className="text-white/90 font-mono bg-white/5 px-3 py-1 rounded-sm text-right">{metrics?.cpu?.loadAverage1m ?? "N/A"}, {metrics?.cpu?.loadAverage5m ?? "N/A"}, {metrics?.cpu?.loadAverage15m ?? "N/A"}</span>
                </div>
                {metrics?.cpu && metrics.cpu.loadAverageSupported === false && (
                  <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-xs md:text-sm text-sky-200/90 shadow-inner">
                    Windows note: native load average is not reported by Node.js on win32, so values remain 0.
                  </div>
                )}
                <div className="flex justify-between gap-3 items-center border-b border-white/5 pb-3">
                  <span className="text-white/50 tracking-wide">Normalized CPU (1m)</span>
                  <span className="text-white/90 font-mono bg-white/5 px-3 py-1 rounded-sm">{formatPercent(metrics?.cpu?.normalizedLoad1mPercent)}</span>
                </div>
                <div className="flex justify-between gap-3 items-center border-b border-white/5 pb-3">
                  <span className="text-white/50 tracking-wide">Normalized CPU (5m)</span>
                  <span className="text-white/90 font-mono bg-white/5 px-3 py-1 rounded-sm">{formatPercent(metrics?.cpu?.normalizedLoad5mPercent)}</span>
                </div>
                <div className="flex justify-between gap-3 items-center border-b border-white/5 pb-3">
                  <span className="text-white/50 tracking-wide">Normalized CPU (15m)</span>
                  <span className="text-white/90 font-mono bg-white/5 px-3 py-1 rounded-sm">{formatPercent(metrics?.cpu?.normalizedLoad15mPercent)}</span>
                </div>
                <div className="flex justify-between gap-3 items-center border-b border-white/5 pb-3">
                  <span className="text-white/50 tracking-wide">API Avg</span>
                  <span className="text-white/90 font-mono bg-white/5 px-3 py-1 rounded-sm">{formatMs(metrics?.apiResponseTime?.avgMs)}</span>
                </div>
                <div className="flex justify-between gap-3 items-center border-b border-white/5 pb-3">
                  <span className="text-white/50 tracking-wide">API P95</span>
                  <span className="text-white/90 font-mono bg-white/5 px-3 py-1 rounded-sm">{formatMs(metrics?.apiResponseTime?.p95Ms)}</span>
                </div>
                <div className="flex justify-between gap-3 items-center">
                  <span className="text-white/50 tracking-wide">API Sample Size</span>
                  <span className="text-white/90 font-mono bg-white/5 px-3 py-1 rounded-sm">{metrics?.apiResponseTime?.sampleSize ?? "N/A"}</span>
                </div>
              </div>
            </div>

            <div className="backdrop-blur-xl bg-secondary/30 rounded-3xl border border-white/5 px-6 md:px-8 py-7 shadow-xl shadow-black/10 transition-colors hover:border-white/10">
              <h2 className="text-xl md:text-2xl font-bold text-white mb-6 flex items-center gap-3 tracking-tight">
                <HardDrive className="w-6 h-6 text-accent drop-shadow-[0_0_8px_rgba(var(--accent),0.5)]" /> Memory Health
              </h2>

              <div className="space-y-6 mb-7">
                <div>
                  <div className="flex justify-between text-sm md:text-base font-medium text-white/50 tracking-wide mb-2">
                    <span>Node Heap Usage</span>
                    <span className="font-mono text-white/90">{formatPercent(metrics?.memoryUsage?.heapUsagePercent)}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-white/5 overflow-hidden border border-white/5">
                    <div
                      className="h-full rounded-full bg-linear-to-r from-accent to-orange-400 drop-shadow-[0_0_8px_rgba(var(--accent),0.8)]"
                      style={{ width: `${Math.max(0, Math.min(100, Number(metrics?.memoryUsage?.heapUsagePercent || 0)))}%`, transition: 'width 1s ease-in-out' }}
                    />
                  </div>
                  <div className={`mt-3 inline-flex px-3 py-1 rounded-lg border text-xs font-bold uppercase tracking-wider ${statusBadgeClass(heapPressure)}`}>
                    Heap pressure: {heapPressure === "good" ? "Normal" : heapPressure === "warn" ? "High" : "Critical"}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm md:text-base font-medium text-white/50 tracking-wide mb-2">
                    <span>System Memory Usage</span>
                    <span className="font-mono text-white/90">{formatPercent(metrics?.systemMemory?.usedPercent)}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-white/5 overflow-hidden border border-white/5">
                    <div
                      className="h-full rounded-full bg-linear-to-r from-sky-400 to-cyan-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.8)]"
                      style={{ width: `${Math.max(0, Math.min(100, Number(metrics?.systemMemory?.usedPercent || 0)))}%`, transition: 'width 1s ease-in-out' }}
                    />
                  </div>
                  <div className={`mt-3 inline-flex px-3 py-1 rounded-lg border text-xs font-bold uppercase tracking-wider ${statusBadgeClass(systemMemoryPressure)}`}>
                    OS Memory: {systemMemoryPressure === "good" ? "Normal" : systemMemoryPressure === "warn" ? "High" : "Critical"}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {memoryCards.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-white/5 backdrop-blur-xl bg-white/5 p-4 hover:border-white/10 hover:bg-white/10 transition-colors">
                    <p className="text-white/40 text-xs font-semibold uppercase tracking-[0.15em]">{item.label}</p>
                    <p className="text-white text-lg font-bold font-mono mt-1.5">{item.value}</p>
                  </div>
                ))}
                <div className="rounded-2xl border border-white/5 backdrop-blur-xl bg-white/5 p-4 hover:border-white/10 hover:bg-white/10 transition-colors">
                  <p className="text-white/40 text-xs font-semibold uppercase tracking-[0.15em]">OS Total</p>
                  <p className="text-white text-lg font-bold font-mono mt-1.5">{formatBytes(metrics?.systemMemory?.total)}</p>
                </div>
                <div className="rounded-2xl border border-white/5 backdrop-blur-xl bg-white/5 p-4 hover:border-white/10 hover:bg-white/10 transition-colors">
                  <p className="text-white/40 text-xs font-semibold uppercase tracking-[0.15em]">OS Free</p>
                  <p className="text-white text-lg font-bold font-mono mt-1.5">{formatBytes(metrics?.systemMemory?.free)}</p>
                </div>
                <div className="rounded-2xl border border-white/5 backdrop-blur-xl bg-white/5 p-4 hover:border-white/10 hover:bg-white/10 transition-colors">
                  <p className="text-white/40 text-xs font-semibold uppercase tracking-[0.15em]">OS Used</p>
                  <p className="text-white text-lg font-bold font-mono mt-1.5">{formatBytes(metrics?.systemMemory?.used)}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="backdrop-blur-2xl bg-secondary/50 rounded-2xl border border-white/10 px-6 md:px-8 py-6 shadow-lg shadow-black/10">
            <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
              <Activity className="w-5 h-5 text-accent" /> Operational Notes
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-secondary/40 border border-white/10 p-3.5 text-white/75">
                <p className="text-white font-medium mb-1">Latency Quality</p>
                <p>
                  Average: {formatMs(metrics?.apiResponseTime?.avgMs)} | P95: {formatMs(metrics?.apiResponseTime?.p95Ms)}.
                  {" "}
                  Keep P95 below 600ms for excellent perceived responsiveness.
                </p>
              </div>
              <div className="rounded-xl bg-secondary/40 border border-white/10 p-3.5 text-white/75">
                <p className="text-white font-medium mb-1">Capacity Signals</p>
                <p>
                  Event loop lag: {formatMs(metrics?.eventLoopLagMs)}.
                  Active sessions: {metrics?.activeSessionsCount ?? "N/A"}, sockets: {metrics?.connectedSocketClients ?? "N/A"}.
                </p>
              </div>
            </div>
          </section>
        </div>
      )}

      <div className="text-xs text-white/35 flex items-center gap-2">
        <Wifi className="w-3.5 h-3.5" /> Live monitoring updates every 5s. Values shown as N/A are unavailable from runtime/service telemetry.
      </div>
    </div>
  );
};

export default SystemMonitoring;
