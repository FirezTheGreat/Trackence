import { useMemo, useState, useEffect } from "react";
import { ChevronDown, Edit2, LogOut, Crown, Trash2, Users } from "lucide-react";
import type { OrgMember } from "../../services/organization.service";
import type { OrgDetail } from "../../types/organizations.types";
import EditOrgModal from "./EditOrgModal";
import { useModalStore } from "../../stores/modal.store";

interface Props {
    selectedOrg: OrgDetail;
    members: OrgMember[];
    unassignedUsers: OrgMember[];
    memberSearch: string;
    userId: string;
    userOrgIds: string[];
    isPlatformOwner: boolean;
    canManageMembers: boolean;
    actionLoading: boolean;
    onMemberSearch: (v: string) => void;
    onAddMember: (userId: string) => void;
    onRemoveMember: (userId: string) => void;
    onPromote: (userId: string) => void;
    onDemote: (userId: string) => void;
    onLeave: (org: OrgDetail) => void;
    onDelete: (org: OrgDetail) => void;
    onTransferOwnership: (userId: string) => void;
    onEdit: (orgId: string, data: { name: string; description: string }) => Promise<void>;
    onUpdateUserName: (userId: string, name: string) => Promise<boolean>;
}

const MembersTab = ({
    selectedOrg,
    members,
    unassignedUsers,
    memberSearch,
    userId,
    userOrgIds,
    isPlatformOwner,
    canManageMembers,
    actionLoading,
    onMemberSearch,
    onAddMember,
    onRemoveMember,
    onPromote,
    onDemote,
    onLeave,
    onDelete,
    onTransferOwnership,
    onEdit,
    onUpdateUserName,
}: Props) => {
    const [directorySearch, setDirectorySearch] = useState("");
    const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "member">("all");
    const [sortBy, setSortBy] = useState<"name-asc" | "name-desc" | "joined-newest" | "joined-oldest" | "role">("role");

    const [transferModal, setTransferModal] = useState<{ show: boolean; selectedUserId: string }>({
        show: false,
        selectedUserId: "",
    });
    const [editModal, setEditModal] = useState(false);
    const [renameModal, setRenameModal] = useState<{
        show: boolean;
        userId: string;
        currentName: string;
        nextName: string;
    }>({
        show: false,
        userId: "",
        currentName: "",
        nextName: "",
    });

    const [currentPage, setCurrentPage] = useState(1);
    const PAGE_SIZE = 10;

    useEffect(() => {
        setCurrentPage(1);
    }, [directorySearch, roleFilter, sortBy]);

    const isMember = userOrgIds.includes(selectedOrg.organizationId);
    const adminCount = members.filter((member) => (member.role || "member") === "admin" || member.isOrgAdmin).length;
    const memberCount = Math.max(members.length - adminCount, 0);
    const filteredMembers = useMemo(() => {
        const query = directorySearch.trim().toLowerCase();

        const roleResolved = (member: OrgMember) => (member.role || (member.isOrgAdmin ? "admin" : "member"));

        const byFilter = members.filter((member) => {
            const role = roleResolved(member);
            if (roleFilter !== "all" && role !== roleFilter) return false;

            if (!query) return true;

            return (
                member.name.toLowerCase().includes(query) ||
                member.email.toLowerCase().includes(query) ||
                member.userId.toLowerCase().includes(query)
            );
        });

        const sorted = [...byFilter].sort((a, b) => {
            const roleA = roleResolved(a);
            const roleB = roleResolved(b);
            const createdA = new Date(a.createdAt || 0).getTime();
            const createdB = new Date(b.createdAt || 0).getTime();

            if (sortBy === "name-asc") return a.name.localeCompare(b.name);
            if (sortBy === "name-desc") return b.name.localeCompare(a.name);
            if (sortBy === "joined-newest") return createdB - createdA;
            if (sortBy === "joined-oldest") return createdA - createdB;

            if (roleA !== roleB) return roleA === "admin" ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

        return sorted;
    }, [members, directorySearch, roleFilter, sortBy]);

    const totalPages = Math.ceil(filteredMembers.length / PAGE_SIZE) || 1;
    const paginatedMembers = filteredMembers.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
    );

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    const visiblePages = useMemo(() => {
        if (totalPages <= 3) {
            return Array.from({ length: totalPages }, (_, index) => index + 1);
        }

        if (currentPage <= 2) {
            return [1, 2, 3, "ellipsis-right"] as const;
        }

        if (currentPage >= totalPages - 1) {
            return ["ellipsis-left", totalPages - 2, totalPages - 1, totalPages] as const;
        }

        return ["ellipsis-left", currentPage - 1, currentPage, currentPage + 1, "ellipsis-right"] as const;
    }, [currentPage, totalPages]);

    const getInitials = (name: string) => {
        const words = name.trim().split(/\s+/).filter(Boolean);
        if (words.length === 0) return "?";
        if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
        return `${words[0][0]}${words[1][0]}`.toUpperCase();
    };

    const formatJoinedDate = (iso?: string) => {
        if (!iso) return "Unknown";
        const dt = new Date(iso);
        if (Number.isNaN(dt.getTime())) return "Unknown";
        return dt.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
        });
    };

    return (
        <section className="flex flex-col gap-6">
            {/* Org Detail Header */}
            <div className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl px-6 py-6 shadow-lg shadow-black/10">
                <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                    <div className="flex-1 w-full">
                        <h2 className="text-2xl text-white font-semibold mb-1">{selectedOrg.name}</h2>
                        {selectedOrg.description && (
                            <p className="text-white/60 text-sm mb-3">{selectedOrg.description}</p>
                        )}
                        <div className="flex items-center gap-6 mt-3">
                            <div>
                                <p className="text-white/50 text-xs uppercase tracking-wider">Code</p>
                                <p className="text-accent font-mono font-semibold">{selectedOrg.code}</p>
                            </div>
                            <div>
                                <p className="text-white/50 text-xs uppercase tracking-wider">Members</p>
                                <p className="text-white font-semibold text-lg">{members.length}</p>
                            </div>
                            <div>
                                <p className="text-white/50 text-xs uppercase tracking-wider">Status</p>
                                <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${selectedOrg.isActive ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                                    }`}>
                                    {selectedOrg.isActive ? "Active" : "Inactive"}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Header actions */}
                    <div className="flex flex-wrap sm:flex-col gap-2 shrink-0 w-full sm:w-auto">
                        {canManageMembers && (
                            <button
                                onClick={() => setEditModal(true)}
                                disabled={actionLoading}
                                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-blue-400/35 text-blue-300
                  bg-blue-500/8 hover:bg-blue-500/15 text-sm font-medium tracking-wide transition cursor-pointer disabled:opacity-50 w-full sm:w-auto"
                            >
                                <Edit2 className="w-4 h-4" />
                                <span>Edit Details</span>
                            </button>
                        )}
                        {isMember && (
                            <button
                                onClick={async () => {
                                    const confirmed = await useModalStore.getState().confirm(
                                        "Leave Organization",
                                        `Leave "${selectedOrg.name}"?`
                                    );
                                    if (confirmed) onLeave(selectedOrg);
                                }}
                                disabled={actionLoading}
                                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-amber-400/35 text-amber-300
                  bg-amber-500/8 hover:bg-amber-500/15 text-sm font-medium tracking-wide transition cursor-pointer disabled:opacity-50 w-full sm:w-auto"
                            >
                                <LogOut className="w-4 h-4" />
                                <span>Leave Org</span>
                            </button>
                        )}
                        {isPlatformOwner && canManageMembers && (
                            <>
                                <button
                                    onClick={() => setTransferModal({ show: true, selectedUserId: "" })}
                                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-accent/40 text-accent
                    bg-accent/8 hover:bg-accent/15 text-sm font-medium tracking-wide transition cursor-pointer w-full sm:w-auto"
                                >
                                    <Crown className="w-4 h-4" />
                                    <span>Transfer Owner</span>
                                </button>
                                <button
                                    onClick={() => onDelete(selectedOrg)}
                                    disabled={actionLoading}
                                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-red-400/35 text-red-300
                    bg-red-500/8 hover:bg-red-500/15 text-sm font-medium tracking-wide transition cursor-pointer disabled:opacity-50 w-full sm:w-auto"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    <span>Delete Org</span>
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Members Directory */}
            <div className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl px-6 py-5 shadow-lg shadow-black/10">
                <div className="flex flex-col gap-4 mb-5">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <h3 className="text-lg text-white font-semibold inline-flex items-center gap-2">
                                <Users className="w-5 h-5 text-white/70" />
                                <span>Members Directory</span>
                            </h3>
                            <p className="text-sm text-white/50 mt-1">
                                {canManageMembers
                                    ? "View and manage roles, member access, and ownership transitions."
                                    : "Read-only list of your organization members and roles."}
                            </p>
                        </div>
                        <div className="text-xs text-white/45 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5">
                            Last sync: Live
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                            <p className="text-[11px] uppercase tracking-wider text-white/45">Total Members</p>
                            <p className="text-xl font-semibold text-white mt-1">{members.length}</p>
                        </div>
                        <div className="rounded-xl border border-accent/20 bg-accent/7 px-4 py-3">
                            <p className="text-[11px] uppercase tracking-wider text-accent/70">Admins</p>
                            <p className="text-xl font-semibold text-accent mt-1">{adminCount}</p>
                        </div>
                        <div className="rounded-xl border border-blue-400/20 bg-blue-500/7 px-4 py-3">
                            <p className="text-[11px] uppercase tracking-wider text-blue-300/70">Member</p>
                            <p className="text-xl font-semibold text-blue-300 mt-1">{memberCount}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="md:col-span-1">
                            <label className="block text-[11px] uppercase tracking-wider text-white/45 mb-2">Search</label>
                            <input
                                type="text"
                                value={directorySearch}
                                onChange={(event) => setDirectorySearch(event.target.value)}
                                placeholder="Name, email, or user ID"
                                className="w-full h-10.5 px-4 rounded-xl bg-secondary/60 border border-white/20 text-white placeholder-white/35 focus:outline-none focus:border-accent/50 text-sm"
                            />
                        </div>

                        <div>
                            <label className="block text-[11px] uppercase tracking-wider text-white/45 mb-2">Role Filter</label>
                            <div className="relative group">
                                <select
                                    value={roleFilter}
                                    onChange={(event) => setRoleFilter(event.target.value as "all" | "admin" | "member")}
                                    className="w-full h-10.5 appearance-none px-4 pr-10 rounded-xl bg-secondary/65 border border-white/20 text-white/95 text-xs font-light uppercase tracking-widest focus:outline-none focus:border-accent/50 hover:border-white/30"
                                >
                                    <option className="bg-[#1c1c21] text-white" value="all">All Roles</option>
                                    <option className="bg-[#1c1c21] text-white" value="admin">Admins</option>
                                    <option className="bg-[#1c1c21] text-white" value="member">Member</option>
                                </select>
                                <ChevronDown className="w-4 h-4 text-white/45 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none group-hover:text-white/65 transition-colors" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-[11px] uppercase tracking-wider text-white/45 mb-2">Sort By</label>
                            <div className="relative group">
                                <select
                                    value={sortBy}
                                    onChange={(event) =>
                                        setSortBy(event.target.value as "name-asc" | "name-desc" | "joined-newest" | "joined-oldest" | "role")
                                    }
                                    className="w-full h-10.5 appearance-none px-4 pr-10 rounded-xl bg-secondary/65 border border-white/20 text-white/95 text-xs font-light uppercase tracking-widest focus:outline-none focus:border-accent/50 hover:border-white/30"
                                >
                                    <option className="bg-[#1c1c21] text-white" value="role">Role (Admin first)</option>
                                    <option className="bg-[#1c1c21] text-white" value="name-asc">Name (A-Z)</option>
                                    <option className="bg-[#1c1c21] text-white" value="name-desc">Name (Z-A)</option>
                                    <option className="bg-[#1c1c21] text-white" value="joined-newest">Joined (Newest)</option>
                                    <option className="bg-[#1c1c21] text-white" value="joined-oldest">Joined (Oldest)</option>
                                </select>
                                <ChevronDown className="w-4 h-4 text-white/45 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none group-hover:text-white/65 transition-colors" />
                            </div>
                        </div>
                    </div>

                    <p className="text-xs text-white/45">
                        Showing {filteredMembers.length} of {members.length} members
                    </p>
                </div>

                {members.length === 0 ? (
                    <p className="text-white/50 text-center py-8">No members yet.</p>
                ) : filteredMembers.length === 0 ? (
                    <p className="text-white/50 text-center py-8">No members match your current filters.</p>
                ) : (
                    <div className="space-y-3">
                        {paginatedMembers.map((m) => {
                            const isSelf = m.userId === userId;
                            const roleLabel = m.role || (m.isOrgAdmin ? "admin" : "member");
                            return (
                                <div
                                    key={m.userId}
                                    className="rounded-xl border border-white/10 bg-secondary/35 hover:border-white/20 hover:bg-secondary/50 transition"
                                >
                                    <div className="flex flex-col lg:flex-row lg:items-center gap-4 px-4 py-4">
                                        <div className="flex items-start gap-3 min-w-0 flex-1">
                                            <div className="w-11 h-11 rounded-xl border border-white/20 bg-white/10 flex items-center justify-center text-sm font-semibold text-white shrink-0">
                                                {getInitials(m.name)}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="text-white font-semibold truncate max-w-full">{m.name}</p>
                                                    {isSelf && (
                                                        <span className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-400/35 bg-emerald-500/12 text-emerald-300">
                                                            You
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-white/45 text-xs mt-0.5 truncate">{m.userId}</p>
                                                <p className="text-white/70 text-sm mt-1 truncate">{m.email}</p>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2 lg:justify-end lg:w-90">
                                            <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${roleLabel === "admin"
                                                ? "border-accent/40 bg-accent/10 text-accent"
                                                : "border-blue-400/30 bg-blue-400/10 text-blue-400"
                                                }`}>
                                                {roleLabel.charAt(0).toUpperCase() + roleLabel.slice(1)}
                                            </span>
                                            <span className="text-[11px] px-2.5 py-1 rounded-full border border-white/15 bg-white/5 text-white/60">
                                                Joined: {formatJoinedDate(m.createdAt)}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="px-4 pb-4 flex gap-2 flex-wrap border-t border-white/8 pt-3">
                                        {isSelf ? (
                                            <span className="text-xs text-white/40 italic">You</span>
                                        ) : canManageMembers ? (
                                            <>
                                                {isPlatformOwner && (
                                                    <button
                                                        onClick={() =>
                                                            setRenameModal({
                                                                show: true,
                                                                userId: m.userId,
                                                                currentName: m.name,
                                                                nextName: m.name,
                                                            })
                                                        }
                                                        disabled={actionLoading}
                                                        className="px-3 py-1.5 rounded-lg border border-blue-400/40 text-blue-400
                              hover:bg-blue-400/10 text-xs transition cursor-pointer disabled:opacity-50"
                                                    >
                                                        Rename
                                                    </button>
                                                )}
                                                {m.isOrgAdmin ? (
                                                    <button
                                                        onClick={async () => {
                                                            const confirmed = await useModalStore.getState().confirm(
                                                                "Demote Member",
                                                                `Remove ${m.name} as admin?`,
                                                                { confirmText: "Demote" }
                                                            );
                                                            if (confirmed) onDemote(m.userId);
                                                        }}
                                                        disabled={actionLoading}
                                                        className="px-3 py-1.5 rounded-lg border border-amber-400/40 text-amber-400
                              hover:bg-amber-400/10 text-xs transition cursor-pointer disabled:opacity-50"
                                                    >
                                                        Demote
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={async () => {
                                                            const confirmed = await useModalStore.getState().confirm(
                                                                "Promote Member",
                                                                `Make ${m.name} admin?`,
                                                                { confirmText: "Promote" }
                                                            );
                                                            if (confirmed) onPromote(m.userId);
                                                        }}
                                                        disabled={actionLoading}
                                                        className="px-3 py-1.5 rounded-lg border border-accent/40 text-accent
                              hover:bg-accent/10 text-xs transition cursor-pointer disabled:opacity-50"
                                                    >
                                                        Promote
                                                    </button>
                                                )}
                                                <button
                                                    onClick={async () => {
                                                        const confirmed = await useModalStore.getState().confirm(
                                                            "Remove Member",
                                                            `Remove ${m.name}?`,
                                                            { confirmText: "Remove" }
                                                        );
                                                        if (confirmed) onRemoveMember(m.userId);
                                                    }}
                                                    disabled={actionLoading}
                                                    className="px-3 py-1.5 rounded-lg border border-red-400/40 text-red-400
                            hover:bg-red-400/10 text-xs transition cursor-pointer disabled:opacity-50"
                                                >
                                                    Remove
                                                </button>
                                            </>
                                        ) : (
                                            <span className="text-xs text-white/30">—</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 border-t border-white/10 pt-4">
                        <button
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage((p) => p - 1)}
                            className="px-4 py-2 rounded-lg border border-white/20 text-white/70 hover:bg-white/5 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition text-sm cursor-pointer"
                        >
                            Previous
                        </button>
                        <div className="flex items-center gap-1.5">
                            {visiblePages.map((entry) => {
                                if (entry === "ellipsis-left" || entry === "ellipsis-right") {
                                    return (
                                        <span key={entry} className="px-2 text-white/40 text-sm">
                                            ...
                                        </span>
                                    );
                                }

                                return (
                                    <button
                                        key={entry}
                                        onClick={() => setCurrentPage(entry)}
                                        className={`min-w-8 h-8 px-2 rounded-lg border text-sm transition cursor-pointer ${
                                            currentPage === entry
                                                ? "border-accent/50 bg-accent/20 text-accent"
                                                : "border-white/20 text-white/70 hover:bg-white/5 hover:text-white"
                                        }`}
                                    >
                                        {entry}
                                    </button>
                                );
                            })}
                        </div>
                        <button
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage((p) => p + 1)}
                            className="px-4 py-2 rounded-lg border border-white/20 text-white/70 hover:bg-white/5 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition text-sm cursor-pointer"
                        >
                            Next
                        </button>
                    </div>
                )}
            </div>

            {/* Invite Members */}
            {canManageMembers && (
                <div className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl px-6 py-5 shadow-lg shadow-black/10">
                    <h3 className="text-lg text-white mb-4 font-semibold">📨 Invite Members</h3>
                    <input
                        type="text"
                        placeholder="Enter full email or user ID to find users..."
                        value={memberSearch}
                        onChange={(e) => onMemberSearch(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-secondary/60 border border-white/20
              text-white placeholder-white/30 focus:outline-none focus:border-accent/50 mb-4"
                    />

                    {memberSearch.trim().length < 3 && (
                        <p className="text-white/45 text-xs text-center pb-2">
                            Use a complete email address or user ID to run lookup.
                        </p>
                    )}

                    {unassignedUsers.length === 0 ? (
                        <p className="text-white/50 text-sm text-center py-4">
                            {memberSearch.trim().length < 3
                                ? "No users shown yet. Enter email or user ID to discover users you can invite."
                                : "No matching users found."}
                        </p>
                    ) : (
                        <div className="flex flex-col gap-3 max-h-75 overflow-y-auto">
                            {unassignedUsers.map((u) => (
                                <div
                                    key={u.userId}
                                    className="flex justify-between items-center bg-secondary/40 border border-white/10
                    hover:border-white/20 rounded-xl px-4 py-3 transition"
                                >
                                    <div>
                                        <p className="text-white font-medium">{u.name}</p>
                                        <p className="text-white/50 text-sm">{u.email}</p>
                                    </div>
                                    <button
                                        onClick={async () => {
                                            const confirmed = await useModalStore.getState().confirm(
                                                "Send Invitation",
                                                `Send an org invite to ${u.name}?`,
                                                { confirmText: "Invite" }
                                            );
                                            if (confirmed) onAddMember(u.userId);
                                        }}
                                        disabled={actionLoading}
                                        className="px-4 py-2 rounded-lg border border-green-400/40 text-green-400
                      hover:bg-green-400/10 text-sm transition cursor-pointer disabled:opacity-50 font-medium"
                                    >
                                        Invite
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Transfer Ownership Modal ── */}
            {transferModal.show && (
                <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/40">
                    <div className="backdrop-blur-2xl bg-secondary/60 border border-white/20 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
                        <h3 className="text-xl text-white font-semibold mb-4">👑 Transfer Ownership</h3>
                        <p className="text-white/70 mb-6">
                            Select a member to transfer ownership of "{selectedOrg.name}":
                        </p>
                        <div className="max-h-64 overflow-y-auto mb-6 space-y-2">
                            {members
                                .filter((m) => m.userId !== userId)
                                .map((m) => (
                                    <button
                                        key={m.userId}
                                        onClick={() => setTransferModal({ show: true, selectedUserId: m.userId })}
                                        className={`w-full text-left px-4 py-3 rounded-lg border transition cursor-pointer
                      ${transferModal.selectedUserId === m.userId
                                                ? "bg-accent/20 border-accent/40"
                                                : "bg-secondary/40 border-white/10 hover:border-white/20"
                                            }`}
                                    >
                                        <p className="text-white font-medium">{m.name}</p>
                                        <p className="text-white/50 text-xs">
                                            {m.email} {m.isOrgAdmin && "· Admin"}
                                        </p>
                                    </button>
                                ))}
                            {members.filter((m) => m.userId !== userId).length === 0 && (
                                <p className="text-white/50 text-sm text-center py-4">No other members available.</p>
                            )}
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    if (transferModal.selectedUserId) {
                                        onTransferOwnership(transferModal.selectedUserId);
                                        setTransferModal({ show: false, selectedUserId: "" });
                                    }
                                }}
                                disabled={!transferModal.selectedUserId || actionLoading}
                                className="flex-1 px-4 py-2 rounded-lg bg-accent/20 border border-accent/40
                  text-accent font-semibold text-sm hover:bg-accent/30 transition cursor-pointer
                  disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {actionLoading ? "Transferring..." : "Transfer"}
                            </button>
                            <button
                                onClick={() => setTransferModal({ show: false, selectedUserId: "" })}
                                className="flex-1 px-4 py-2 rounded-lg border border-white/15
                  text-white/60 text-sm hover:text-white transition cursor-pointer"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Edit Organization Modal ── */}
            <EditOrgModal
                isOpen={editModal}
                org={selectedOrg}
                onClose={() => setEditModal(false)}
                onSubmit={(data) => onEdit(selectedOrg.organizationId, data)}
                isLoading={actionLoading}
            />

            {renameModal.show && (
                <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/40">
                    <div className="backdrop-blur-2xl bg-secondary/60 border border-white/20 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
                        <h3 className="text-xl text-white font-semibold mb-4">✏️ Rename User</h3>
                        <p className="text-white/70 mb-3">Current name: <span className="text-white">{renameModal.currentName}</span></p>
                        <input
                            type="text"
                            value={renameModal.nextName}
                            onChange={(e) =>
                                setRenameModal((prev) => ({
                                    ...prev,
                                    nextName: e.target.value,
                                }))
                            }
                            maxLength={80}
                            className="w-full px-4 py-3 rounded-xl bg-secondary/60 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-accent/50"
                            placeholder="Enter new name"
                        />
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={async () => {
                                    const normalized = renameModal.nextName.trim().replace(/\s+/g, " ");
                                    if (normalized.length < 2 || normalized.length > 80) {
                                        await useModalStore.getState().alert("Invalid Name", "Name must be between 2 and 80 characters.");
                                        return;
                                    }
                                    const ok = await onUpdateUserName(renameModal.userId, normalized);
                                    if (ok) {
                                        setRenameModal({
                                            show: false,
                                            userId: "",
                                            currentName: "",
                                            nextName: "",
                                        });
                                    }
                                }}
                                disabled={actionLoading}
                                className="flex-1 px-4 py-2 rounded-lg bg-accent/20 border border-accent/40 text-accent font-semibold text-sm hover:bg-accent/30 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {actionLoading ? "Saving..." : "Save"}
                            </button>
                            <button
                                onClick={() =>
                                    setRenameModal({
                                        show: false,
                                        userId: "",
                                        currentName: "",
                                        nextName: "",
                                    })
                                }
                                className="flex-1 px-4 py-2 rounded-lg border border-white/15 text-white/60 text-sm hover:text-white transition cursor-pointer"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
};

export default MembersTab;
