import { shouldEnableIOSPerfMode } from "./device";

const PERF_DEBUG_QUERY_KEY = "perfDebug";
const PERF_DEBUG_STORAGE_KEY = "trackence:perf-debug";

const startTimes = new Map<string, number>();
const counters = new Map<string, number>();

const isTelemetryEnabled = (): boolean => {
  if (typeof window === "undefined") return false;
  if (!shouldEnableIOSPerfMode()) return false;

  const queryEnabled = new URLSearchParams(window.location.search).get(PERF_DEBUG_QUERY_KEY) === "1";
  const storageEnabled = window.localStorage.getItem(PERF_DEBUG_STORAGE_KEY) === "1";

  return queryEnabled || storageEnabled;
};

type PerfEndOptions = {
  thresholdMs?: number;
  sampleEvery?: number;
  payload?: Record<string, unknown>;
};

export const perfMarkStart = (key: string): void => {
  if (!isTelemetryEnabled()) return;
  startTimes.set(key, performance.now());
};

export const perfMarkEnd = (key: string, options?: PerfEndOptions): number | null => {
  if (!isTelemetryEnabled()) return null;

  const startedAt = startTimes.get(key);
  if (startedAt === undefined) return null;

  startTimes.delete(key);

  const duration = performance.now() - startedAt;
  const count = (counters.get(key) || 0) + 1;
  counters.set(key, count);

  const thresholdMs = options?.thresholdMs ?? 0;
  const sampleEvery = Math.max(1, options?.sampleEvery ?? 1);
  const shouldLog = duration >= thresholdMs || count % sampleEvery === 0;

  if (shouldLog) {
    if (options?.payload) {
      console.info(`[perf] ${key} ${duration.toFixed(1)}ms`, options.payload);
    } else {
      console.info(`[perf] ${key} ${duration.toFixed(1)}ms`);
    }
  }

  return duration;
};
