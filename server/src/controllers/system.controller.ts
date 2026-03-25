import { Request, Response } from "express";
import mongoose from "mongoose";
import os from "node:os";
import redisClient from "../config/redis";
import Session from "../models/Session.model";
import { getConnectedClientCount } from "../socket";
import { getApiResponseTimeStats } from "../middleware/request.middleware";

const parseRedisInfoValue = (redisInfo: string, key: string): string | null => {
    const line = redisInfo
        .split("\n")
        .map((entry) => entry.trim())
        .find((entry) => entry.startsWith(`${key}:`));

    if (!line) return null;
    return line.replace(`${key}:`, "").trim() || null;
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
    let redis: "connected" | "disconnected" = redisClient.isOpen ? "connected" : "disconnected";

    if (redisClient.isOpen) {
        try {
            await redisClient.ping();
        } catch {
            redis = "disconnected";
        }
    }

    const now = Date.now();

    return res.json({
        status: mongodb === "connected" && redis === "connected" ? "ok" : "degraded",
        uptime: process.uptime(),
        systemUptime: os.uptime(),
        mongodb,
        redis,
        runtime: {
            nodeVersion: process.version,
            environment: process.env.NODE_ENV || "unknown",
            platform: process.platform,
            arch: process.arch,
            hostname: os.hostname(),
            pid: process.pid,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown",
        },
        memoryUsage: process.memoryUsage(),
        timestamp: now,
        timestampIso: new Date(now).toISOString(),
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
    const cores = os.cpus().length || 1;
    const apiResponseTime = getApiResponseTimeStats();
    const processMemory = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    let redisMemoryHuman: string | null = null;
    let redisMemoryBytes: number | null = null;
    let redisPingMs: number | null = null;
    let redisError: string | null = null;
    let redisStatus: "connected" | "disconnected" = redisClient.isOpen ? "connected" : "disconnected";

    if (redisClient.isOpen) {
        try {
            const pingStart = process.hrtime.bigint();
            await redisClient.ping();
            redisPingMs = Number((Number(process.hrtime.bigint() - pingStart) / 1_000_000).toFixed(2));
            redisStatus = "connected";
        } catch (error) {
            redisPingMs = null;
            redisError = error instanceof Error ? error.message : "Redis ping failed";
            redisStatus = "disconnected";
        }

        try {
            const info = await redisClient.info("memory");
            redisMemoryHuman = parseRedisInfoValue(info, "used_memory_human");
            const memoryBytesRaw = parseRedisInfoValue(info, "used_memory");
            redisMemoryBytes = memoryBytesRaw ? Number(memoryBytesRaw) : null;
            if (redisMemoryBytes !== null && !Number.isFinite(redisMemoryBytes)) {
                redisMemoryBytes = null;
            }
        } catch (error) {
            redisMemoryHuman = null;
            redisMemoryBytes = null;
            if (!redisError) {
                redisError = error instanceof Error ? error.message : "Redis memory info unavailable";
            }

            if (String(redisError).toUpperCase().includes("NOAUTH")) {
                redisStatus = "disconnected";
            }
        }
    }

    const heapUsagePercent =
        processMemory.heapTotal > 0
            ? Number(((processMemory.heapUsed / processMemory.heapTotal) * 100).toFixed(2))
            : 0;

    const systemUsed = totalMem - freeMem;
    const systemUsedPercent =
        totalMem > 0 ? Number(((systemUsed / totalMem) * 100).toFixed(2)) : 0;

    const normalizedLoad1mPercent = Number(((loadAverage[0] / cores) * 100).toFixed(2));
    const normalizedLoad5mPercent = Number(((loadAverage[1] / cores) * 100).toFixed(2));
    const normalizedLoad15mPercent = Number(((loadAverage[2] / cores) * 100).toFixed(2));
    const loadAverageSupported = process.platform !== "win32";
    const now = Date.now();

    return res.json({
        status: "ok",
        uptime: process.uptime(),
        systemUptime: os.uptime(),
        activeSessionsCount,
        connectedSocketClients: getConnectedClientCount(),
        redis: {
            status: redisStatus,
            memoryHuman: redisMemoryHuman,
            memoryBytes: redisMemoryBytes,
            pingMs: redisPingMs,
            error: redisError,
        },
        eventLoopLagMs,
        apiResponseTime,
        cpu: {
            userMs: cpuUserMs,
            systemMs: cpuSystemMs,
            loadAverage1m: Number((loadAverage[0] || 0).toFixed(2)),
            loadAverage5m: Number((loadAverage[1] || 0).toFixed(2)),
            loadAverage15m: Number((loadAverage[2] || 0).toFixed(2)),
            normalizedLoad1mPercent,
            normalizedLoad5mPercent,
            normalizedLoad15mPercent,
            loadAverageSupported,
            cores,
        },
        memoryUsage: {
            ...processMemory,
            heapUsagePercent,
        },
        systemMemory: {
            total: totalMem,
            free: freeMem,
            used: systemUsed,
            usedPercent: systemUsedPercent,
        },
        runtime: {
            nodeVersion: process.version,
            environment: process.env.NODE_ENV || "unknown",
            platform: process.platform,
            arch: process.arch,
            hostname: os.hostname(),
            pid: process.pid,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown",
        },
        timestamp: now,
        timestampIso: new Date(now).toISOString(),
    });
};
