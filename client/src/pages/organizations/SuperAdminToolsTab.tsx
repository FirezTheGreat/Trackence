import type { OrgDetail } from "../../types/organizations.types";

interface Props {
    orgs: OrgDetail[];
    userOrgIds: string[];
    actionLoading: boolean;
    onManageMembers: (org: OrgDetail) => void;
    onToggleActive: (org: OrgDetail) => void;
    onDelete: (org: OrgDetail) => void;
    onJoin: (orgId: string) => void;
}

const SuperAdminToolsTab = ({
    orgs,
    userOrgIds,
    actionLoading,
    onManageMembers,
    onToggleActive,
    onDelete,
    onJoin,
}: Props) => (
    <section className="flex flex-col gap-6">
        {orgs.length === 0 ? (
            <div className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl px-8 py-12 text-center">
                <span className="text-3xl block mb-4">🧰</span>
                <h3 className="text-white font-semibold text-lg mb-2">No Organizations Found</h3>
                <p className="text-white/50 text-sm">
                    Create your first organization to manage it here.
                </p>
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {orgs.map((org) => {
                    const isMember = userOrgIds.includes(org.organizationId);
                    return (
                        <div
                            key={org.organizationId}
                            className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl px-6 py-6 shadow-lg shadow-black/10
                flex flex-col h-full"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-white font-semibold text-lg truncate">{org.name}</h3>
                                    <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-white/8 text-white/50 text-xs font-mono">
                                        {org.code}
                                    </span>
                                    <p className="text-white/50 text-sm mt-2 line-clamp-2 min-h-10">
                                        {org.description || "No description available"}
                                    </p>
                                </div>
                                {isMember && (
                                    <span className="shrink-0 px-2.5 py-1 rounded-full bg-accent/20 text-accent text-xs font-semibold">
                                        Member
                                    </span>
                                )}
                            </div>

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
                                    <p className="text-white/40 text-[10px] uppercase tracking-wider">Owner</p>
                                    <p className="text-white font-semibold text-xs mt-1 truncate">{org.owner || "—"}</p>
                                </div>
                            </div>

                            <div className="flex gap-2 mt-auto pt-4 flex-wrap">
                                <button
                                    onClick={() => onManageMembers(org)}
                                    className="px-4 py-2 rounded-lg border border-accent/40 text-accent text-xs
                    font-semibold hover:bg-accent/10 transition cursor-pointer"
                                >
                                    👥 Manage Members
                                </button>
                                {!isMember && (
                                    <button
                                        onClick={() => onJoin(org.organizationId)}
                                        disabled={actionLoading}
                                        className="px-4 py-2 rounded-lg border border-green-400/40 text-green-400 text-xs
                      font-semibold hover:bg-green-400/10 transition cursor-pointer disabled:opacity-50"
                                    >
                                        + Join
                                    </button>
                                )}
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
                            </div>
                        </div>
                    );
                })}
            </div>
        )}
    </section>
);

export default SuperAdminToolsTab;
