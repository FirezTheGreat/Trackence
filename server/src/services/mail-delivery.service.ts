import nodemailer from "nodemailer";
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

export const sendMailNow = async (payload: MailPayload): Promise<void> => {
  if (!process.env.SMTP_USER) {
    throw new Error("SMTP_USER is not configured.");
  }

  const recipients = Array.from(
    new Set(payload.to.map((email) => String(email || "").trim().toLowerCase()).filter(Boolean))
  );

  if (recipients.length === 0) {
    throw new Error("Recipient list is empty.");
  }

  const transporter = getTransporter();
  const attachments = (payload.attachments || []).map((attachment) => ({
    filename: attachment.filename,
    content: attachment.content,
    ...(attachment.contentType ? { contentType: attachment.contentType } : {}),
    ...(attachment.contentEncoding ? { encoding: attachment.contentEncoding } : {}),
  }));

  await transporter.sendMail({
    from: `"${APP_NAME}" <${process.env.SMTP_USER}>`,
    to: recipients,
    subject: payload.subject,
    html: payload.html,
    text: payload.text || undefined,
    attachments: attachments.length ? attachments : undefined,
  });
};
