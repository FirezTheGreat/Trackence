import { Request, Response } from "express";
import { Webhook } from "svix";
import { upsertSuppressedRecipients } from "../services/email-recipient-guard.service";

const normalizeEmail = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
};

const collectRecipientEmails = (event: any): string[] => {
    const rawCandidates: unknown[] = [];

    const pushCandidate = (candidate: unknown) => {
        if (candidate == null) return;
        if (Array.isArray(candidate)) {
            candidate.forEach(pushCandidate);
            return;
        }
        rawCandidates.push(candidate);
    };

    pushCandidate(event?.to);
    pushCandidate(event?.recipient);
    pushCandidate(event?.email);
    pushCandidate(event?.data?.to);
    pushCandidate(event?.data?.recipient);
    pushCandidate(event?.data?.email);

    return Array.from(
        new Set(
            rawCandidates
                .map((candidate) => {
                    if (typeof candidate === "string") return normalizeEmail(candidate);
                    if (typeof candidate === "object" && candidate) {
                        const maybeEmail = (candidate as any).email;
                        return normalizeEmail(maybeEmail);
                    }
                    return null;
                })
                .filter((value): value is string => Boolean(value))
        )
    );
};

const isSuppressibleEvent = (eventType: string): boolean => {
    const normalized = String(eventType || "").trim().toLowerCase();
    return ["bounce", "bounced", "complaint", "complained", "suppressed", "delivery.failed", "email.bounced"]
        .some((token) => normalized.includes(token));
};

const getHeaderValue = (value: string | string[] | undefined): string => {
    if (Array.isArray(value)) return String(value[0] || "").trim();
    return String(value || "").trim();
};

const getRawPayload = (body: unknown): string => {
    if (Buffer.isBuffer(body)) {
        return body.toString("utf-8");
    }

    if (typeof body === "string") {
        return body;
    }

    return JSON.stringify(body || {});
};

const verifyWebhookSignature = (req: Request): any | null => {
    const configuredSecret = String(process.env.RESEND_WEBHOOK_SECRET || "").trim();
    if (!configuredSecret) {
        return req.body;
    }

    const svixId = getHeaderValue(req.headers["svix-id"] as string | string[] | undefined);
    const svixTimestamp = getHeaderValue(req.headers["svix-timestamp"] as string | string[] | undefined);
    const svixSignature = getHeaderValue(req.headers["svix-signature"] as string | string[] | undefined);

    if (!svixId || !svixTimestamp || !svixSignature) {
        return null;
    }

    const rawPayload = getRawPayload(req.body);
    const webhook = new Webhook(configuredSecret);

    try {
        return webhook.verify(rawPayload, {
            "svix-id": svixId,
            "svix-timestamp": svixTimestamp,
            "svix-signature": svixSignature,
        }) as any;
    } catch {
        return null;
    }
};

export const handleResendWebhook = async (req: Request, res: Response) => {
    try {
        const verifiedPayload = verifyWebhookSignature(req);
        if (!verifiedPayload) {
            return res.status(401).json({ message: "Invalid webhook signature." });
        }

        const payload = verifiedPayload;
        const events = Array.isArray(payload) ? payload : [payload];

        let suppressedCount = 0;
        for (const event of events) {
            const eventType = String(event?.type || event?.event || "unknown");
            if (!isSuppressibleEvent(eventType)) continue;

            const recipients = collectRecipientEmails(event);
            if (recipients.length === 0) continue;

            const count = await upsertSuppressedRecipients({
                emails: recipients,
                reason: eventType,
                source: "resend_webhook",
                occurredAt: new Date(event?.created_at || event?.createdAt || Date.now()),
                metadata: {
                    provider: "resend",
                    eventType,
                },
            });

            suppressedCount += count;
        }

        return res.status(200).json({ ok: true, suppressedCount });
    } catch (error) {
        console.error("[Webhook] Resend processing failed:", error);
        return res.status(500).json({ message: "Webhook processing failed." });
    }
};
