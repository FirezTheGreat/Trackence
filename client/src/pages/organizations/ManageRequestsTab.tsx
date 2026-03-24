import { useEffect, useState } from "react";
import type { OrgDetail } from "../../types/organizations.types";
import type { OrganizationInviteRecord } from "../../services/organization.service";
import { useModalStore } from "../../stores/modal.store";

interface JoinRequest {
    userId: string;
    name: string;
    email: string;
    role: string;
}

interface Props {
    manageableOrgs: OrgDetail[];
    pendingRequests: Record<string, JoinRequest[]>;
    invitesByOrg: Record<string, OrganizationInviteRecord[]>;
    isPlatformOwner: boolean;
    actionLoading: boolean;
    onApprove: (orgId: string, userId: string) => void;
    onReject: (orgId: string, userId: string) => void;
    onCreateInvite: (orgId: string, email?: string, userId?: string) => Promise<boolean>;
    onRevokeInvite: (orgId: string, token: string) => Promise<void>;
}

const ManageRequestsTab = ({
    manageableOrgs,
    pendingRequests,
    invitesByOrg,
    isPlatformOwner,
    actionLoading,
    onApprove,
    onReject,
    onCreateInvite,
    onRevokeInvite,
}: Props) => {
    const [copiedOrgId, setCopiedOrgId] = useState<string | null>(null);
    type InviteFilterType = "all" | "pending" | "accepted" | "rejected" | "expired" | "revoked";
    const [inviteFilters, setInviteFilters] = useState<Record<string, InviteFilterType>>({});
    const [invitePages, setInvitePages] = useState<Record<string, number>>({});
    
    const ITEMS_PER_PAGE = 3;

    const handleFilterChange = (orgId: string, filter: InviteFilterType) => {
        setInviteFilters(prev => ({ ...prev, [orgId]: filter }));
        setInvitePages(prev => ({ ...prev, [orgId]: 1 }));
    };

    const handlePageChange = (orgId: string, delta: number) => {
        setInvitePages(prev => ({ ...prev, [orgId]: (prev[orgId] || 1) + delta }));
    };

    useEffect(() => {
        if (!copiedOrgId) {
            return;
        }

        const timeout = window.setTimeout(() => {
            setCopiedOrgId(null);
        }, 1800);

        return () => window.clearTimeout(timeout);
    }, [copiedOrgId]);

    const handleCopyInviteLink = async (orgId: string) => {
        const copied = await onCreateInvite(orgId);
        if (copied) {
            setCopiedOrgId(orgId);
        }
    };

    return (
    <section className="flex flex-col gap-6">
        <div className="backdrop-blur-2xl bg-secondary/45 border border-white/10 rounded-2xl px-5 py-4">
            <p className="text-white font-semibold text-sm">Invite Management</p>
            <p className="text-white/55 text-xs mt-1">
                Public link is managed separately as one reusable org-wide link. Personal invites are listed below for email and user-targeted tracking.
            </p>
        </div>

        {manageableOrgs.length === 0 ? (
            <div className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl px-8 py-12 text-center">
                <span className="text-3xl block mb-4">📋</span>
                <h3 className="text-white font-semibold text-lg mb-2">No Organizations to Manage</h3>
                <p className="text-white/50 text-sm">
                    {isPlatformOwner
                        ? "Create an organization first to see join requests."
                        : "You need to be a member of an organization to manage requests."}
                </p>
            </div>
        ) : (
            manageableOrgs.map((org) => {
                const requests = pendingRequests[org.organizationId] || [];
                const invites = invitesByOrg[org.organizationId] || [];
                const publicInvites = invites.filter((invite) => !invite.invitedEmail && !invite.invitedUserId);
                const activePublicInvite = publicInvites.find(
                    (invite) => invite.status === "pending" || invite.status === "accepted"
                ) || null;
                const personalInvites = invites.filter((invite) => invite.invitedEmail || invite.invitedUserId);
                
                const currentFilter = inviteFilters[org.organizationId] || "all";
                const currentPage = invitePages[org.organizationId] || 1;
                
                const filteredInvites = currentFilter === "all"
                    ? personalInvites
                    : personalInvites.filter((invite) => invite.status === currentFilter);
                
                const totalPages = Math.ceil(filteredInvites.length / ITEMS_PER_PAGE) || 1;
                const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
                const visibleInvites = filteredInvites.slice(startIndex, startIndex + ITEMS_PER_PAGE);

                return (
                    <div
                        key={org.organizationId}
                        className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl px-6 py-6 shadow-lg shadow-black/10"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/25 flex items-center justify-center">
                                    <span className="text-lg">🏢</span>
                                </div>
                                <div>
                                    <h3 className="text-white font-semibold">{org.name}</h3>
                                    <p className="text-white/40 text-xs">{org.code} · {org.memberCount ?? 0} members</p>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 justify-end">
                                {requests.length > 0 && (
                                    <span className="px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/20 text-accent text-xs font-medium">
                                        {requests.length} pending
                                    </span>
                                )}
                                <button
                                    onClick={async () => {
                                        const email = await useModalStore.getState().prompt(
                                            "Email Invite",
                                            "Enter user email to send invite (leave blank to only create a custom link):",
                                            { placeholder: "user@example.com", confirmText: "Send Invite" }
                                        );
                                        if (email === null || !email.trim()) return;
                                        onCreateInvite(org.organizationId, email.trim());
                                    }}
                                    disabled={actionLoading}
                                    className="px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-white/80 text-sm font-medium hover:text-white hover:bg-white/10 transition cursor-pointer disabled:opacity-50"
                                >
                                    Email Invite
                                </button>
                                <button
                                    onClick={async () => {
                                        const userId = await useModalStore.getState().prompt(
                                            "Invite by ID",
                                            "Enter target user ID (invite email will be resolved automatically):",
                                            { placeholder: "User ID", confirmText: "Send Invite" }
                                        );
                                        if (userId === null || !userId.trim()) return;
                                        onCreateInvite(org.organizationId, undefined, userId.trim());
                                    }}
                                    disabled={actionLoading}
                                    className="px-4 py-2 rounded-lg border border-accent/30 bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition cursor-pointer disabled:opacity-50"
                                >
                                    Invite by ID
                                </button>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-5 mb-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                    <h4 className="text-white text-base font-medium">Public Invite Link</h4>
                                    <p className="text-white/50 text-xs mt-0.5">
                                        One reusable org-wide link. Create once, click again to copy. Revoke anytime to rotate.
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleCopyInviteLink(org.organizationId)}
                                        disabled={actionLoading}
                                        className="px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-white/80 text-sm font-medium hover:text-white hover:bg-white/10 transition cursor-pointer disabled:opacity-50"
                                    >
                                        {activePublicInvite
                                            ? (copiedOrgId === org.organizationId ? "Copied!" : "Copy Public Link")
                                            : "Create Public Link"}
                                    </button>
                                    {activePublicInvite && (
                                        <button
                                            onClick={() => onRevokeInvite(org.organizationId, activePublicInvite.token)}
                                            disabled={actionLoading}
                                            className="text-xs font-medium px-4 py-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50 transition disabled:opacity-50 cursor-pointer"
                                        >
                                            Revoke
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="mt-3 text-xs text-white/50">
                                {activePublicInvite ? (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-geist-mono bg-black/20 px-1.5 py-0.5 rounded text-[11px]">
                                            {activePublicInvite.token.slice(0, 8)}...{activePublicInvite.token.slice(-4)}
                                        </span>
                                        <span>•</span>
                                        <span>Status: {activePublicInvite.status}</span>
                                        <span>•</span>
                                        <span>Expires {new Date(activePublicInvite.expiresAt).toLocaleDateString()}</span>
                                        <span>•</span>
                                        <span>Uses {activePublicInvite.useCount}</span>
                                    </div>
                                ) : (
                                    <p>No active public link. Create one to enable open invite requests.</p>
                                )}
                            </div>
                        </div>

                        {requests.length === 0 ? (
                            <div className="bg-white/3 rounded-xl px-5 py-4 text-center mb-4">
                                <p className="text-white/30 text-sm">No pending join requests</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3 mb-4">
                                {requests.map((req) => (
                                    <div
                                        key={req.userId}
                                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3
                      bg-white/3 rounded-xl px-5 py-4"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                                                <span className="text-white/60 text-sm font-semibold">
                                                    {req.name.charAt(0).toUpperCase()}
                                                </span>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-white font-medium text-sm truncate">{req.name}</p>
                                                <p className="text-white/40 text-xs truncate">{req.email}</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap sm:flex-nowrap gap-3 shrink-0">
                                            <button
                                                onClick={() => onApprove(org.organizationId, req.userId)}
                                                disabled={actionLoading}
                                                className="px-5 py-2 rounded-xl border border-green-500/30 bg-green-500/10 text-green-400 text-sm font-medium hover:bg-green-500/20 transition cursor-pointer disabled:opacity-50 flex-1 sm:flex-none text-center"
                                            >
                                                Approve
                                            </button>
                                            <button
                                                onClick={() => onReject(org.organizationId, req.userId)}
                                                disabled={actionLoading}
                                                className="px-5 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-sm font-medium hover:bg-red-500/20 transition cursor-pointer disabled:opacity-50 flex-1 sm:flex-none text-center"
                                            >
                                                Reject
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-5 mt-4">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h4 className="text-white text-base font-medium">Personal Invites</h4>
                                    <p className="text-white/50 text-xs mt-0.5">Track targeted email and user-specific invites.</p>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2 mb-5">
                                {(["all", "pending", "accepted", "rejected", "expired", "revoked"] as const).map((key) => (
                                    <button
                                        key={key}
                                        onClick={() => handleFilterChange(org.organizationId, key)}
                                        className={`px-3.5 py-1.5 rounded-lg text-sm font-medium capitalize transition cursor-pointer border ${
                                            currentFilter === key
                                                ? "border-accent/40 bg-accent/10 text-accent shadow-sm"
                                                : "border-transparent bg-white/5 text-white/60 hover:text-white hover:bg-white/10"
                                        }`}
                                    >
                                        {key}
                                    </button>
                                ))}
                            </div>

                            {filteredInvites.length === 0 ? (
                                <div className="text-center py-6 bg-white/5 rounded-xl border border-white/5">
                                    <p className="text-white/40 text-sm">No invites found for this filter.</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {visibleInvites.map((invite) => (
                                        <div key={invite.token} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/[0.07] transition-colors">
                                            {(() => {
                                                const canRevoke = invite.status === "pending";

                                                const targetLabel = invite.invitedEmail
                                                    ? invite.invitedEmail
                                                    : invite.invitedUserName
                                                        ? `${invite.invitedUserName} (${invite.invitedUserId})`
                                                            : invite.invitedUserId
                                                                ? `User ID: ${invite.invitedUserId}`
                                                                : "Unknown Recipient";

                                                const createdByLabel = invite.createdByName || invite.createdByEmail || invite.createdBy || "Unknown";

                                                return (
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <p className="text-white text-sm font-medium truncate">
                                                            {targetLabel}
                                                        </p>
                                                        <span
                                                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                                                                invite.status === "accepted"
                                                                    ? "border-green-400/30 text-green-400 bg-green-400/10"
                                                                    : invite.status === "rejected"
                                                                        ? "border-rose-400/30 text-rose-300 bg-rose-500/10"
                                                                    : invite.status === "pending"
                                                                        ? "border-accent/30 text-accent bg-accent/10"
                                                                        : invite.status === "expired"
                                                                            ? "border-amber-400/30 text-amber-400 bg-amber-400/10"
                                                                            : "border-red-400/30 text-red-400 bg-red-400/10"
                                                            }`}
                                                        >
                                                            {invite.status.charAt(0).toUpperCase() + invite.status.slice(1)}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-3 text-white/40 text-xs">
                                                        <span className="font-geist-mono bg-black/20 px-1.5 py-0.5 rounded text-[11px]">
                                                            {invite.token.slice(0, 8)}...{invite.token.slice(-4)}
                                                        </span>
                                                        <span>•</span>
                                                        <span>Created {new Date(invite.createdAt).toLocaleDateString()}</span>
                                                        <span>•</span>
                                                        <span>Expires {new Date(invite.expiresAt).toLocaleDateString()}</span>
                                                        <span>•</span>
                                                        <span>By {createdByLabel}</span>
                                                        <span>•</span>
                                                        <span>Uses {invite.useCount}</span>
                                                        {invite.status === "rejected" && invite.rejectedAt && (
                                                            <>
                                                                <span>•</span>
                                                                <span>
                                                                    Rejected {new Date(invite.rejectedAt).toLocaleDateString()}
                                                                    {invite.rejectedByName ? ` by ${invite.rejectedByName}` : ""}
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="shrink-0 flex items-center">
                                                    {canRevoke && (
                                                        <button
                                                            onClick={() => onRevokeInvite(org.organizationId, invite.token)}
                                                            disabled={actionLoading}
                                                            className="text-xs font-medium px-4 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50 transition disabled:opacity-50 cursor-pointer"
                                                        >
                                                            Revoke
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                                );
                                            })()}
                                        </div>
                                    ))}

                                    {totalPages > 1 && (
                                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                                            <button 
                                                onClick={() => handlePageChange(org.organizationId, -1)} 
                                                disabled={currentPage === 1}
                                                className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white/70 text-sm font-medium hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                                            >
                                                Previous
                                            </button>
                                            <span className="text-white/50 text-xs font-medium">
                                                Page {currentPage} of {totalPages}
                                            </span>
                                            <button 
                                                onClick={() => handlePageChange(org.organizationId, 1)} 
                                                disabled={currentPage === totalPages}
                                                className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white/70 text-sm font-medium hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })
        )}
    </section>
    );
};

export default ManageRequestsTab;
