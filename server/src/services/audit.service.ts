import AuditLog from "../models/AuditLog.model";
import { logger } from "../utils/logger";

export type AuditAction =
  | "admin_approval"
  | "admin_rejection"
  | "session_created"
  | "session_updated"
  | "session_deleted"
  | "session_permanently_deleted"
  | "attendance_marked"
  | "absence_excused"
  | "manual_attendance_override"
  | "organization_created"
  | "organization_updated"
  | "user_added_to_org"
  | "user_removed_from_org"
  | "org_join_approved"
  | "org_join_rejected"
  | "member_promoted_to_admin"
  | "member_demoted_from_admin"
  | "member_left_org"
  | "org_ownership_transferred"
  | "org_deleted_by_owner"
  | "org_deleted"
  | "user_name_updated"
  | "user_preferences_updated";

export interface AuditLogOptions {
  action: AuditAction;
  performedBy: string;
  performedByName?: string | null | undefined;
  performedByEmail?: string | null | undefined;
  targetId?: string | null | undefined;
  targetResourceType?: "session" | "user" | "organization" | "absence" | "admin_request" | "unknown" | null | undefined;
  targetResourceName?: string | null | undefined;
  organizationId?: string | null | undefined;
  organizationName?: string | null | undefined;
  metadata?: Record<string, unknown> | null | undefined;
  details?: {
    affectedUsers?: string[];
    affectedUsersCount?: number;
    changesSummary?: string;
    sessionCode?: string;
    sessionStatus?: string;
    reason?: string;
    result?: string;
  } | null | undefined;
  ipAddress?: string | null | undefined;
  userAgent?: string | null | undefined;
}

/**
 * logAudit - Supports both new object format and legacy positional arguments
 * New: logAudit({ action, performedBy, ... })
 * Legacy (backward-compatible): logAudit("action", "userId", "targetId", metadata, "orgId")
 */
export function logAudit(
  options: AuditLogOptions | AuditAction,
  performedByLegacy?: string,
  targetIdLegacy?: string,
  metadataLegacy?: Record<string, unknown>,
  organizationIdLegacy?: string
): Promise<void> {
  // Handle new object format
  if (typeof options === "object" && "action" in options) {
    return logAuditObject(options);
  }

  // Handle legacy positional arguments - convert to new format
  if (typeof options === "string" && performedByLegacy) {
    return logAuditObject({
      action: options,
      performedBy: performedByLegacy,
      targetId: targetIdLegacy,
      metadata: metadataLegacy,
      organizationId: organizationIdLegacy,
    });
  }

  return Promise.resolve();
}

async function logAuditObject(options: AuditLogOptions): Promise<void> {
  try {
    const doc: Record<string, unknown> = {
      action: options.action,
      performedBy: options.performedBy,
      timestamp: new Date(),
    };

    // Add performer details
    if (options.performedByName) doc.performedByName = options.performedByName;
    if (options.performedByEmail) doc.performedByEmail = options.performedByEmail;

    // Add target details
    if (options.targetId != null) doc.targetId = options.targetId;
    if (options.targetResourceType) doc.targetResourceType = options.targetResourceType;
    if (options.targetResourceName) doc.targetResourceName = options.targetResourceName;

    // Add organization context
    if (options.organizationId != null) doc.organizationId = options.organizationId;
    if (options.organizationName) doc.organizationName = options.organizationName;

    // Add metadata & details
    if (options.metadata != null) doc.metadata = options.metadata;
    if (options.details) doc.details = options.details;

    // Add network info
    if (options.ipAddress) doc.ipAddress = options.ipAddress;
    if (options.userAgent) doc.userAgent = options.userAgent;

    await AuditLog.create(doc);
  } catch (err) {
    logger.error("Failed to write audit log", {
      action: options.action,
      performedBy: options.performedBy,
      targetId: options.targetId,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
