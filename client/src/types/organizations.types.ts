export interface PublicOrg {
    organizationId: string;
    name: string;
    code: string;
    description?: string;
    isActive?: boolean;
    memberCount?: number;
    owner?: string;
}

export interface OrgDetail {
    organizationId: string;
    name: string;
    code: string;
    description: string;
    isActive: boolean;
    memberCount?: number;
    createdBy?: string;
    createdAt?: string;
    owner?: string;
}

export type TabKey = "current" | "manage" | "members" | "create" | "super";
