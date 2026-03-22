import { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger";

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    message: "Route not found",
    path: req.originalUrl,
    requestId: req.requestId,
  });
};

export const globalErrorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  logger.error("Unhandled server error", {
    requestId: req.requestId,
    path: req.originalUrl,
    method: req.method,
    message: err.message,
    stack: err.stack,
  });

  res.status(500).json({
    message: "Internal server error",
    requestId: req.requestId,
  });
};
