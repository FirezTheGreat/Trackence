import winston from "winston";
import fs from "node:fs";
import path from "node:path";
import { APP_NAME } from "../config/env";

const isProduction = process.env.NODE_ENV === "production";

const transports: winston.transport[] = [new winston.transports.Console()];

if (isProduction) {
  const logsDir = path.resolve(process.cwd(), "logs");
  fs.mkdirSync(logsDir, { recursive: true });

  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, "combined.log"),
      level: process.env.LOG_LEVEL || "info",
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
    })
  );
}

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    isProduction ? winston.format.json() : winston.format.simple()
  ),
  defaultMeta: {
    service: APP_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "attendpro",
  },
  transports,
});
