import { useEffect, useRef } from "react";
import { isPerfDebugEnabled } from "../utils/perf";

type Trackable = string | number | boolean | null | undefined;

type DiagnosticMap = Record<string, Trackable>;

const shouldRunDiagnostics = (): boolean => {
  return import.meta.env.DEV && isPerfDebugEnabled();
};

export const useRenderDiagnostics = (component: string, tracked: DiagnosticMap): void => {
  const renderCountRef = useRef(0);
  const startedAtRef = useRef<number | null>(null);
  const previousRef = useRef<DiagnosticMap | null>(null);
  const enabled = shouldRunDiagnostics();

  if (enabled) {
    const now = performance.now();
    if (startedAtRef.current === null) {
      startedAtRef.current = now;
    }

    renderCountRef.current += 1;
    const elapsed = now - startedAtRef.current;

    if (elapsed >= 1000) {
      const rendersPerSecond = (renderCountRef.current * 1000) / elapsed;
      console.info(`[perf] ${component} render-rate ${rendersPerSecond.toFixed(2)}/s`, {
        renders: renderCountRef.current,
        elapsedMs: Number(elapsed.toFixed(0)),
      });
      startedAtRef.current = now;
      renderCountRef.current = 0;
    }
  }

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const previous = previousRef.current;
    if (!previous) {
      previousRef.current = tracked;
      return;
    }

    const changedKeys: string[] = [];
    Object.keys(tracked).forEach((key) => {
      if (previous[key] !== tracked[key]) {
        changedKeys.push(key);
      }
    });

    if (changedKeys.length > 0) {
      console.info(`[perf] ${component} render-causes`, {
        changedKeys,
        values: changedKeys.reduce<Record<string, Trackable>>((acc, key) => {
          acc[key] = tracked[key];
          return acc;
        }, {}),
      });
    }

    previousRef.current = tracked;
  });
};
