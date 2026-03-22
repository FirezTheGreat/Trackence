import http from "node:http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import path from "node:path";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.routes";
import adminRoutes from "./routes/admin.routes";
import adminSessionRoutes from "./routes/admin-session.routes";
import facultyAttendanceRoutes from "./routes/faculty-attendance.routes";
import adminAbsenceRoutes from "./routes/admin-absence.routes";
import organizationRoutes from "./routes/organization.routes";
import systemRoutes from "./routes/system.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import { startQRScheduler } from "./services/scheduler.service";
import { initSocket } from "./socket";
import { initRedis } from "./services/cache.service";

import mongoose from "mongoose";
import Mongoose from "./config/mongoose";
import redisClient from "./config/redis";
import { stopQRScheduler } from "./services/scheduler.service";
import { validateEnv } from "./config/env";
import { logger } from "./utils/logger";
import { attachRequestId, responseTimeLogger } from "./middleware/request.middleware";
import { globalErrorHandler, notFoundHandler } from "./middleware/error.middleware";
import { startEmailNotificationWorker, stopEmailNotificationWorker } from "./services/notification-queue.service";

dotenv.config({
    path: path.resolve(
        process.cwd(),
        process.env.NODE_ENV === "production"
            ? ".env.production"
            : ".env.development"
    ),
});

validateEnv();

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const isProduction = process.env.NODE_ENV === "production";

if (isProduction) {
    // Railway runs behind a proxy and forwards client IP via X-Forwarded-For.
    app.set("trust proxy", 1);
}

const startServer = async () => {
    try {
        if (isProduction) {
            app.use((req, res, next) => {
                const proto = req.headers["x-forwarded-proto"];
                if (proto === "http") {
                    return res.redirect(301, `https://${req.headers.host}${req.url}`);
                }
                next();
            });
        }

        // ✅ 1. Initialize MongoDB
        const mongooseConfig = new Mongoose();
        await mongooseConfig.init();

        // Initialize Redis
        await redisClient.connect();
        initRedis(redisClient);

        // ✅ 2. Middleware
        const corsOrigin = isProduction
            ? process.env.FRONTEND_URL || "http://localhost:5173"
            : process.env.FRONTEND_URL || "http://localhost:5173";
        app.use(
            cors({
                origin: corsOrigin,
                credentials: true,
            })
        );

        app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
        app.use(compression());
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));
        app.use(cookieParser());
        app.use(attachRequestId);
        app.use(responseTimeLogger);

        // ✅ 3. Routes
        app.use("/api/auth", authRoutes);
        app.use("/api/admin", adminRoutes);
        app.use("/api/admin", adminSessionRoutes);
        app.use("/api/admin/absences", adminAbsenceRoutes);
        app.use("/api/admin/organizations", organizationRoutes);
        app.use("/api/admin/dashboard", dashboardRoutes);
        app.use("/api/attendance", facultyAttendanceRoutes);
        app.use("/api/system", systemRoutes);

        app.get("/", (_req, res) => {
            res.send("Modern TypeScript backend is running 🚀");
        });

        app.use(notFoundHandler);
        app.use(globalErrorHandler);

        // ✅ 4. Create HTTP server and attach Socket.IO
        const httpServer = http.createServer(app);
        initSocket(httpServer);

        // ✅ 5. Start QR Rotation Scheduler
        startQRScheduler();
        startEmailNotificationWorker();

        // ✅ 6. Start Server
        httpServer.listen(PORT, () => {
            logger.info(`Server running on port ${PORT}`);
        });

        // ✅ 7. Graceful shutdown
        const shutdown = async () => {
            console.log("Shutting down gracefully...");
            stopQRScheduler();
            stopEmailNotificationWorker();
            httpServer.close(() => console.log("HTTP server closed"));
            await redisClient.quit().catch(() => { });
            await mongoose.connection?.close().catch(() => { });
            process.exit(0);
        };
        process.on("SIGTERM", shutdown);
        process.on("SIGINT", shutdown);

    } catch (error: any) {
        logger.error("Error during server startup", { error: error.message });
        process.exit(1);
    }
};

startServer();
