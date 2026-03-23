import { apiFetch } from "./api";

type FetchOptions = RequestInit & {
    body?: BodyInit | Record<string, unknown> | null;
    skipAuth?: boolean;
};

const fetchJson = async <T>(path: string, options: FetchOptions = {}): Promise<T> => {
    const { skipAuth, ...rest } = options;
    const init: RequestInit = {
        ...rest,
        cache: "no-store",
    };

    if (rest.body && typeof rest.body !== "string") {
        init.body = JSON.stringify(rest.body);
    }

    return apiFetch<T>(path, {
        ...init,
        skipAuth,
    });
};

// ── Types ──

export interface Organization {
    organizationId: string;
    name: string;
    code: string;
    description: string;
    isActive: boolean;
    memberCount?: number;
    owner?: string;
    createdBy?: string;
    createdAt?: string;
}

export interface OrgMember {
    userId: string;
    name: string;
    email: string;
    role: string;
    adminStatus: string;
    createdAt: string;
    isOrgAdmin?: boolean; // Whether user is admin of this org
}

export interface MembersResponse {
    members: OrgMember[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

export interface OrganizationInviteInfo {
    token: string;
    organization: {
        organizationId: string;
        name: string;
        code: string;
        description?: string;
    };
    invite: {
        expiresAt: string;
        invitedEmail?: string | null;
        invitedUserId?: string | null;
    };
}

export interface OrganizationInviteRecord {
    token: string;
    invitedEmail?: string | null;
    invitedUserId?: string | null;
    createdBy: string;
    createdAt: string;
    expiresAt: string;
    revokedAt?: string | null;
    useCount: number;
    status: "pending" | "accepted" | "revoked" | "expired";
}

// ── API Functions ──

export const organizationAPI = {
    /**
     * Create a new organization
     */
    create: async (data: {
        name: string;
        code: string;
        description?: string;
    }): Promise<{ message: string; organization: Organization }> => {
        return fetchJson("/api/admin/organizations", {
            method: "POST",
            body: data as any,
        });
    },

    /**
      * List all organizations (platform super admin)
     */
    list: async (): Promise<{ organizations: Organization[] }> => {
        return fetchJson("/api/admin/organizations");
    },

    /**
     * Get single organization
     */
    get: async (orgId: string): Promise<{ organization: Organization }> => {
        return fetchJson(`/api/admin/organizations/${orgId}`);
    },

    /**
     * Update organization
     */
    update: async (
        orgId: string,
        data: { name?: string; description?: string; isActive?: boolean }
    ): Promise<{ message: string; organization: Organization }> => {
        return fetchJson(`/api/admin/organizations/${orgId}`, {
            method: "PUT",
            body: data as any,
        });
    },

    /**
     * List members of an org
     */
    listMembers: async (
        orgId: string,
        page = 1,
        limit = 20
    ): Promise<MembersResponse> => {
        return fetchJson(
            `/api/auth/organizations/${orgId}/members?page=${page}&limit=${limit}`
        );
    },

    /**
     * Add user to organization
     */
    addMember: async (
        orgId: string,
        userId: string
    ): Promise<{ message: string }> => {
        return fetchJson(`/api/admin/organizations/${orgId}/members`, {
            method: "POST",
            body: { userId } as any,
        });
    },

    /**
     * Remove user from organization
     */
    removeMember: async (
        orgId: string,
        userId: string
    ): Promise<{ message: string }> => {
        return fetchJson(`/api/admin/organizations/${orgId}/members/${userId}`, {
            method: "DELETE",
        });
    },

    /**
     * Get users not assigned to any organization
     */
    getUnassignedUsers: async (
        search = "",
        orgId?: string
    ): Promise<{ users: OrgMember[] }> => {
        const query = new URLSearchParams();
        if (search) query.set("search", search);
        const params = query.toString() ? `?${query.toString()}` : "";
        if (orgId) {
            return fetchJson(`/api/admin/organizations/${orgId}/users/unassigned${params}`);
        }
        return fetchJson(`/api/admin/organizations/users/unassigned${params}`);
    },

    /**
     * Get pending join requests for an organization
     */
    getPendingJoinRequests: async (
        orgId: string
    ): Promise<{ requests: OrgMember[]; organizationName: string }> => {
        return fetchJson(`/api/admin/organizations/${orgId}/join-requests`);
    },

    getInvites: async (
        orgId: string,
        limit = 20
    ): Promise<{ organizationId: string; invites: OrganizationInviteRecord[] }> => {
        return fetchJson(`/api/admin/organizations/${orgId}/invites?limit=${limit}`);
    },

    revokeInvite: async (orgId: string, token: string): Promise<{ message: string }> => {
        return fetchJson(`/api/admin/organizations/${orgId}/invites/${encodeURIComponent(token)}/revoke`, {
            method: "PATCH",
        });
    },

    createInvite: async (
        orgId: string,
        payload?: { email?: string; userId?: string; expiresInDays?: number }
    ): Promise<{
        message: string;
        invite: {
            token: string;
            inviteLink: string;
            invitedEmail?: string | null;
            invitedUserId?: string | null;
            expiresAt: string;
        };
    }> => {
        return fetchJson(`/api/admin/organizations/${orgId}/invites`, {
            method: "POST",
            body: (payload || {}) as any,
        });
    },

    /**
     * Approve a user's join request
     */
    approveJoinRequest: async (
        orgId: string,
        userId: string
    ): Promise<{ message: string }> => {
        return fetchJson(
            `/api/admin/organizations/${orgId}/join-requests/${userId}/approve`,
            { method: "PATCH" }
        );
    },

    /**
     * Reject a user's join request
     */
    rejectJoinRequest: async (
        orgId: string,
        userId: string
    ): Promise<{ message: string }> => {
        return fetchJson(
            `/api/admin/organizations/${orgId}/join-requests/${userId}/reject`,
            { method: "PATCH" }
        );
    },

    /**
     * Existing user requests to join/switch to another organization
     */
    requestOrganizationChange: async (
        organizationId: string
    ): Promise<{ message: string; requestedOrganizationIds: string[]; organizationIds: string[] }> => {
        return fetchJson(`/api/auth/request-organization`, {
            method: "POST",
            body: { organizationId } as any,
        });
    },

    getInviteByToken: async (token: string): Promise<OrganizationInviteInfo> => {
        return fetchJson(`/api/auth/org-invites/${encodeURIComponent(token)}`, {
            skipAuth: true,
        });
    },

    requestOrganizationViaInvite: async (token: string): Promise<{
        message: string;
        requestedOrganizationIds: string[];
        organizationIds: string[];
        organizationId: string;
    }> => {
        return fetchJson(`/api/auth/org-invites/${encodeURIComponent(token)}/request`, {
            method: "POST",
        });
    },

    acceptInvite: async (token: string): Promise<{
        message: string;
        organizationId: string;
        organizationIds: string[];
        requestedOrganizationIds: string[];
    }> => {
        // Backward-compatible alias: invite joins must always go through admin approval.
        return fetchJson(`/api/auth/org-invites/${encodeURIComponent(token)}/request`, {
            method: "POST",
        });
    },

    rejectInvite: async (token: string): Promise<{
        message: string;
        organizationId: string;
        requestedOrganizationIds: string[];
    }> => {
        return fetchJson(`/api/auth/org-invites/${encodeURIComponent(token)}/reject`, {
            method: "POST",
        });
    },

    /**
     * Cancel pending organization join request
     */
    cancelOrganizationRequest: async (
        organizationId: string
    ): Promise<{
        message: string;
        organizationIds: string[];
        requestedOrganizationIds: string[];
    }> => {
        return fetchJson(`/api/auth/cancel-organization-request`, {
            method: "POST",
            body: { organizationId } as any,
        });
    },

    /**
     * List all active organizations (public endpoint for browsing)
     */
    listPublicOrganizations: async (): Promise<{
        organizations: Array<{ organizationId: string; name: string; code: string }>;
    }> => {
        return fetchJson(`/api/auth/organizations`, {
            skipAuth: true,
        });
    },

    /**
     * Get current user's pending organization request IDs
     */
    getPendingOrganizationRequests: async (): Promise<{
        requestedOrganizationIds: string[];
    }> => {
        return fetchJson(`/api/auth/pending-organizations`);
    },

    /**
     * Promote a member to organization admin
     */
    promoteToAdmin: async (
        orgId: string,
        userId: string
    ): Promise<{ message: string }> => {
        return fetchJson(`/api/admin/organizations/${orgId}/members/${userId}/promote`, {
            method: "PATCH",
        });
    },

    /**
     * Demote a member from organization admin
     */
    demoteFromAdmin: async (
        orgId: string,
        userId: string
    ): Promise<{ message: string }> => {
        return fetchJson(`/api/admin/organizations/${orgId}/members/${userId}/demote`, {
            method: "PATCH",
        });
    },

    /**
     * Leave organization (remove self)
     */
    leaveOrganization: async (
        orgId: string
    ): Promise<{ message: string; isOwner?: boolean; memberCount?: number; orgDeleted?: boolean }> => {
        return fetchJson(`/api/admin/organizations/${orgId}/leave`, {
            method: "POST",
        });
    },

    /**
     * Transfer organization ownership
     */
    transferOwnership: async (
        orgId: string,
        newOwnerId: string
    ): Promise<{ message: string }> => {
        return fetchJson(`/api/admin/organizations/${orgId}/transfer-owner`, {
            method: "PATCH",
            body: { newOwnerId } as any,
        });
    },

    /**
     * Delete organization
     */
    deleteOrganization: async (
        orgId: string
    ): Promise<{ message: string }> => {
        return fetchJson(`/api/admin/organizations/${orgId}`, {
            method: "DELETE",
        });
    },
};
