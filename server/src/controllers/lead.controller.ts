import { Request, Response } from "express";
import { sendMailNow } from "../services/mail-delivery.service";
import { isValidEmail } from "../utils/auth.utils";
import { logger } from "../utils/logger";

type LeadIntent = "free_pilot" | "book_demo";

const MAX_TEXT_LENGTH = 140;

const normalizeText = (value: unknown, maxLength = MAX_TEXT_LENGTH): string => {
    if (typeof value !== "string") return "";
    return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
};

const normalizeIntent = (value: unknown): LeadIntent => {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "book_demo") return "book_demo";
    return "free_pilot";
};

const resolveLeadRecipient = (): string | null => {
    const candidates = [
        process.env.LEADS_NOTIFICATION_EMAIL,
        process.env.SUPPORT_EMAIL,
    ];

    for (const candidate of candidates) {
        const normalized = String(candidate || "").trim().toLowerCase();
        if (normalized && isValidEmail(normalized)) {
            return normalized;
        }
    }

    return null;
};

const sanitizeStudentCount = (value: unknown): number | null => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;

    const integer = Math.floor(numeric);
    if (integer < 1 || integer > 500000) return null;
    return integer;
};

const maskEmail = (email: string): string => {
    const [localPart, domain] = email.split("@");
    if (!localPart || !domain) return "unknown";
    if (localPart.length <= 2) return `${localPart[0] || "*"}*@${domain}`;
    return `${localPart.slice(0, 2)}***@${domain}`;
};

const isValidPhoneOrWhatsapp = (value: string): boolean => {
    const normalized = value.replace(/[^\d+]/g, "");
    return /^\+?\d{10,15}$/.test(normalized);
};

export const submitLeadInquiry = async (req: Request, res: Response) => {
    try {
        const instituteName = normalizeText(req.body?.instituteName);
        const instituteType = normalizeText(req.body?.instituteType, 80);
        const contactPerson = normalizeText(req.body?.contactPerson);
        const phoneOrWhatsapp = normalizeText(req.body?.phoneOrWhatsapp, 24);
        const email = normalizeText(req.body?.email, 180).toLowerCase();
        const requestIntent = normalizeIntent(req.body?.requestIntent);
        const studentCount = sanitizeStudentCount(req.body?.studentCount);

        if (!instituteName || !instituteType || !contactPerson || !phoneOrWhatsapp || !email || !studentCount) {
            return res.status(400).json({
                message: "Please fill all required lead details.",
            });
        }

        if (!isValidEmail(email)) {
            return res.status(400).json({
                message: "Please provide a valid email address.",
            });
        }

        if (!isValidPhoneOrWhatsapp(phoneOrWhatsapp)) {
            return res.status(400).json({
                message: "Please provide a valid phone or WhatsApp number.",
            });
        }

        const recipient = resolveLeadRecipient();
        if (!recipient) {
            logger.error("Lead inquiry recipient is not configured.");
            return res.status(500).json({
                message: "Lead inbox is not configured. Please contact support.",
            });
        }

        const subjectPrefix = requestIntent === "book_demo" ? "Demo Request" : "Free Pilot Request";
        const subject = `[Trackence] ${subjectPrefix} from ${instituteName}`;
        const html = `
            <h2>${subjectPrefix}</h2>
            <p>A new institutional lead was submitted from the Trackence landing page.</p>
            <ul>
                <li><strong>Institute Name:</strong> ${instituteName}</li>
                <li><strong>Institute Type:</strong> ${instituteType}</li>
                <li><strong>Student Count:</strong> ${studentCount}</li>
                <li><strong>Contact Person:</strong> ${contactPerson}</li>
                <li><strong>Phone / WhatsApp:</strong> ${phoneOrWhatsapp}</li>
                <li><strong>Email:</strong> ${email}</li>
                <li><strong>Request Type:</strong> ${requestIntent === "book_demo" ? "Book Demo" : "Request Free Pilot"}</li>
            </ul>
        `;

        const text = [
            `${subjectPrefix}`,
            `Institute Name: ${instituteName}`,
            `Institute Type: ${instituteType}`,
            `Student Count: ${studentCount}`,
            `Contact Person: ${contactPerson}`,
            `Phone / WhatsApp: ${phoneOrWhatsapp}`,
            `Email: ${email}`,
            `Request Type: ${requestIntent === "book_demo" ? "Book Demo" : "Request Free Pilot"}`,
        ].join("\n");

        await sendMailNow({
            to: [recipient],
            subject,
            html,
            text,
            fromCategory: "notification",
        });

        logger.info("Lead inquiry submitted", {
            requestId: req.requestId,
            requestIntent,
            instituteName,
            instituteType,
            studentCount,
            email: maskEmail(email),
        });

        return res.status(201).json({
            message: "Thanks! Our team will contact you within 24 hours.",
        });
    } catch (error) {
        logger.error("Lead inquiry submission failed", {
            requestId: req.requestId,
            error: error instanceof Error ? error.message : String(error),
        });

        return res.status(500).json({
            message: "Failed to submit request. Please try again.",
        });
    }
};