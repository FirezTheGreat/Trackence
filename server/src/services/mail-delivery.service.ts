import nodemailer from "nodemailer";
import { Resend } from "resend";
import { APP_NAME } from "../config/env";
import { filterSuppressedRecipientEmails } from "./email-recipient-guard.service";

export type MailAttachment = {
  filename: string;
  content: string;
  contentType?: string;
  contentEncoding?: "base64";
};

export type MailPayload = {
  to: string[];
  subject: string;
  html: string;
  text?: string | null;
  attachments?: MailAttachment[];
  fromCategory?: "default" | "otp" | "report" | "notification";
};

type EmailProvider = "smtp" | "resend" | "mock";

const PERMANENT_RECIPIENT_ERROR_PATTERNS = [
  "invalid recipient",
  "invalid email",
  "recipient blocked",
  "recipient rejected",
  "suppressed",
  "does not exist",
  "mailbox unavailable",
];

const getEmailProvider = (): EmailProvider => {
  const provider = String(process.env.EMAIL_PROVIDER || "smtp").trim().toLowerCase();
  if (provider === "resend") return "resend";
  if (provider === "mock") return "mock";
  return "smtp";
};

const isValidRecipientEmail = (value: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value);
};

export const isPermanentRecipientDeliveryError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.toLowerCase();

  return PERMANENT_RECIPIENT_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern));
};

const resolveFromAddress = (category?: MailPayload["fromCategory"]): string => {
  const fromByCategory: Record<string, string> = {
    otp: String(process.env.EMAIL_FROM_OTP || "").trim(),
    report: String(process.env.EMAIL_FROM_REPORTS || "").trim(),
    default: String(process.env.EMAIL_FROM || "").trim(),
  };

  const requestedCategory = category || "default";
  const preferred = fromByCategory[requestedCategory];
  if (preferred) return preferred;

  if (fromByCategory.default) return fromByCategory.default;

  if (process.env.SMTP_USER) return process.env.SMTP_USER;
  throw new Error(
    "EMAIL_FROM is not configured. Set EMAIL_FROM (or category variants EMAIL_FROM_OTP / EMAIL_FROM_REPORTS)."
  );
};

const getTransporter = () =>
  nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

const sendViaResend = async (payload: MailPayload): Promise<void> => {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const resend = new Resend(apiKey);
  const from = resolveFromAddress(payload.fromCategory);
  const attachments = (payload.attachments || []).map((attachment) => ({
    filename: attachment.filename,
    content: attachment.content,
  }));

  const emailOptions: any = {
    from,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
  };

  if (payload.text) {
    emailOptions.text = payload.text;
  }

  if (attachments.length) {
    emailOptions.attachments = attachments;
  }

  const { error } = await resend.emails.send(emailOptions);

  if (error) {
    throw new Error(`Resend delivery failed: ${error.message}`);
  }
};

const sendViaSmtp = async (payload: MailPayload): Promise<void> => {
  if (!process.env.SMTP_USER) {
    throw new Error("SMTP_USER is not configured.");
  }

  const transporter = getTransporter();
  const attachments = (payload.attachments || []).map((attachment) => ({
    filename: attachment.filename,
    content: attachment.content,
    ...(attachment.contentType ? { contentType: attachment.contentType } : {}),
    ...(attachment.contentEncoding ? { encoding: attachment.contentEncoding } : {}),
  }));

  await transporter.sendMail({
    from: `"${APP_NAME}" <${resolveFromAddress(payload.fromCategory)}>` ,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text || undefined,
    attachments: attachments.length ? attachments : undefined,
  });
};

export const sendMailNow = async (payload: MailPayload): Promise<void> => {
  const normalizedRecipients = Array.from(
    new Set(payload.to.map((email) => String(email || "").trim().toLowerCase()).filter(Boolean))
  );

  const recipients = normalizedRecipients.filter(isValidRecipientEmail);
  const skippedRecipients = normalizedRecipients.filter((email) => !isValidRecipientEmail(email));

  if (skippedRecipients.length > 0) {
    console.warn("[Email] Skipping invalid recipients:", skippedRecipients);
  }

  if (recipients.length === 0) {
    throw new Error("No valid recipient email addresses available for delivery.");
  }

  const { allowed: deliverableRecipients, suppressed } = await filterSuppressedRecipientEmails(recipients);

  if (suppressed.length > 0) {
    console.warn("[Email] Skipping suppressed recipients:", suppressed);
  }

  if (deliverableRecipients.length === 0) {
    throw new Error("All recipients are suppressed due to previous delivery failures.");
  }

  const normalizedPayload: MailPayload = {
    ...payload,
    to: deliverableRecipients,
  };

  const provider = getEmailProvider();
  if (provider === "mock") {
    return;
  }

  if (provider === "resend") {
    await sendViaResend(normalizedPayload);
    return;
  }

  await sendViaSmtp(normalizedPayload);
};
