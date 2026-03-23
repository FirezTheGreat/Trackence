import { useEffect, useMemo, useState } from "react";
import {
  adminMonitoringAPI,
} from "../services/admin-monitoring.service";
import type {
  SystemHealthResponse,
  SystemMetricsResponse,
} from "../services/admin-monitoring.service";
import { useAuthStore } from "../stores/auth.store";

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let index = 0;
  let value = bytes;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(2)} ${units[index]}`;
};

const formatUptime = (uptimeSeconds: number): string => {
  const total = Math.max(0, Math.floor(uptimeSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
};

const SystemMonitoring = () => {
  const { user } = useAuthStore();
  const canAccess = user?.platformRole === "superAdmin" || user?.platformRole === "platform_owner";
  const [health, setHealth] = useState<SystemHealthResponse | null>(null);
  const [metrics, setMetrics] = useState<SystemMetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canAccess) {
      setLoading(false);
      return;
    }

    let active = true;

    const loadData = async () => {
      try {
        const [healthResponse, metricsResponse] = await Promise.all([
          adminMonitoringAPI.getSystemHealth(),
          adminMonitoringAPI.getSystemMetrics(),
        ]);

        if (!active) return;
        setHealth(healthResponse);
        setMetrics(metricsResponse);
        setError(null);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to fetch system metrics.");
      } finally {
        if (active) setLoading(false);
      }
    };

    loadData();
    const interval = window.setInterval(loadData, 5000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [canAccess]);

  const memoryCards = useMemo(() => {
    if (!metrics?.memoryUsage) return [];
    return [
      { label: "RSS", value: formatBytes(metrics.memoryUsage.rss) },
      { label: "Heap Used", value: formatBytes(metrics.memoryUsage.heapUsed) },
      { label: "Heap Total", value: formatBytes(metrics.memoryUsage.heapTotal) },
      { label: "External", value: formatBytes(metrics.memoryUsage.external) },
    ];
  }, [metrics]);

  if (!canAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl px-8 py-6 shadow-lg shadow-black/10 max-w-md">
          <p className="text-white text-xl font-semibold mb-2">Access Denied</p>
          <p className="text-white/60">System monitoring is only accessible to Super Administrators.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-8 md:px-16 pt-8 md:pt-10 flex flex-col gap-6 md:gap-8 pb-16 animate-fade-in-up">
      {/* Header */}
      <section className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl px-6 md:px-8 py-6 shadow-lg shadow-black/10">
        <h1 className="text-2xl md:text-3xl font-bold text-white font-satoshi tracking-tight">System Monitoring</h1>
        <p className="text-white/40 text-sm mt-1">Runtime health and operational metrics. Auto-refreshes every 5 seconds.</p>
      </section>

      {error && (
        <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="backdrop-blur-2xl bg-secondary/50 rounded-2xl border border-white/10 px-6 md:px-8 py-6 shadow-lg shadow-black/10 text-white/60">
          Loading system data...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="backdrop-blur-2xl bg-secondary/50 rounded-2xl border border-white/10 px-6 md:px-8 py-6 shadow-lg shadow-black/10">
              <h2 className="text-xl font-semibold text-white mb-4">Core Status</h2>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-white/70">Node.js Uptime</span>
                  <span className="text-white">{formatUptime(health?.uptime || 0)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/70">System Uptime</span>
                  <span className="text-white">{formatUptime(metrics?.systemUptime || 0)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/70">MongoDB</span>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold ${
                      health?.mongodb === "connected"
                        ? "bg-green-500/20 text-green-300"
                        : "bg-red-500/20 text-red-300"
                    }`}
                  >
                    {health?.mongodb || "unknown"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/70">Redis</span>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold ${
                      health?.redis === "connected"
                        ? "bg-green-500/20 text-green-300"
                        : "bg-red-500/20 text-red-300"
                    }`}
                  >
                    {health?.redis || "unknown"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/70">Overall Status</span>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold ${
                      health?.status === "ok"
                        ? "bg-green-500/20 text-green-300"
                        : "bg-yellow-500/20 text-yellow-300"
                    }`}
                  >
                    {health?.status || "unknown"}
                  </span>
                </div>
              </div>
            </section>

          <section className="backdrop-blur-2xl bg-secondary/50 rounded-2xl border border-white/10 px-6 md:px-8 py-6 shadow-lg shadow-black/10">
              <h2 className="text-xl font-semibold text-white mb-4">Live Metrics</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-white/70">OS CPU Cores</span>
                  <span className="text-white font-semibold">{metrics?.cpu?.cores ?? "Unknown"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/70">CPU Load (1m, 5m, 15m)</span>
                  <span className="text-white font-semibold">
                    {metrics?.cpu?.loadAverage1m ?? 0}, {metrics?.cpu?.loadAverage5m ?? 0}, {metrics?.cpu?.loadAverage15m ?? 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/70">Active Sessions</span>
                  <span className="text-white font-semibold">{metrics?.activeSessionsCount ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/70">Connected Socket Clients</span>
                  <span className="text-white font-semibold">{metrics?.connectedSocketClients ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/70">Redis Memory</span>
                  <span className="text-white font-semibold">{metrics?.redisMemory || "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/70">Event Loop Lag</span>
                  <span className="text-white font-semibold">{metrics?.eventLoopLagMs ?? 0} ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/70">API Avg Response</span>
                  <span className="text-white font-semibold">{metrics?.apiResponseTime?.avgMs ?? 0} ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/70">API P95 Response</span>
                  <span className="text-white font-semibold">{metrics?.apiResponseTime?.p95Ms ?? 0} ms</span>
                </div>
              </div>
            </section>

          <section className="md:col-span-2 backdrop-blur-2xl bg-secondary/50 rounded-2xl border border-white/10 px-6 md:px-8 py-6 shadow-lg shadow-black/10">
              <h2 className="text-xl font-semibold text-white mb-4">Node.js Memory Usage</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                {memoryCards.map((card) => (
                  <div key={card.label} className="rounded-xl border border-white/15 backdrop-blur-xl bg-secondary/40 p-4 hover:border-white/25 transition-all duration-300">
                    <p className="text-white/60 text-sm">{card.label}</p>
                    <p className="text-white text-lg font-semibold mt-1">{card.value}</p>
                  </div>
                ))}
              </div>

              <h2 className="text-xl font-semibold text-white mb-4">System Memory (VPS)</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl border border-white/15 backdrop-blur-xl bg-secondary/40 p-4 hover:border-white/25 transition-all duration-300">
                  <p className="text-white/60 text-sm">Total OS Memory</p>
                  <p className="text-white text-lg font-semibold mt-1">{formatBytes(metrics?.systemMemory?.total || 0)}</p>
                </div>
                <div className="rounded-xl border border-white/15 backdrop-blur-xl bg-secondary/40 p-4 hover:border-white/25 transition-all duration-300">
                  <p className="text-white/60 text-sm">Free System Memory</p>
                  <p className="text-white text-lg font-semibold mt-1">{formatBytes(metrics?.systemMemory?.free || 0)}</p>
                </div>
                <div className="rounded-xl border border-white/15 backdrop-blur-xl bg-secondary/40 p-4 hover:border-white/25 transition-all duration-300">
                  <p className="text-white/60 text-sm">Used System Memory</p>
                  <p className="text-white text-lg font-semibold mt-1">{formatBytes(metrics?.systemMemory?.used || 0)}</p>
                </div>
              </div>
            </section>
          </div>
        )}
    </div>
  );
};

export default SystemMonitoring;
