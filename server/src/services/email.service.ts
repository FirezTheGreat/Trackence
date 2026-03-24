import OTPService from "./otp.service";
import { enqueueEmailNotification } from "./notification-queue.service";
import { APP_NAME } from "../config/env";
import { isPermanentRecipientDeliveryError, sendMailNow } from "./mail-delivery.service";
import { isValidEmail, RESPONSE_MESSAGE } from "../utils/auth.utils";

const sendOtpToEmail = async (email: string, firstName: string): Promise<void> => {
    try {
        let otp;

        try {
            otp = await OTPService.generate(email);
        } catch (error: any) {
            throw new Error((error as Error).message);
        }

        await sendMailNow({
            to: [email],
            fromCategory: "otp",
          subject: `Verify your email - ${APP_NAME}`,
            html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Verification</title>
  <style>
    body {
      font-family: 'Outfit', 'Satoshi', 'Inter', 'Geist', 'Quicksand', 'Segoe UI', Roboto, sans-serif;
      background-color: #0d0c0c;
      color: #ffffff;
      margin: 0;
      padding: 20px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #111111;
      border-radius: 12px;
      padding: 40px;
      border: 1px solid #333333;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .logo {
      color: #EE441C;
      font-size: 28px;
      font-weight: bold;
      margin-bottom: 10px;
    }
    .title {
      color: #ffffff;
      font-size: 24px;
      margin-bottom: 10px;
    }
    .subtitle {
      color: #aaaaaa;
      font-size: 16px;
    }
    .verification-code {
      background-color: #1F1F1F;
      border: 2px solid #EE441C;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      margin: 30px 0;
    }
    .code {
      font-size: 32px;
      font-weight: bold;
      color: #EE441C;
      letter-spacing: 4px;
      font-family: 'JetBrains Mono', 'Geist Mono', 'Courier New', monospace;
    }
    .instructions {
      color: #CCCCCC;
      line-height: 1.6;
      margin: 20px 0;
    }
    .warning {
      background-color: #1F1F1F;
      border-left: 4px solid #EE441C;
      padding: 15px;
      margin: 20px 0;
      color: #FFAAAA;
    }
    .footer {
      text-align: center;
      color: #777777;
      font-size: 14px;
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #333333;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">${APP_NAME}</div>
      <h1 class="title">Email Verification</h1>
      <p class="subtitle">Hi ${firstName}, verify your email to access ${APP_NAME} securely.</p>
    </div>

    <div class="verification-code">
      <div class="code">${otp}</div>
    </div>

    <div class="instructions">
      <p><strong>Here's your verification code!</strong></p>
      <p>Enter this 6-digit code to verify your email address and continue onboarding on ${APP_NAME}.</p>
      <p><strong>This code will expire in ${OTPService.OTP_EXPIRY_MINS} minutes.</strong></p>
    </div>

    <div class="warning">
      <strong>Security Note:</strong> This code was requested for email verification on ${APP_NAME}. If you didn't request this, please ignore this email.
    </div>

    <div class="footer">
      <p>This email was sent to verify your account email address.</p>
      <p>${APP_NAME} - Secure and reliable attendance workflows.</p>
    </div>
  </div>
</body>
</html>
  `,
            text: `
${APP_NAME} - Email Verification

Hi ${firstName}!

Your verification code is: ${otp}

Enter this code to verify your email address and continue onboarding on ${APP_NAME}.

This code will expire in ${OTPService.OTP_EXPIRY_MINS} minutes.

If you didn't request this verification, please ignore this email.

${APP_NAME} - Secure and reliable attendance workflows.
  `,
    });
    } catch (error: any) {
      if (isPermanentRecipientDeliveryError(error)) {
        throw new Error(RESPONSE_MESSAGE.otp.undeliverable);
      }

        if (!error.message.includes("Too many OTP requests") && !error.message.includes("Too many incorrect attempts")) {
            console.error(`Failed to send OTP to ${email}:`, error);
        }

        throw new Error(error.message);
    }
};

type NotificationAttachment = {
  filename: string;
  content: Buffer | string;
  contentType?: string;
  contentEncoding?: "base64";
};

type NotificationPayload = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: NotificationAttachment[];
};

type NotificationOptions = {
  eventType?: string;
  requireEnqueued?: boolean;
  failSilently?: boolean;
};

const escapeHtml = (value: string) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildOrgDecisionEmailHtml = (params: {
  decision: "approved" | "rejected";
  userName: string;
  organizationName: string;
  organizationCode?: string | null;
  decidedByName?: string | null;
  decidedByEmail?: string | null;
  adminNote?: string | null;
}) => {
  const isApproved = params.decision === "approved";
  const title = isApproved ? "Organization Join Request Approved" : "Organization Join Request Update";
  const accent = isApproved ? "#16A34A" : "#DC2626";
  const badgeLabel = isApproved ? "APPROVED" : "REJECTED";
  const statusText = isApproved
    ? "Your request to join the organization has been approved."
    : "Your request to join the organization was not approved at this time.";
  const nextStep = isApproved
    ? "You can now sign in and switch to this organization from your account."
    : "You may submit a fresh request later or contact an organization administrator for clarification.";
  const orgText = params.organizationCode
    ? `${params.organizationName} (${params.organizationCode})`
    : params.organizationName;
  const reviewedBy = params.decidedByEmail
    ? `${params.decidedByName || "Organization Admin"} (${params.decidedByEmail})`
    : params.decidedByName || "Organization Admin";
  const hasNote = Boolean(params.adminNote && params.adminNote.trim().length > 0);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f6f7fb;font-family:'Segoe UI',Roboto,Arial,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
          <tr>
            <td style="padding:20px 24px;background:#111827;color:#ffffff;">
              <div style="font-size:18px;font-weight:700;letter-spacing:0.2px;">${escapeHtml(APP_NAME)}</div>
              <div style="margin-top:6px;font-size:13px;color:#cbd5e1;">Organization Membership Decision</div>
            </td>
          </tr>
          <tr>
            <td style="padding:26px 24px 18px;">
              <div style="display:inline-block;background:${accent};color:#ffffff;font-size:12px;font-weight:700;letter-spacing:0.5px;padding:6px 10px;border-radius:999px;">${badgeLabel}</div>
              <h1 style="margin:16px 0 8px;font-size:22px;line-height:1.3;color:#111827;">${title}</h1>
              <p style="margin:0;font-size:15px;line-height:1.7;color:#374151;">Hi ${escapeHtml(params.userName || "User")},</p>
              <p style="margin:12px 0 0;font-size:15px;line-height:1.7;color:#374151;">${statusText}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 6px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb;">
                <tr>
                  <td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;width:34%;">Organization</td>
                  <td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;font-weight:600;">${escapeHtml(orgText)}</td>
                </tr>
                <tr>
                  <td style="padding:14px 16px;font-size:13px;color:#6b7280;">Reviewed by</td>
                  <td style="padding:14px 16px;font-size:14px;color:#111827;">${escapeHtml(reviewedBy)}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 24px 6px;">
              <p style="margin:0;font-size:15px;line-height:1.7;color:#374151;">${nextStep}</p>
            </td>
          </tr>
          ${hasNote ? `
          <tr>
            <td style="padding:6px 24px 4px;">
              <div style="border:1px solid #f3f4f6;border-left:4px solid ${accent};border-radius:8px;background:#fcfcfd;padding:12px 14px;">
                <div style="font-size:12px;color:#6b7280;margin-bottom:6px;">Admin note</div>
                <div style="font-size:14px;line-height:1.6;color:#111827;white-space:pre-wrap;">${escapeHtml(params.adminNote || "")}</div>
              </div>
            </td>
          </tr>
          ` : ""}
          <tr>
            <td style="padding:20px 24px 24px;">
              <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6;">This is an automated notification from ${escapeHtml(APP_NAME)}. Please do not reply directly to this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

async function sendNotification(
  payload: NotificationPayload,
  options?: NotificationOptions
): Promise<string | null> {
    try {
    const recipientList = Array.isArray(payload.to)
      ? Array.from(new Set(payload.to.map((email) => String(email).trim().toLowerCase()).filter(Boolean)))
      : [String(payload.to).trim().toLowerCase()].filter(Boolean);

    const validRecipientList = recipientList.filter(isValidEmail);

    if (validRecipientList.length === 0) {
      if (options?.requireEnqueued) {
        throw new Error("No valid recipient email addresses available for notification delivery.");
      }
      return null;
    }

        const notificationId = await enqueueEmailNotification({
          eventType: options?.eventType || "generic_notification",
          to: validRecipientList,
          subject: payload.subject,
          html: payload.html,
          text: payload.text || null,
          attachments: (payload.attachments || []).map((attachment) => ({
            filename: attachment.filename,
            content: typeof attachment.content === "string" ? attachment.content : attachment.content.toString("utf-8"),
            contentType: attachment.contentType || null,
            contentEncoding: attachment.contentEncoding || null,
          })),
        });

        if (!notificationId && options?.requireEnqueued) {
          throw new Error("Notification delivery could not be queued. Please retry.");
        }

        return notificationId;
    } catch (err) {
      if (options?.failSilently === false) {
        throw err;
      }
      console.error("[Email] Notification failed:", err);
      return null;
    }
}

export async function sendAdminApprovalEmail(to: string, userName: string): Promise<void> {
    await sendNotification(
    {
      to,
      subject: `Admin access approved - ${APP_NAME}`,
      html: `<p>Hi ${userName},</p><p>Your admin access request has been approved. You can now log in and use admin features.</p><p>— ${APP_NAME}</p>`,
    }
    );
}

export async function sendAdminRejectionEmail(to: string, userName: string): Promise<void> {
  await sendNotification(
  {
    to,
    subject: `Admin access request update - ${APP_NAME}`,
    html: `<p>Hi ${userName},</p><p>Your admin access request has been reviewed and was not approved at this time.</p><p>You can continue using faculty features and may re-apply later.</p><p>— ${APP_NAME}</p>`,
  }
  );
}

export async function sendOrgJoinApprovalEmail(params: {
  to: string;
  userName: string;
  organizationName: string;
  organizationCode?: string | null;
  decidedByName?: string | null;
  decidedByEmail?: string | null;
  adminNote?: string | null;
}): Promise<void> {
  const subject = `Organization access approved - ${params.organizationName}`;
  const html = buildOrgDecisionEmailHtml({
    decision: "approved",
    userName: params.userName,
    organizationName: params.organizationName,
    ...(params.organizationCode !== undefined ? { organizationCode: params.organizationCode } : {}),
    ...(params.decidedByName !== undefined ? { decidedByName: params.decidedByName } : {}),
    ...(params.decidedByEmail !== undefined ? { decidedByEmail: params.decidedByEmail } : {}),
    ...(params.adminNote !== undefined ? { adminNote: params.adminNote } : {}),
  });

  const noteLine = params.adminNote && params.adminNote.trim().length > 0
    ? ` Admin note: ${params.adminNote.trim()}`
    : "";

  await sendNotification({
    to: params.to,
    subject,
    html,
    text: `Hi ${params.userName}, your request to join ${params.organizationName} has been approved.${noteLine}`,
  });
}

export async function sendOrgJoinRejectionEmail(params: {
  to: string;
  userName: string;
  organizationName: string;
  organizationCode?: string | null;
  decidedByName?: string | null;
  decidedByEmail?: string | null;
  adminNote?: string | null;
}): Promise<void> {
  const subject = `Organization access update - ${params.organizationName}`;
  const html = buildOrgDecisionEmailHtml({
    decision: "rejected",
    userName: params.userName,
    organizationName: params.organizationName,
    ...(params.organizationCode !== undefined ? { organizationCode: params.organizationCode } : {}),
    ...(params.decidedByName !== undefined ? { decidedByName: params.decidedByName } : {}),
    ...(params.decidedByEmail !== undefined ? { decidedByEmail: params.decidedByEmail } : {}),
    ...(params.adminNote !== undefined ? { adminNote: params.adminNote } : {}),
  });

  const noteLine = params.adminNote && params.adminNote.trim().length > 0
    ? ` Admin note: ${params.adminNote.trim()}`
    : "";

  await sendNotification({
    to: params.to,
    subject,
    html,
    text: `Hi ${params.userName}, your request to join ${params.organizationName} was not approved at this time.${noteLine}`,
  });
}

export async function sendOrganizationInviteEmail(params: {
  to: string;
  organizationName: string;
  organizationCode?: string | null;
  invitedByName?: string | null;
  invitedByEmail?: string | null;
  inviteLink: string;
  expiresAt: Date;
}): Promise<void> {
  const orgText = params.organizationCode
    ? `${params.organizationName} (${params.organizationCode})`
    : params.organizationName;
  const invitedBy = params.invitedByEmail
    ? `${params.invitedByName || "Organization Admin"} (${params.invitedByEmail})`
    : params.invitedByName || "Organization Admin";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Organization Invitation</title>
</head>
<body style="margin:0;padding:0;background:#f6f7fb;font-family:'Segoe UI',Roboto,Arial,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
          <tr>
            <td style="padding:20px 24px;background:#111827;color:#ffffff;">
              <div style="font-size:18px;font-weight:700;">${escapeHtml(APP_NAME)}</div>
              <div style="margin-top:6px;font-size:13px;color:#cbd5e1;">Organization Invite</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <h1 style="margin:0 0 10px;font-size:22px;color:#111827;">You are invited to join an organization</h1>
              <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#374151;">You have been invited to request access to <strong>${escapeHtml(orgText)}</strong> in ${escapeHtml(APP_NAME)}.</p>
              <p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#4b5563;">Invited by: ${escapeHtml(invitedBy)}</p>
              <a href="${escapeHtml(params.inviteLink)}" style="display:inline-block;background:#1f2937;color:#ffffff;text-decoration:none;padding:11px 16px;border-radius:10px;font-size:14px;font-weight:600;">Open Invite Link</a>
              <p style="margin:14px 0 0;font-size:12px;color:#6b7280;">This invite link expires on ${params.expiresAt.toUTCString()}.</p>
              <p style="margin:16px 0 0;font-size:12px;color:#6b7280;">If the button does not work, copy this URL: ${escapeHtml(params.inviteLink)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  await sendMailNow({
    to: [params.to],
    fromCategory: "notification",
    subject: `Invitation to join ${params.organizationName} - ${APP_NAME}`,
    html,
    text: `You were invited to request access to ${orgText}. Open: ${params.inviteLink}`,
  });
}

export async function sendOrgJoinRequestSubmittedEmail(params: {
  to: string;
  userName: string;
  organizationName: string;
  organizationCode?: string | null;
}): Promise<void> {
  const orgText = params.organizationCode
    ? `${params.organizationName} (${params.organizationCode})`
    : params.organizationName;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Join Request Submitted</title>
</head>
<body style="margin:0;padding:0;background:#f6f7fb;font-family:'Segoe UI',Roboto,Arial,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
          <tr>
            <td style="padding:20px 24px;background:#111827;color:#ffffff;">
              <div style="font-size:18px;font-weight:700;">${escapeHtml(APP_NAME)}</div>
              <div style="margin-top:6px;font-size:13px;color:#cbd5e1;">Join Request Received</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <h1 style="margin:0 0 10px;font-size:22px;color:#111827;">Request submitted successfully</h1>
              <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#374151;">Hi ${escapeHtml(params.userName || "User")}, your request to join <strong>${escapeHtml(orgText)}</strong> has been submitted.</p>
              <p style="margin:0;font-size:14px;line-height:1.7;color:#4b5563;">An organization admin will review your request. You will receive another email once it is approved or rejected.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  await sendNotification({
    to: params.to,
    subject: `Join request submitted - ${params.organizationName}`,
    html,
    text: `Hi ${params.userName}, your request to join ${orgText} has been submitted for admin review.`,
  });
}

export async function sendAbsenceDetectionEmail(
  to: string | string[],
  sessionId: string,
  absentCount: number,
  options?: {
    organizationId?: string | null;
    triggeredBy?: string | null;
    totalFaculty?: number;
    attended?: number;
    reportAttachment?: {
      filename: string;
      content: Buffer | string;
      contentType?: string;
      contentEncoding?: "base64";
    };
  }
): Promise<void> {
    const attachments = options?.reportAttachment
      ? [
        {
          filename: options.reportAttachment.filename,
          content: options.reportAttachment.content,
          contentType: options.reportAttachment.contentType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          contentEncoding: options.reportAttachment.contentEncoding,
        },
      ]
      : undefined;

    const totalFaculty = typeof options?.totalFaculty === "number" ? options.totalFaculty : null;
    const attended = typeof options?.attended === "number" ? options.attended : null;
    const summaryParts = [
      `<p>Total absent: <strong>${absentCount}</strong></p>`,
      totalFaculty !== null ? `<p>Total members: <strong>${totalFaculty}</strong></p>` : "",
      attended !== null ? `<p>Attended: <strong>${attended}</strong></p>` : "",
    ].join("");

    const recipients = Array.isArray(to) ? to : [to];
    await enqueueEmailNotification({
      eventType: "absence_detected",
      fromCategory: "report",
      organizationId: options?.organizationId || null,
      sessionId,
      triggeredBy: options?.triggeredBy || null,
      to: recipients,
      subject: `Absence detected - ${sessionId}`,
      html: `<p>Absence detection completed for <strong>${sessionId}</strong>.</p>${summaryParts}<p>— ${APP_NAME}</p>`,
      attachments: (attachments || []).map((attachment) => ({
        filename: attachment.filename,
        content: typeof attachment.content === "string"
          ? attachment.content
          : attachment.content.toString(attachment.contentEncoding === "base64" ? "base64" : "utf-8"),
        contentType: attachment.contentType || null,
        contentEncoding: attachment.contentEncoding || null,
      })),
      metadata: {
        absentCount,
        totalFaculty,
        attended,
      },
    });
}

export async function sendSessionSummaryToDirector(directorEmail: string, sessionId: string, summary: string): Promise<void> {
    await enqueueEmailNotification({
      eventType: "session_summary_director",
      fromCategory: "report",
      sessionId,
      to: [directorEmail],
      subject: `Session summary - ${sessionId}`,
      html: `<p>Session <strong>${sessionId}</strong> summary:</p><pre>${summary}</pre><p>— ${APP_NAME}</p>`,
      metadata: { summary },
    });
}

export async function sendSessionEndSummaryEmail(
  to: string | string[],
  sessionId: string,
  totalMarked: number,
  options?: {
    organizationId?: string | null;
    triggeredBy?: string | null;
    sessionDuration?: number;
    totalAbsent?: number;
    totalFaculty?: number;
    reportAttachment?: {
      filename: string;
      content: Buffer | string;
      contentType?: string;
      contentEncoding?: "base64";
    };
  }
): Promise<void> {
  const attachments = options?.reportAttachment
    ? [
      {
        filename: options.reportAttachment.filename,
        content: options.reportAttachment.content,
        contentType: options.reportAttachment.contentType || "text/csv",
        contentEncoding: options.reportAttachment.contentEncoding,
      },
    ]
    : undefined;

  const durationText = typeof options?.sessionDuration === "number"
    ? `<p>Duration: <strong>${options.sessionDuration} min</strong></p>`
    : "";
  const absentText = typeof options?.totalAbsent === "number"
    ? `<p>Total absent: <strong>${options.totalAbsent}</strong></p>`
    : "";
  const facultyText = typeof options?.totalFaculty === "number"
    ? `<p>Total members: <strong>${options.totalFaculty}</strong></p>`
    : "";

    const recipients = Array.isArray(to) ? to : [to];
    await enqueueEmailNotification({
      eventType: "session_ended",
      fromCategory: "report",
      organizationId: options?.organizationId || null,
      sessionId,
      triggeredBy: options?.triggeredBy || null,
      to: recipients,
      subject: `Session ended - ${sessionId}`,
      html: `<p>Session <strong>${sessionId}</strong> has ended.</p>${durationText}<p>Total attendance marked: <strong>${totalMarked}</strong></p>${absentText}${facultyText}<p>— ${APP_NAME}</p>`,
      attachments: (attachments || []).map((attachment) => ({
        filename: attachment.filename,
        content: typeof attachment.content === "string"
          ? attachment.content
          : attachment.content.toString(attachment.contentEncoding === "base64" ? "base64" : "utf-8"),
        contentType: attachment.contentType || null,
        contentEncoding: attachment.contentEncoding || null,
      })),
      metadata: {
        totalMarked,
        sessionDuration: options?.sessionDuration,
        totalAbsent: options?.totalAbsent,
        totalFaculty: options?.totalFaculty,
      },
    });
}

export async function sendEmailRecoveryRequestAlert(params: {
  supportEmail: string;
  currentEmail: string;
  requestedEmail: string;
  fullName?: string | null;
  reason?: string | null;
}): Promise<void> {
  const requestedBy = params.fullName && params.fullName.trim().length > 0
    ? `${params.fullName.trim()} (${params.currentEmail})`
    : params.currentEmail;

  await enqueueEmailNotification({
    eventType: "email_recovery_request",
    fromCategory: "notification",
    to: [params.supportEmail],
    subject: `Email recovery request - ${params.currentEmail}`,
    html: `<p>An account email recovery request was submitted.</p>
<p><strong>Current email:</strong> ${escapeHtml(params.currentEmail)}</p>
<p><strong>Requested new email:</strong> ${escapeHtml(params.requestedEmail)}</p>
<p><strong>Requester:</strong> ${escapeHtml(requestedBy)}</p>
${params.reason ? `<p><strong>Reason:</strong> ${escapeHtml(params.reason)}</p>` : ""}
<p>Please verify identity before applying any account email change.</p>
<p>— ${APP_NAME}</p>`,
    text: `Email recovery request\nCurrent email: ${params.currentEmail}\nRequested new email: ${params.requestedEmail}\nRequester: ${requestedBy}${params.reason ? `\nReason: ${params.reason}` : ""}`,
    metadata: {
      currentEmail: params.currentEmail,
      requestedEmail: params.requestedEmail,
      requesterName: params.fullName || null,
    },
  });
}

export default sendOtpToEmail;
