import { PlatformRole, UserRole } from "../models/User.model";

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: UserRole;
        platformRole: PlatformRole;
        organizationIds: string[];
        userOrgRoles: Array<{ organizationId: string; role: UserRole }>;
        currentOrganizationId?: string | null;
      };
      requestId?: string;
    }
  }
}
