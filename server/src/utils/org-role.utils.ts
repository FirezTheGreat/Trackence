/**
 * Organization-Aware Role Utilities
 * 
 * Users have roles WITHIN each organization via userOrgRoles array
 * Role is determined by: { organizationId: "org-id", role: "admin" | "faculty" }
 */

export type OrgRole = "faculty" | "admin";

interface UserOrgRole {
  organizationId: string;
  role: "faculty" | "admin";
}

interface IUser {
  userId: string;
  organizationIds?: string[];
  userOrgRoles?: UserOrgRole[];
}

/**
 * Get user's role in a specific organization
 * 
 * @param user - The user object
 * @param organizationId - The organization context
 * @returns The user's role in that org ("faculty" or "admin"), or "faculty" if not found
 */
export function getUserOrgRole(user: IUser, organizationId: string): OrgRole {
  const orgRole = (user.userOrgRoles || []).find(
    (r) => r.organizationId === organizationId
  );
  return orgRole?.role || "faculty";
}

/**
 * Check if user is admin in a specific organization
 */
export function isOrgAdmin(user: IUser, organizationId: string): boolean {
  return getUserOrgRole(user, organizationId) === "admin";
}

/**
 * Check if user is a member of an organization
 */
export function isOrgMember(user: IUser, organizationId: string): boolean {
  return (user.organizationIds || []).includes(organizationId);
}

/**
 * Check if user has admin role in ANY organization
 */
export function hasAnyOrgAdmin(user: IUser): boolean {
  return (user.userOrgRoles || []).some((r) => r.role === "admin");
}

/**
 * Get all organizations where user is an admin
 */
export function getUserAdminOrgs(user: IUser): string[] {
  return (user.userOrgRoles || [])
    .filter((r) => r.role === "admin")
    .map((r) => r.organizationId);
}

/**
 * Get all organizations where user is a member
 */
export function getUserMemberOrgs(user: IUser): string[] {
  return user.organizationIds || [];
}
