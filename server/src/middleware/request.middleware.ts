import { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { logger } from "../utils/logger";

const MAX_RECENT_DURATIONS = 200;
const recentApiDurationsMs: number[] = [];

export const getApiResponseTimeStats = () => {
  if (recentApiDurationsMs.length === 0) {
    return {
      sampleSize: 0,
      avgMs: 0,
      p95Ms: 0,
    };
  }

  const sampleSize = recentApiDurationsMs.length;
  const sorted = [...recentApiDurationsMs].sort((a, b) => a - b);
  const avgMs = Number((sorted.reduce((sum, value) => sum + value, 0) / sampleSize).toFixed(2));
  const p95Index = Math.min(sampleSize - 1, Math.floor(sampleSize * 0.95));
  const p95Ms = Number(sorted[p95Index].toFixed(2));

  return {
    sampleSize,
    avgMs,
    p95Ms,
  };
};

export const attachRequestId = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const headerRequestId = req.headers["x-request-id"];
  const requestId =
    typeof headerRequestId === "string" && headerRequestId.trim().length > 0
      ? headerRequestId.trim()
      : randomUUID();

  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
};

export const responseTimeLogger = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const roundedDurationMs = Number(durationMs.toFixed(2));

    if (req.originalUrl.startsWith("/api/")) {
      recentApiDurationsMs.push(roundedDurationMs);
      if (recentApiDurationsMs.length > MAX_RECENT_DURATIONS) {
        recentApiDurationsMs.shift();
      }
    }

    const payload = {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: roundedDurationMs,
      ip: req.ip,
    };

    if (res.statusCode >= 500) {
      logger.error("Request completed with server error", payload);
      return;
    }

    if (res.statusCode >= 400) {
      logger.warn("Request completed with client error", payload);
      return;
    }

    logger.info("Request completed", payload);
  });

  next();
};
