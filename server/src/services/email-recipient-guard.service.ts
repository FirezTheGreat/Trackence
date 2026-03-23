import SuppressedEmail from "../models/SuppressedEmail.model";

const normalizeEmail = (value: string): string => String(value || "").trim().toLowerCase();

export const filterSuppressedRecipientEmails = async (emails: string[]) => {
  const normalized = Array.from(new Set(emails.map(normalizeEmail).filter(Boolean)));
  if (normalized.length === 0) {
    return { allowed: [] as string[], suppressed: [] as string[] };
  }

  const suppressedDocs = await SuppressedEmail.find({
    email: { $in: normalized },
    active: true,
  })
    .select("email")
    .lean();

  const suppressedSet = new Set(suppressedDocs.map((doc: any) => normalizeEmail(doc.email)));
  const allowed = normalized.filter((email) => !suppressedSet.has(email));
  const suppressed = normalized.filter((email) => suppressedSet.has(email));

  return { allowed, suppressed };
};

export const upsertSuppressedRecipients = async (params: {
  emails: string[];
  reason?: string;
  source?: string;
  occurredAt?: Date;
  metadata?: Record<string, unknown>;
}) => {
  const emails = Array.from(new Set((params.emails || []).map(normalizeEmail).filter(Boolean)));
  if (emails.length === 0) return 0;

  const occurredAt = params.occurredAt || new Date();
  const reason = String(params.reason || "delivery_failure").trim();
  const source = String(params.source || "system").trim();

  const operations = emails.map((email) => ({
    updateOne: {
      filter: { email },
      update: {
        $set: {
          reason,
          source,
          active: true,
          lastEventAt: occurredAt,
          metadata: params.metadata || {},
        },
      },
      upsert: true,
    },
  }));

  const result = await SuppressedEmail.bulkWrite(operations);
  return Number(result.upsertedCount || 0) + Number(result.modifiedCount || 0);
};
