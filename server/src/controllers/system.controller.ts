import { Request, Response } from "express";
import mongoose from "mongoose";
import os from "node:os";
import redisClient from "../config/redis";
import Session from "../models/Session.model";
import { getConnectedClientCount } from "../socket";
import { getApiResponseTimeStats } from "../middleware/request.middleware";

const parseRedisUsedMemory = (redisInfo: string): string | null => {
  const line = redisInfo
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("used_memory_human:"));

  if (!line) return null;
  return line.replace("used_memory_human:", "").trim() || null;
};

const measureEventLoopLag = async (): Promise<number> => {
  const start = process.hrtime.bigint();
  await new Promise<void>((resolve) => setTimeout(resolve, 10));
  const elapsedNs = Number(process.hrtime.bigint() - start);
  const elapsedMs = elapsedNs / 1_000_000;
  return Number(Math.max(0, elapsedMs - 10).toFixed(2));
};

export const getSystemHealth = async (_req: Request, res: Response) => {
  const mongodb = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
  const redis = redisClient.isOpen ? "connected" : "disconnected";

  return res.json({
    status: mongodb === "connected" && redis === "connected" ? "ok" : "degraded",
    uptime: process.uptime(),
    mongodb,
    redis,
    memoryUsage: process.memoryUsage(),
    timestamp: Date.now(),
  });
};

export const getSystemMetrics = async (_req: Request, res: Response) => {
  const [activeSessionsCount, eventLoopLagMs] = await Promise.all([
    Session.countDocuments({ isActive: true }),
    measureEventLoopLag(),
  ]);

  const cpuUsage = process.cpuUsage();
  const cpuUserMs = Number((cpuUsage.user / 1000).toFixed(2));
  const cpuSystemMs = Number((cpuUsage.system / 1000).toFixed(2));
  const loadAverage = os.loadavg();
  const apiResponseTime = getApiResponseTimeStats();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  let redisMemoryInfo: string | null = null;
  if (redisClient.isOpen) {
    try {
      const info = await redisClient.info("memory");
      redisMemoryInfo = parseRedisUsedMemory(info);
    } catch {
      redisMemoryInfo = null;
    }
  }

  return res.json({
    status: "ok",
    uptime: process.uptime(),
    systemUptime: os.uptime(),
    activeSessionsCount,
    connectedSocketClients: getConnectedClientCount(),
    redisMemory: redisMemoryInfo,
    eventLoopLagMs,
    apiResponseTime,
    cpu: {
      userMs: cpuUserMs,
      systemMs: cpuSystemMs,
      loadAverage1m: Number((loadAverage[0] || 0).toFixed(2)),
      loadAverage5m: Number((loadAverage[1] || 0).toFixed(2)),
      loadAverage15m: Number((loadAverage[2] || 0).toFixed(2)),
      cores: os.cpus().length,
    },
    memoryUsage: process.memoryUsage(),
    systemMemory: {
        total: totalMem,
        free: freeMem,
        used: totalMem - freeMem,
    },
    timestamp: Date.now(),
  });
};
