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

    const query: any = { organizationId };
    if (eventType) query.eventType = eventType;
    if (status) query.status = status;

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
