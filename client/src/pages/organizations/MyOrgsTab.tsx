import type { OrgDetail, PublicOrg } from "../../types/organizations.types";
import { useModalStore } from "../../stores/modal.store";
import { Link } from "react-router-dom";

interface Props {
    currentOrgs: OrgDetail[];
    pendingOrgs: PublicOrg[];
    userOrgIds: string[];
    userAdminOrgIds: string[];
    actionLoading: boolean;
    onLeave: (org: OrgDetail) => void;
    onManageMembers: (org: OrgDetail) => void;
    onToggleActive: (org: OrgDetail) => void;
    onDelete: (org: OrgDetail) => void;
}

const MyOrgsTab = ({
    currentOrgs,
    pendingOrgs,
    userOrgIds,
    userAdminOrgIds,
    actionLoading,
    onLeave,
    onManageMembers,
    onToggleActive,
    onDelete,
}: Props) => (
    <section className="flex flex-col gap-6">
        {currentOrgs.length === 0 ? (
            <div className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl px-8 py-12 text-center flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                    <span className="text-3xl">🏢</span>
                </div>
                <h3 className="text-white font-semibold text-lg mb-2">No Organizations</h3>
                <p className="text-white/50 text-sm max-w-md mb-6">
                    You are not currently a member of any organization. Create a new one or join an existing organization to get started.
                </p>
                <div className="flex gap-4">
                    <Link
                        to="/organizations/create"
                        className="px-6 py-2 rounded-xl bg-accent text-primary font-bold hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] transition-all cursor-pointer text-sm"
                    >
                        Create Organization
                    </Link>
                    <Link
                        to="/organizations/join"
                        className="px-6 py-2 rounded-xl bg-white/5 border border-white/10 text-white font-bold hover:bg-white/10 transition-colors cursor-pointer text-sm"
                    >
                        Join Organization
                    </Link>
                </div>
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentOrgs.map((org) => {
                    const isMember = userOrgIds.includes(org.organizationId);
                    const isOrgAdmin = userAdminOrgIds.includes(org.organizationId);
                    const canManageOrg = isOrgAdmin;
                    const orgRoleLabel = isOrgAdmin ? "admin" : "member";
                    return (
                        <div
                            key={org.organizationId}
                            className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl px-6 py-6 shadow-lg shadow-black/10
              flex flex-col h-full"
                        >
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-accent/15 border border-accent/30 flex items-center justify-center shrink-0">
                                    <span className="text-xl">🏢</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-white font-bold text-lg truncate">{org.name}</h3>
                                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                                        <span className="inline-block px-2 py-0.5 rounded-md bg-white/8 text-white/50 text-xs font-mono">
                                            {org.code}
                                        </span>
                                        <span className="inline-block px-2 py-0.5 rounded-md bg-white/8 text-white/50 text-[11px] font-mono">
                                            ID: {org.organizationId}
                                        </span>
                                    </div>
                                    <p className="text-white/50 text-sm mt-2 line-clamp-2 min-h-10">
                                        {org.description || "No description available"}
                                    </p>
                                </div>
                            </div>

                            {/* Org stats */}
                            <div className="grid grid-cols-3 gap-3 mt-5">
                                <div className="bg-white/5 rounded-xl px-3 py-2.5 text-center">
                                    <p className="text-white/40 text-[10px] uppercase tracking-wider">Status</p>
                                    <p className={`text-sm font-semibold mt-0.5 ${org.isActive ? "text-green-400" : "text-red-400"}`}>
                                        {org.isActive ? "Active" : "Inactive"}
                                    </p>
                                </div>
                                <div className="bg-white/5 rounded-xl px-3 py-2.5 text-center">
                                    <p className="text-white/40 text-[10px] uppercase tracking-wider">Members</p>
                                    <p className="text-white font-semibold text-sm mt-0.5">{org.memberCount ?? "—"}</p>
                                </div>
                                <div className="bg-white/5 rounded-xl px-3 py-2.5 text-center">
                                    <p className="text-white/40 text-[10px] uppercase tracking-wider">Your Role</p>
                                    <p className="text-white font-semibold text-sm mt-0.5 capitalize">
                                        {orgRoleLabel}
                                    </p>
                                </div>
                            </div>

                            {/* Actions — always pinned to bottom */}
                            <div className="flex gap-2 mt-auto pt-4 flex-wrap">
                                {isMember && (
                                    <button
                                        onClick={() => onManageMembers(org)}
                                        className="px-4 py-2 rounded-lg border border-accent/40 text-accent text-xs
                    font-semibold hover:bg-accent/10 transition cursor-pointer"
                                    >
                                        {canManageOrg ? "👥 Manage Members" : "👥 View Members"}
                                    </button>
                                )}
                                {isMember && (
                                    <button
                                        onClick={async () => {
                                            const confirmed = await useModalStore.getState().confirm(
                                                "Leave Organization",
                                                `Are you sure you want to leave "${org.name}"?`
                                            );
                                            if (confirmed) onLeave(org);
                                        }}
                                        disabled={actionLoading}
                                        className="px-4 py-2 rounded-lg border border-red-400/40 text-red-400 text-xs
                    font-semibold hover:bg-red-400/10 transition cursor-pointer disabled:opacity-50"
                                    >
                                        Leave
                                    </button>
                                )}
                                {canManageOrg && (
                                    <>
                                        <button
                                            onClick={() => onToggleActive(org)}
                                            disabled={actionLoading}
                                            className={`px-4 py-2 rounded-lg border text-xs font-semibold transition
                      cursor-pointer disabled:opacity-50
                      ${org.isActive
                                                    ? "border-amber-400/40 text-amber-400 hover:bg-amber-400/10"
                                                    : "border-green-400/40 text-green-400 hover:bg-green-400/10"
                                                }`}
                                        >
                                            {org.isActive ? "Deactivate" : "Activate"}
                                        </button>
                                        <button
                                            onClick={() => onDelete(org)}
                                            disabled={actionLoading}
                                            className="px-4 py-2 rounded-lg border border-red-400/40 text-red-400 text-xs
                      font-semibold hover:bg-red-400/10 transition cursor-pointer disabled:opacity-50"
                                        >
                                            🗑️ Delete
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        )}

        {/* Pending requests info */}
        {pendingOrgs.length > 0 && (
            <div className="backdrop-blur-2xl bg-amber-500/8 border border-amber-400/20 rounded-2xl px-6 py-5">
                <div className="flex items-center gap-3 mb-3">
                    <span className="text-amber-400">⏳</span>
                    <h4 className="text-amber-300 font-semibold text-sm">Pending Join Requests</h4>
                </div>
                {pendingOrgs.map((pOrg) => (
                    <p key={pOrg.organizationId} className="text-white/60 text-sm ml-8 mb-1">
                        You have requested to join{" "}
                        <span className="text-white font-semibold">{pOrg.name}</span>. An admin will review your request.
                    </p>
                ))}
            </div>
        )}
    </section>
);

export default MyOrgsTab;
