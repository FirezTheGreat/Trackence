import nodemailer from "nodemailer";
import { Resend } from "resend";
import { APP_NAME } from "../config/env";

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
};

type EmailProvider = "smtp" | "resend" | "mock";

const getEmailProvider = (): EmailProvider => {
  const provider = String(process.env.EMAIL_PROVIDER || "smtp").trim().toLowerCase();
  if (provider === "resend") return "resend";
  if (provider === "mock") return "mock";
  return "smtp";
};

const getFromAddress = (): string => {
  const configuredFrom = String(process.env.EMAIL_FROM || "").trim();
  if (configuredFrom) return configuredFrom;

  if (process.env.SMTP_USER) return process.env.SMTP_USER;
  throw new Error("EMAIL_FROM (or SMTP_USER for SMTP mode) is not configured.");
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
  const from = getFromAddress();
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
    from: `"${APP_NAME}" <${getFromAddress()}>`,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text || undefined,
    attachments: attachments.length ? attachments : undefined,
  });
};

export const sendMailNow = async (payload: MailPayload): Promise<void> => {
  const recipients = Array.from(
    new Set(payload.to.map((email) => String(email || "").trim().toLowerCase()).filter(Boolean))
  );

  if (recipients.length === 0) {
    throw new Error("Recipient list is empty.");
  }

  const normalizedPayload: MailPayload = {
    ...payload,
    to: recipients,
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
