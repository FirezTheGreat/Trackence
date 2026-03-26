import { Request, Response } from "express";
import EmailNotification from "../models/EmailNotification.model";

const resolveOrganizationId = (req: Request): string | null => {
  const queryOrgId = typeof req.query.orgId === "string" ? req.query.orgId : null;
  return queryOrgId || req.user?.currentOrganizationId || req.user?.organizationIds?.[0] || null;
};

export const getNotificationHistory = async (req: Request, res: Response) => {
  try {
    const organizationId = resolveOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ message: "Organization context is required." });
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const eventType = typeof req.query.eventType === "string" ? req.query.eventType.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom.trim() : "";
    const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo.trim() : "";

    const query: any = { organizationId };
    if (eventType) query.eventType = eventType;
    if (status && status !== "all") query.status = status;

    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) {
        const fromDate = new Date(`${dateFrom}T00:00:00.000Z`);
        if (!Number.isNaN(fromDate.getTime())) {
          query.createdAt.$gte = fromDate;
        }
      }
      if (dateTo) {
        const toDate = new Date(`${dateTo}T23:59:59.999Z`);
        if (!Number.isNaN(toDate.getTime())) {
          query.createdAt.$lte = toDate;
        }
      }

      if (Object.keys(query.createdAt).length === 0) {
        delete query.createdAt;
      }
    }

    if (search) {
      const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [
        { subject: searchRegex },
        { recipients: searchRegex },
        { sessionId: searchRegex },
        { eventType: searchRegex },
      ];
    }

    const [items, total] = await Promise.all([
      EmailNotification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      EmailNotification.countDocuments(query),
    ]);

    const data = items.map((item: any) => ({
      notificationId: item.notificationId,
      eventType: item.eventType,
      sessionId: item.sessionId,
      recipients: item.recipients,
      recipientCount: Array.isArray(item.recipients) ? item.recipients.length : 0,
      subject: item.subject,
      status: item.status,
      sentAt: item.sentAt,
      lastError: item.lastError,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    return res.json({
      items: data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error("[Notification History] Error:", error);
    return res.status(500).json({ message: "Failed to fetch notification history." });
  }
};
