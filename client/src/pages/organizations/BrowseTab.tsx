import type { PublicOrg } from "../../types/organizations.types";

interface Props {
    filteredOrgs: PublicOrg[];
    search: string;
    setSearch: (v: string) => void;
    userOrgIds: string[];
    userRequestedIds: string[];
    isPlatformOwner: boolean;
    inviteTokenInput: string;
    setInviteTokenInput: (v: string) => void;
    actionLoading: boolean;
    onRequestViaInvite: (tokenOrLink: string) => void;
}

const BrowseTab = ({
    filteredOrgs,
    search,
    setSearch,
    userOrgIds,
    userRequestedIds,
    isPlatformOwner,
    inviteTokenInput,
    setInviteTokenInput,
    actionLoading,
    onRequestViaInvite,
}: Props) => (
    <section className="flex flex-col gap-6">
        <div className="backdrop-blur-2xl bg-secondary/45 border border-white/15 rounded-2xl px-5 py-4">
            <p className="text-white font-semibold text-sm mb-2">Join via Invite Link</p>
            <p className="text-white/50 text-xs mb-3">
                Organization joins are invite-only. Paste the invite URL or token shared by an admin.
            </p>
            <p className="text-amber-300/90 text-xs font-medium mb-3">
                Approval required by org admin.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
                <input
                    type="text"
                    value={inviteTokenInput}
                    onChange={(e) => setInviteTokenInput(e.target.value)}
                    placeholder="https://.../auth/signup?invite=TOKEN or TOKEN"
                    className="flex-1 rounded-xl px-4 py-2.5 bg-secondary/45 border border-white/20
          text-white placeholder:text-white/30 text-sm focus:outline-none focus:border-accent/50"
                />
                <button
                    onClick={() => onRequestViaInvite(inviteTokenInput)}
                    disabled={actionLoading || !inviteTokenInput.trim()}
                    className="px-4 py-2.5 rounded-xl bg-accent/20 border border-accent/40 text-accent text-sm
          font-semibold hover:bg-accent/30 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {actionLoading ? "Submitting..." : "Request Join"}
                </button>
            </div>
        </div>

        {/* Search */}
        <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                </svg>
            </span>
            <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search organizations by name or code..."
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-secondary/45 border border-white/15
          text-white placeholder:text-white/30 text-sm
          focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20
          transition-all duration-200"
            />
        </div>

        {/* Orgs Grid */}
        {filteredOrgs.length === 0 ? (
            <div className="backdrop-blur-2xl bg-secondary/45 border border-white/10 rounded-2xl px-6 py-12 text-center">
                <p className="text-white/40 text-sm">
                    {search
                        ? "No organizations match your search."
                        : "No organizations exist yet. Please check back later or contact a platform owner."}
                </p>
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredOrgs.map((org) => {
                    const isCurrent = userOrgIds.includes(org.organizationId);
                    const isPending = userRequestedIds.includes(org.organizationId);

                    return (
                        <div
                            key={org.organizationId}
                            className={`backdrop-blur-2xl rounded-2xl px-6 py-5 shadow-lg shadow-black/10
                transition-all duration-300 flex flex-col h-full
                ${isCurrent
                                    ? "bg-accent/10 border-2 border-accent/40"
                                    : isPending
                                        ? "bg-amber-500/8 border border-amber-400/25"
                                        : "bg-secondary/45 border border-white/15 hover:border-white/25"
                                }`}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-white font-semibold text-base truncate">{org.name}</h3>
                                    <div className="mt-1 flex flex-wrap items-center gap-2">
                                        <span className="inline-block px-2 py-0.5 rounded-md bg-white/8 text-white/50 text-xs font-mono">
                                            {org.code}
                                        </span>
                                        <span className="inline-block px-2 py-0.5 rounded-md bg-white/8 text-white/50 text-[11px] font-mono">
                                            ID: {org.organizationId}
                                        </span>
                                    </div>
                                    <p className="text-white/60 text-xs mt-2 line-clamp-2 min-h-8">
                                        {org.description || "No description available"}
                                    </p>
                                </div>
                                {isCurrent && (
                                    <span className="shrink-0 px-2.5 py-1 rounded-full bg-accent/20 text-accent text-xs font-semibold">
                                        Joined
                                    </span>
                                )}
                                {isPending && (
                                    <span className="shrink-0 px-2.5 py-1 rounded-full bg-amber-400/20 text-amber-400 text-xs font-semibold">
                                        Pending
                                    </span>
                                )}
                            </div>

                            {/* Org Details */}
                            <div className="grid grid-cols-3 gap-2.5 px-3 py-3 bg-white/5 rounded-lg mt-3">
                                <div className="text-center">
                                    <p className="text-white/40 text-[10px] uppercase tracking-wider">Status</p>
                                    {org.isActive !== false ? (
                                        <p className="text-green-400 font-semibold text-xs mt-0.5">Active</p>
                                    ) : (
                                        <p className="text-red-400 font-semibold text-xs mt-0.5">Inactive</p>
                                    )}
                                </div>
                                <div className="text-center">
                                    <p className="text-white/40 text-[10px] uppercase tracking-wider">Members</p>
                                    <p className="text-white font-semibold text-xs mt-0.5">{org.memberCount ?? "—"}</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-white/40 text-[10px] uppercase tracking-wider">Owner</p>
                                    <p className="text-white/70 font-mono text-[10px] mt-0.5 truncate">{org.owner ? org.owner.substring(0, 8) : "—"}</p>
                                </div>
                            </div>

                            <div className="mt-auto pt-3">
                                {isCurrent ? (
                                    <p className="text-accent/70 text-xs">You are a member of this organization</p>
                                ) : isPending ? (
                                    <p className="text-amber-400/70 text-xs">Awaiting admin approval</p>
                                ) : !isPlatformOwner ? (
                                    <p className="text-white/40 text-xs">Ask an org admin for an invite link to join.</p>
                                ) : (
                                    <p className="text-white/40 text-xs text-center">Use Platform Owner Tools to join</p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        )}
    </section>
);

export default BrowseTab;
