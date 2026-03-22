export type NotificationDefaults = {
  recipients: string[];
  includeSelf: boolean;
  sendSessionEndEmail: boolean;
  sendAbsenceEmail: boolean;
  attachReport: boolean;
};

export type SessionNotificationOptions = {
  recipients: string[];
  includeCreator: boolean;
  useOrgDefaultRecipients: boolean;
  sendSessionEndEmail: boolean;
  sendAbsenceEmail: boolean;
  attachReport: boolean;
  inheritedDefaultRecipients: string[];
  inheritedOrgDefaultRecipients: string[];
};

export type OrganizationNotificationDefaults = {
  recipients: string[];
  sendSessionEndEmail: boolean;
  sendAbsenceEmail: boolean;
  attachReport: boolean;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const MAX_RECIPIENTS = 30;

const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return EMAIL_REGEX.test(normalized) ? normalized : null;
};

export const normalizeRecipientList = (values: unknown): string[] => {
  if (!Array.isArray(values)) return [];

  const deduped = new Set<string>();
  for (const item of values) {
    const email = normalizeEmail(item);
    if (email) deduped.add(email);
    if (deduped.size >= MAX_RECIPIENTS) break;
  }

  return Array.from(deduped);
};

const asBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

export const getNotificationDefaults = (user: any): NotificationDefaults => {
  const source = user?.notificationDefaults || {};
  const attachReportValue = source.attachReport ?? source.attachCsv;

  return {
    recipients: normalizeRecipientList(source.recipients),
    includeSelf: asBoolean(source.includeSelf, true),
    sendSessionEndEmail: asBoolean(source.sendSessionEndEmail, true),
    sendAbsenceEmail: asBoolean(source.sendAbsenceEmail, true),
    attachReport: asBoolean(attachReportValue, true),
  };
};

export const getOrganizationNotificationDefaults = (organization: any): OrganizationNotificationDefaults => {
  const source = organization?.notificationDefaults || {};
  const attachReportValue = source.attachReport ?? source.attachCsv;
  return {
    recipients: normalizeRecipientList(source.recipients),
    sendSessionEndEmail: asBoolean(source.sendSessionEndEmail, true),
    sendAbsenceEmail: asBoolean(source.sendAbsenceEmail, true),
    attachReport: asBoolean(attachReportValue, true),
  };
};

export const buildSessionNotificationOptions = (params: {
  bodyNotification: any;
  creatorEmail?: string | null;
  defaults: NotificationDefaults;
  organizationDefaults?: OrganizationNotificationDefaults;
}): SessionNotificationOptions => {
  const { bodyNotification, creatorEmail, defaults, organizationDefaults } = params;

  const incoming = bodyNotification || {};
  const useDefaultRecipients = asBoolean(incoming.useDefaultRecipients, true);
  const useOrgDefaultRecipients = asBoolean(incoming.useOrgDefaultRecipients, true);
  const includeCreator = asBoolean(incoming.includeCreator, defaults.includeSelf);

  const directRecipients = normalizeRecipientList(incoming.recipients);
  const defaultRecipients = useDefaultRecipients ? defaults.recipients : [];
  const orgDefaultRecipients = useOrgDefaultRecipients
    ? normalizeRecipientList(organizationDefaults?.recipients || [])
    : [];

  const merged = new Set<string>([
    ...defaultRecipients,
    ...orgDefaultRecipients,
    ...directRecipients,
  ]);

  const normalizedCreator = normalizeEmail(creatorEmail || null);
  if (includeCreator && normalizedCreator) {
    merged.add(normalizedCreator);
  }

  return {
    recipients: Array.from(merged).slice(0, MAX_RECIPIENTS),
    includeCreator,
    useOrgDefaultRecipients,
    sendSessionEndEmail: asBoolean(
      incoming.sendSessionEndEmail,
      organizationDefaults?.sendSessionEndEmail ?? defaults.sendSessionEndEmail
    ),
    sendAbsenceEmail: asBoolean(
      incoming.sendAbsenceEmail,
      organizationDefaults?.sendAbsenceEmail ?? defaults.sendAbsenceEmail
    ),
    attachReport: asBoolean(
      incoming.attachReport ?? incoming.attachCsv,
      organizationDefaults?.attachReport ?? defaults.attachReport
    ),
    inheritedDefaultRecipients: defaultRecipients,
    inheritedOrgDefaultRecipients: orgDefaultRecipients,
  };
};
