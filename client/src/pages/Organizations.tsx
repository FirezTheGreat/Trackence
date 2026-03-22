import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useAuthStore } from "../stores/auth.store";
import { organizationAPI, type OrgMember, type OrganizationInviteRecord } from "../services/organization.service";
import { adminAPI } from "../services/admin.service";
import type { PublicOrg, OrgDetail, TabKey } from "../types/organizations.types";
import MyOrgsTab from "./organizations/MyOrgsTab";
import ManageRequestsTab from "./organizations/ManageRequestsTab";
import MembersTab from "./organizations/MembersTab";
import CreateOrgForm from "./organizations/CreateOrgForm";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useModalStore } from "../stores/modal.store";
import { toast } from "../stores/toast.store";
import { connectUserUpdatesSocket, disconnectUserUpdatesSocket } from "../services/socket.service";

/* ─── Component ─── */
const Organizations = () => {
  const { user, checkAuth } = useAuthStore();
  const autoRefreshInFlightRef = useRef(false);
  const MEMBER_PAGE_LIMIT = 10;

  const isSuperAdmin = user?.platformRole === "superAdmin";
  const adminOrgIds = useMemo(() => user?.orgAdmins ?? [], [user?.orgAdmins]);
  const canManageOrgWorkflows = adminOrgIds.length > 0;
  const adminOrgIdsKey = useMemo(() => adminOrgIds.join("|"), [adminOrgIds]);

  /* ─── State ─── */
  // Default to "current" to show user's orgs first, fall back to "browse"
  const [activeTab, setActiveTab] = useState<TabKey>("current");
  const [publicOrgs, setPublicOrgs] = useState<PublicOrg[]>([]);
  const [currentOrgs, setCurrentOrgs] = useState<OrgDetail[]>([]);
  const [pendingOrgs, setPendingOrgs] = useState<PublicOrg[]>([]);
  const [pendingOrgIds, setPendingOrgIds] = useState<string[]>([]);
  const [managedOrgs, setManagedOrgs] = useState<OrgDetail[]>([]);
  const [pendingRequests, setPendingRequests] = useState<
    Record<string, Array<{ userId: string; name: string; email: string; role: string }>>
  >({});
  const [orgInvites, setOrgInvites] = useState<Record<string, OrganizationInviteRecord[]>>({});

  // Members management state (admin)
  const [selectedOrg, setSelectedOrg] = useState<OrgDetail | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [unassignedUsers, setUnassignedUsers] = useState<OrgMember[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const debouncedMemberSearch = useDebouncedValue(memberSearch, 300);



  // Leave modal
  const [leaveModal, setLeaveModal] = useState<{
    show: boolean;
    org: OrgDetail | null;
    isOwner: boolean;
    memberCount: number;
  }>({ show: false, org: null, isOwner: false, memberCount: 0 });

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [inviteTokenInput, setInviteTokenInput] = useState("");
  const [newOrg, setNewOrg] = useState({ name: "", code: "", description: "" });
  const canViewSelectedOrgMembers = !!selectedOrg;
  const canManageSelectedOrgMembers = !!selectedOrg && (user?.orgAdmins || []).includes(selectedOrg.organizationId);

  /* ─── Toast helper ─── */
  const showToast = useCallback((type: "success" | "error", message: string) => {
    if (type === "success") {
      toast.success(message);
      return;
    }
    toast.error(message);
  }, []);

  /* ─── Fetch public orgs ─── */
  const fetchPublicOrgs = useCallback(async (): Promise<PublicOrg[]> => {
    try {
      const data = await organizationAPI.listPublicOrganizations();
      setPublicOrgs(data.organizations);
      return data.organizations;
    } catch (err: any) {
      console.error("[Organizations] Failed to fetch public orgs:", err);
      return [];
    }
  }, []);

  /* ─── Fetch current org details (all joined orgs) ─── */
  const fetchCurrentOrgs = useCallback(
    async (publicOrgsList?: PublicOrg[], explicitOrgIds?: string[]) => {
      const orgIds = explicitOrgIds || Array.from(new Set([...(user?.organizationIds || []), ...(user?.orgAdmins || [])]));
      if (orgIds.length === 0) {
        setCurrentOrgs([]);
        return;
      }
      // Use passed-in list to avoid stale-state dependency
      const lookupList = publicOrgsList ?? publicOrgs;
      try {
        const results = await Promise.all(
          orgIds.map(async (id) => {
            const publicOrgMatch = lookupList.find((org) => org.organizationId === id);

            if (user?.role !== "faculty") {
              try {
                const data = await organizationAPI.get(id);
                return data.organization as OrgDetail;
              } catch {}
            }

            // Fallback: never drop a joined org from UI, even if details endpoint fails
            return {
              organizationId: id,
              name: publicOrgMatch?.name || id,
              code: publicOrgMatch?.code || id,
              description: publicOrgMatch?.description || "",
              isActive: publicOrgMatch?.isActive ?? true,
              memberCount: publicOrgMatch?.memberCount,
              owner: publicOrgMatch?.owner,
            } as OrgDetail;
          })
        );
        setCurrentOrgs(results);
      } catch {
        setCurrentOrgs([]);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.organizationIds, user?.orgAdmins, user?.role],
  );

  /* ─── Always re-sync auth state when opening Organizations ─── */
  useEffect(() => {
    checkAuth().catch(() => {
      // no-op, ProtectedRoute handles auth failures
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Fetch managed orgs (admins: their orgs only) ─── */
  // Managed orgs are synced from currentOrgs in useEffect below

  /* ─── Initial load (runs once on mount / when user membership changes) ─── */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const freshPublicOrgs = await fetchPublicOrgs();
      if (cancelled) return;
      await fetchCurrentOrgs(freshPublicOrgs);
      if (!cancelled) setLoading(false);
    };
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.organizationIds, user?.orgAdmins]);

  /* ─── Live sync org membership changes (leave/remove/role updates) ─── */
  const refreshOrganizationView = useCallback(async () => {
    if (autoRefreshInFlightRef.current) return;
    autoRefreshInFlightRef.current = true;
    try {
      await checkAuth();
      const refreshedUser = useAuthStore.getState().user;
      const refreshedOrgIds = Array.from(
        new Set([...(refreshedUser?.organizationIds || []), ...(refreshedUser?.orgAdmins || [])])
      );
      setPendingOrgIds(refreshedUser?.requestedOrganizationIds || []);

      const freshPublicOrgs = await fetchPublicOrgs();
      await fetchCurrentOrgs(freshPublicOrgs, refreshedOrgIds);

      if (selectedOrg && !refreshedOrgIds.includes(selectedOrg.organizationId)) {
        setSelectedOrg(null);
        setMembers([]);
        setUnassignedUsers([]);
        setActiveTab("current");
      }
    } finally {
      autoRefreshInFlightRef.current = false;
    }
  }, [
    checkAuth,
    fetchPublicOrgs,
    fetchCurrentOrgs,
    selectedOrg,
  ]);

  useEffect(() => {
    const socket = connectUserUpdatesSocket({
      onOrganizationMembershipChanged: () => {
        refreshOrganizationView().catch(() => {
          // no-op: transient sync failures should not break the page
        });
      },
    });

    return () => {
      socket.removeAllListeners("user:org-membership-changed");
      disconnectUserUpdatesSocket();
    };
  }, [refreshOrganizationView]);

  /* ─── For admins, sync managedOrgs from orgs they admin ─── */
  useEffect(() => {
    // Only show join requests for organizations the user is actively an admin of,
    // even if they are a superAdmin, to avoid cluttering their view with orgs they left.
    if (adminOrgIds.length > 0) {
      const adminOrgs = currentOrgs.filter((org) => adminOrgIds.includes(org.organizationId));
      setManagedOrgs(adminOrgs);
      return;
    }

    setManagedOrgs([]);
  }, [currentOrgs, adminOrgIdsKey]);

  /* ─── Fetch pending requests for all managed orgs ─── */
  const fetchAllPendingRequests = useCallback(async () => {
    if (!canManageOrgWorkflows || managedOrgs.length === 0) {
      setPendingRequests({});
      return;
    }
    const results: typeof pendingRequests = {};
    await Promise.all(
      managedOrgs.map(async (org) => {
        try {
          const data = await organizationAPI.getPendingJoinRequests(
            org.organizationId
          );
          if (data.requests.length > 0) {
            results[org.organizationId] = data.requests;
          }
        } catch {
          // skip
        }
      })
    );
    setPendingRequests(results);
  }, [canManageOrgWorkflows, managedOrgs]);

  const fetchAllOrgInvites = useCallback(async () => {
    if (!canManageOrgWorkflows || managedOrgs.length === 0) {
      setOrgInvites({});
      return;
    }

    const inviteMap: Record<string, OrganizationInviteRecord[]> = {};
    await Promise.all(
      managedOrgs.map(async (org) => {
        try {
          const data = await organizationAPI.getInvites(org.organizationId, 20);
          inviteMap[org.organizationId] = data.invites || [];
        } catch {
          inviteMap[org.organizationId] = [];
        }
      })
    );
    setOrgInvites(inviteMap);
  }, [canManageOrgWorkflows, managedOrgs]);

  /* ─── Fetch pending orgs – runs on mount AND whenever userId/role changes ─── */
  const fetchPendingOrgIds = useCallback(async () => {
    try {
      const data = await organizationAPI.getPendingOrganizationRequests();
      console.log("[Organizations] Fetched pending org IDs from backend:", data.requestedOrganizationIds);
      setPendingOrgIds(data.requestedOrganizationIds || []);
    } catch {
      console.warn("[Organizations] Failed to fetch pending orgs; preserving existing pending IDs");
      setPendingOrgIds((prev) => prev.length > 0 ? prev : (user?.requestedOrganizationIds || []));
    }
  }, [user?.requestedOrganizationIds]);

  useEffect(() => {
    fetchPendingOrgIds();
    // Re-fetch on mount, userId change, and role change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.userId, user?.role, fetchPendingOrgIds]);

  /* ─── Resolve pending org details from pending IDs ─── */
  useEffect(() => {
    const requestedIds = pendingOrgIds || [];
    if (requestedIds.length === 0) {
      setPendingOrgs([]);
      return;
    }
    const hydratePendingOrgs = async () => {
      const mapFromList = (list: PublicOrg[]) =>
        new Map(list.map((org) => [org.organizationId, org] as const));

      let orgMap = mapFromList(publicOrgs);

      if (requestedIds.some((id) => !orgMap.has(id))) {
        try {
          const data = await organizationAPI.listPublicOrganizations();
          orgMap = mapFromList(data.organizations || []);
        } catch {
          // keep local map fallback
        }
      }

      const hydrated = requestedIds.map((id) => {
        const org = orgMap.get(id);
        if (org) return org;
        return {
          organizationId: id,
          name: `Organization ${id}`,
          code: id,
          description: "Pending request (organization details unavailable)",
          isActive: false,
        } as PublicOrg;
      });

      setPendingOrgs(hydrated);
    };

    hydratePendingOrgs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOrgIds, publicOrgs]);

  /* ─── Fetch pending requests when managed orgs change ─── */
  useEffect(() => {
    fetchAllPendingRequests();
    fetchAllOrgInvites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageOrgWorkflows, managedOrgs]);

  const handleRequestViaInvite = async (tokenOrLink: string) => {
    const trimmed = tokenOrLink.trim();
    if (!trimmed) {
      showToast("error", "Invite token or link is required.");
      return;
    }

    const token = (() => {
      try {
        if (trimmed.includes("/invite/")) {
          return trimmed.split("/invite/").pop()?.split("?")[0]?.trim() || trimmed;
        } else if (trimmed.includes("?invite=")) {
          const parsed = new URL(trimmed);
          return (parsed.searchParams.get("invite") || "").trim();
        }
      } catch {
        // Not a URL, treat as raw token.
      }
      return trimmed;
    })();

    if (!token) {
      showToast("error", "Could not extract invite token from the link.");
      return;
    }

    setActionLoading(true);
    try {
      const data = await organizationAPI.requestOrganizationViaInvite(token);
      showToast("success", data.message || "Join request submitted. Awaiting organization admin approval.");
      setInviteTokenInput("");
      await checkAuth();
      await fetchCurrentOrgs();
      await fetchPublicOrgs();
    } catch (err: any) {
      showToast("error", err.message || "Failed to submit invite-based join request.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateInvite = async (orgId: string, email?: string, userId?: string): Promise<boolean> => {
    setActionLoading(true);
    try {
      const result = await organizationAPI.createInvite(orgId, {
        email: email || undefined,
        userId: userId || undefined,
      });

      if (result.invite?.inviteLink && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(result.invite.inviteLink);
      }

      showToast(
        "success",
        email
          ? `${result.message} Invite link copied to clipboard.`
          : `${result.message} It has been copied to your clipboard.`
      );
      await fetchAllOrgInvites();
      return true;
    } catch (err: any) {
      showToast("error", err.message || "Failed to create invite.");
      return false;
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevokeInvite = async (orgId: string, token: string): Promise<void> => {
    setActionLoading(true);
    try {
      const data = await organizationAPI.revokeInvite(orgId, token);
      showToast("success", data.message);
      await fetchAllOrgInvites();
    } catch (err: any) {
      showToast("error", err.message || "Failed to revoke invite.");
    } finally {
      setActionLoading(false);
    }
  };

  /* ─── Cancel pending request ─── */
  const handleCancelRequest = async (orgId: string) => {
    setActionLoading(true);
    try {
      const data = await organizationAPI.cancelOrganizationRequest(orgId);
      showToast("success", data.message);
      setPendingOrgIds(data.requestedOrganizationIds || []);
      setPendingOrgs((prev) => prev.filter((o) => o.organizationId !== orgId));
      await checkAuth();
    } catch (err: any) {
      showToast("error", err.message || "Failed to cancel request.");
    } finally {
      setActionLoading(false);
    }
  };

  /* ─── Fetch All Members Helper ─── */
  const fetchAllMembers = async (orgId: string): Promise<OrgMember[]> => {
    let all: OrgMember[] = [];
    let page = 1;
    let totalPages = 1;
    try {
      do {
        const response = await organizationAPI.listMembers(orgId, page, MEMBER_PAGE_LIMIT);
        all = all.concat(response.members);
        totalPages = response.pagination?.totalPages || 1;
        page++;
      } while (page <= totalPages);
    } catch (err: any) {
      console.error("[Organizations] fetchAllMembers error:", err);
      throw err;
    }
    return all;
  };

  /* ─── Leave organization ─── */
  const handleLeaveOrg = async (org: OrgDetail) => {
    setActionLoading(true);
    try {
      const data = await organizationAPI.leaveOrganization(org.organizationId);
      showToast("success", data.message);
      setLeaveModal({ show: false, org: null, isOwner: false, memberCount: 0 });
      await checkAuth();
      const refreshedUser = useAuthStore.getState().user;
      const refreshedOrgIds = Array.from(
        new Set([...(refreshedUser?.organizationIds || []), ...(refreshedUser?.orgAdmins || [])])
      );
      await fetchCurrentOrgs(undefined, refreshedOrgIds);
      await fetchPublicOrgs();      if (selectedOrg?.organizationId === org.organizationId) {
        setSelectedOrg(null);
        setActiveTab("current");
      }
    } catch (err: any) {
      if (err.message?.includes("owner")) {
        const count = members.length || (org.memberCount ?? 0);
        setLeaveModal({ show: true, org, isOwner: true, memberCount: count });
      } else {
        showToast("error", err.message || "Failed to leave organization.");
      }
    } finally {
      setActionLoading(false);
    }
  };

  /* ─── Approve/Reject join request ─── */
  const handleApproveJoin = async (orgId: string, userId: string) => {
    setActionLoading(true);
    try {
      const data = await organizationAPI.approveJoinRequest(orgId, userId);
      showToast("success", data.message);

      await checkAuth();
      await fetchPendingOrgIds();
      const freshPublicOrgs = await fetchPublicOrgs();
      const refreshedUser = useAuthStore.getState().user;
      const refreshedOrgIds = Array.from(
        new Set([...(refreshedUser?.organizationIds || []), ...(refreshedUser?.orgAdmins || [])])
      );
      await fetchCurrentOrgs(freshPublicOrgs, refreshedOrgIds);
      await fetchAllPendingRequests();
      if (selectedOrg?.organizationId === orgId) {
        const allMembers = await fetchAllMembers(orgId);
        setMembers(allMembers);
      }
    } catch (err: any) {
      showToast("error", err.message || "Failed to approve request.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectJoin = async (orgId: string, userId: string) => {
    setActionLoading(true);
    try {
      const data = await organizationAPI.rejectJoinRequest(orgId, userId);
      showToast("success", data.message);

      await checkAuth();
      await fetchPendingOrgIds();
      const freshPublicOrgs = await fetchPublicOrgs();
      const refreshedUser = useAuthStore.getState().user;
      const refreshedOrgIds = Array.from(
        new Set([...(refreshedUser?.organizationIds || []), ...(refreshedUser?.orgAdmins || [])])
      );
      await fetchCurrentOrgs(freshPublicOrgs, refreshedOrgIds);
      await fetchAllPendingRequests();
      if (selectedOrg?.organizationId === orgId) {
        const allMembers = await fetchAllMembers(orgId);
        setMembers(allMembers);
      }
    } catch (err: any) {
      showToast("error", err.message || "Failed to reject request.");
    } finally {
      setActionLoading(false);
    }
  };

  /* ─── Member directory + management (member view, admin controls) ─── */
  const handleSelectOrgForMembers = async (org: OrgDetail) => {
    setSelectedOrg(org);
    setMemberSearch("");
    setActiveTab("members");
    try {
      const allMembers = await fetchAllMembers(org.organizationId);
      setMembers(allMembers);
      setUnassignedUsers([]);
    } catch (err: any) {
      console.error("[Organizations] Failed to fetch members:", err);
      showToast("error", err.message || "Failed to load members.");
      setMembers([]);
      setUnassignedUsers([]);
    }
  };

  const handleMemberSearch = (value: string) => {
    setMemberSearch(value);
  };

  useEffect(() => {
    if (!selectedOrg || !canManageSelectedOrgMembers) {
      setUnassignedUsers([]);
      return;
    }

    const query = debouncedMemberSearch.trim();
    if (query.length < 2) {
      setUnassignedUsers([]);
      return;
    }

    const loadUnassignedUsers = async () => {
      try {
        const data = await organizationAPI.getUnassignedUsers(
          query,
          selectedOrg.organizationId
        );
        setUnassignedUsers(data.users);
      } catch {
        setUnassignedUsers([]);
      }
    };

    loadUnassignedUsers();
  }, [selectedOrg, debouncedMemberSearch, canManageSelectedOrgMembers]);

  const handleAddMember = async (userId: string) => {
    if (!selectedOrg) return;
    setActionLoading(true);
    try {
      const data = await organizationAPI.createInvite(selectedOrg.organizationId, { userId });
      showToast("success", data.message);
      setUnassignedUsers((prev) => prev.filter((u) => u.userId !== userId));
    } catch (err: any) {
      showToast("error", err.message || "Failed to send invite.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedOrg) return;
    setActionLoading(true);
    try {
      const data = await organizationAPI.removeMember(selectedOrg.organizationId, userId);
      showToast("success", data.message);
      const allMembers = await fetchAllMembers(selectedOrg.organizationId);
      setMembers(allMembers);
      if (memberSearch.trim().length >= 2) {
        const unassignedData = await organizationAPI.getUnassignedUsers(memberSearch.trim(), selectedOrg.organizationId);
        setUnassignedUsers(unassignedData.users);
      } else {
        setUnassignedUsers([]);
      }
    } catch (err: any) {
      showToast("error", err.message || "Failed to remove member.");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePromote = async (userId: string) => {
    if (!selectedOrg) return;
    setActionLoading(true);
    try {
      const data = await organizationAPI.promoteToAdmin(selectedOrg.organizationId, userId);
      showToast("success", data.message);
      const allMembers = await fetchAllMembers(selectedOrg.organizationId);
      setMembers(allMembers);
    } catch (err: any) {
      showToast("error", err.message || "Failed to promote.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDemote = async (userId: string) => {
    if (!selectedOrg) return;
    setActionLoading(true);
    try {
      const data = await organizationAPI.demoteFromAdmin(selectedOrg.organizationId, userId);
      showToast("success", data.message);
      const allMembers = await fetchAllMembers(selectedOrg.organizationId);
      setMembers(allMembers);
    } catch (err: any) {
      showToast("error", err.message || "Failed to demote.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleTransferOwnership = async (newOwnerUserId: string) => {
    if (!selectedOrg) return;
    setActionLoading(true);
    try {
      const data = await organizationAPI.transferOwnership(
        selectedOrg.organizationId,
        newOwnerUserId
      );
      showToast("success", data.message);
      await checkAuth();
      await fetchCurrentOrgs();
      const allMembers = await fetchAllMembers(selectedOrg.organizationId);
      setMembers(allMembers);
    } catch (err: any) {
      showToast("error", err.message || "Failed to transfer ownership.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateMemberName = async (targetUserId: string, nextName: string): Promise<boolean> => {
    if (!selectedOrg) return false;
    if (!isSuperAdmin) {
      showToast("error", "Only super admin can update user names.");
      return false;
    }

    setActionLoading(true);
    try {
      const data = await adminAPI.updateUserName(targetUserId, nextName);
      showToast("success", data.message || "User name updated successfully.");
      setMembers((prev) =>
        prev.map((member) =>
          member.userId === targetUserId ? { ...member, name: data.user.name } : member
        )
      );
      setUnassignedUsers((prev) =>
        prev.map((member) =>
          member.userId === targetUserId ? { ...member, name: data.user.name } : member
        )
      );
      return true;
    } catch (err: any) {
      showToast("error", err.message || "Failed to update user name.");
      return false;
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteOrg = async (org: OrgDetail) => {
    const confirmed = await useModalStore.getState().confirm(
      "Delete Organization",
      `Are you sure you want to delete "${org.name}"? This cannot be undone.`,
      { confirmText: "Delete" }
    );
    if (!confirmed) return;
    setActionLoading(true);
    try {
      const data = await organizationAPI.deleteOrganization(org.organizationId);
      showToast("success", data.message);
      setSelectedOrg(null);
      setActiveTab("current");
      await checkAuth();
      await fetchCurrentOrgs();
      await fetchPublicOrgs();    } catch (err: any) {
      showToast("error", err.message || "Failed to delete organization.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleActive = async (org: OrgDetail) => {
    setActionLoading(true);
    try {
      await organizationAPI.update(org.organizationId, { isActive: !org.isActive });
      showToast("success", `Organization ${org.isActive ? "deactivated" : "activated"}.`);      await fetchCurrentOrgs();
      await fetchPublicOrgs();
    } catch (err: any) {
      showToast("error", err.message || "Failed to update organization.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditOrg = async (orgId: string, data: { name: string; description: string }) => {
    setActionLoading(true);
    try {
      const result = await organizationAPI.update(orgId, data);
      showToast("success", result.message);
      // Update selectedOrg with new details
      if (selectedOrg?.organizationId === orgId) {
        setSelectedOrg(result.organization as OrgDetail);
      }
      await fetchCurrentOrgs();
    } catch (err: any) {
      showToast("error", err.message || "Failed to update organization.");
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();

    setActionLoading(true);
    try {
      const data = await organizationAPI.create({
        name: newOrg.name.trim(),
        code: newOrg.code.trim().toUpperCase(),
        description: newOrg.description.trim(),
      });
      showToast("success", data.message);
      setNewOrg({ name: "", code: "", description: "" });
      await Promise.all([fetchPublicOrgs(), fetchCurrentOrgs()]);
      setActiveTab("current");
    } catch (err: any) {
      showToast("error", err.message || "Failed to create organization.");
    } finally {
      setActionLoading(false);
    }
  };

  /* ─── Total pending count for badge ─── */
  const totalPending = Object.values(pendingRequests).reduce(
    (sum, arr) => sum + arr.length,
    0
  );

  /* ─── Which orgs to show in manage tab ─── */
  const manageableOrgs = managedOrgs;

  /* ─── Truncate org name helper (keep up to "MIT Bangalore - Computer Science" length ~33 chars) ─── */
  const truncateOrgName = (name: string, maxLength = 30): string => {
    if (name.length <= maxLength) return name;
    return name.substring(0, maxLength - 1) + "…";
  };

  /* ─── Tabs config (role-based) ─── */
  const tabs: { key: TabKey; label: string; badge?: number }[] = [
    { key: "current", label: "My Organizations" },
    ...(canManageOrgWorkflows
      ? [{ key: "manage" as TabKey, label: "Join Requests", badge: totalPending }]
      : []),
    ...(canViewSelectedOrgMembers
      ? [{ key: "members" as TabKey, label: `Members: ${truncateOrgName(selectedOrg.name)}` }]
      : []),
    { key: "create" as TabKey, label: "Create Organization" },
  ];

  if (loading) {
    return (
      <div className="px-4 sm:px-8 md:px-16 pt-6 sm:pt-10 flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-white/50 text-sm">Loading organizations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-8 md:px-16 pt-6 sm:pt-10 pb-16 flex flex-col gap-6 sm:gap-8 animate-fade-in-up">
      {/* ─── Header ─── */}
      <section className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl px-8 py-6 shadow-lg shadow-black/10">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white font-satoshi tracking-tight">Organizations</h1>
          <p className="text-white/50 text-sm mt-1">
            {adminOrgIds.length > 0
              ? "Manage memberships, send invite links, review join requests, and view members"
              : "Manage your organizations and join new ones using invite links"}
          </p>
        </div>
      </section>

      <section className="backdrop-blur-2xl bg-secondary/45 border border-white/15 rounded-2xl px-6 py-5">
        <p className="text-white font-semibold text-sm mb-1">Invite Access</p>
        <p className="text-white/50 text-xs mb-3">
          Organization joins are invite-only. Paste an invite URL or token shared by an organization admin.
        </p>
        <p className="text-amber-300/90 text-xs font-medium mb-3">
          Approval required by org admin.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={inviteTokenInput}
            onChange={(e) => setInviteTokenInput(e.target.value)}
            placeholder="https://.../invite/TOKEN or TOKEN"
            className="flex-1 rounded-xl px-4 py-2.5 bg-secondary/45 border border-white/20 text-white placeholder:text-white/30 text-sm focus:outline-none focus:border-accent/50"
          />
          <button
            onClick={() => handleRequestViaInvite(inviteTokenInput)}
            disabled={actionLoading || !inviteTokenInput.trim()}
            className="px-4 py-2.5 rounded-xl bg-accent/20 border border-accent/40 text-accent text-sm font-semibold hover:bg-accent/30 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {actionLoading ? "Submitting..." : "Request Join"}
          </button>
        </div>
      </section>

      {/* ─── Pending Request Banner ─── */}
      {pendingOrgs.length > 0 && (
        <section className="backdrop-blur-2xl bg-amber-500/10 border border-amber-400/30 rounded-2xl px-6 py-5 shadow-lg shadow-black/10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-amber-400/20 flex items-center justify-center shrink-0">
              <span className="text-amber-400 text-lg">⏳</span>
            </div>
            <p className="text-amber-300 font-semibold text-sm">
              Pending Requests ({pendingOrgs.length})
            </p>
          </div>
          <div className="flex flex-col gap-2 ml-13">
            {pendingOrgs.map((pOrg) => (
              <div key={pOrg.organizationId} className="flex items-center justify-between gap-3">
                <p className="text-white/80 text-sm">
                  <span className="text-white font-semibold">{pOrg.name}</span>{" "}
                  <span className="text-white/50">({pOrg.code})</span>
                </p>
                <button
                  onClick={() => handleCancelRequest(pOrg.organizationId)}
                  disabled={actionLoading}
                  className="px-4 py-1.5 rounded-xl border border-red-400/40 text-red-400 text-xs
                    hover:bg-red-400/15 transition cursor-pointer disabled:opacity-50 shrink-0"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── Tabs ─── */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            title={tab.key === "members" && selectedOrg ? selectedOrg.name : undefined}
            className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer whitespace-nowrap
              ${
                activeTab === tab.key
                  ? "bg-accent/20 border border-accent/50 text-accent"
                  : "bg-secondary/45 border border-white/10 text-white/60 hover:text-white hover:border-white/20"
              }`}
          >
            {tab.label}
            {tab.badge && tab.badge > 0 ? (
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-[11px]
                font-bold rounded-full bg-accent text-white">
                {tab.badge}
              </span>
            ) : null}
          </button>
        ))}
        {activeTab === "members" && selectedOrg && (
          <button
            onClick={() => { setSelectedOrg(null); setActiveTab("current"); }}
            className="ml-auto px-4 py-2 rounded-xl text-white/50 hover:text-red-400
              hover:bg-red-400/10 transition cursor-pointer text-sm border border-white/10 whitespace-nowrap"
          >
            ✕ Close
          </button>
        )}
      </div>

      {/* ─── Tab Content ─── */}
      {activeTab === "current" && (
        <MyOrgsTab
          currentOrgs={currentOrgs}
          pendingOrgs={pendingOrgs}
          userOrgIds={Array.from(new Set([...(user?.organizationIds || []), ...(user?.orgAdmins || [])]))}
          userAdminOrgIds={user?.orgAdmins || []}
          actionLoading={actionLoading}
          onLeave={handleLeaveOrg}
          onManageMembers={handleSelectOrgForMembers}
          onToggleActive={handleToggleActive}
          onDelete={handleDeleteOrg}
        />
      )}

      {activeTab === "manage" && canManageOrgWorkflows && (
        <ManageRequestsTab
          manageableOrgs={manageableOrgs}
          pendingRequests={pendingRequests}
          invitesByOrg={orgInvites}
          isSuperAdmin={isSuperAdmin}
          actionLoading={actionLoading}
          onApprove={handleApproveJoin}
          onReject={handleRejectJoin}
          onCreateInvite={handleCreateInvite}
          onRevokeInvite={handleRevokeInvite}
        />
      )}

      {activeTab === "members" && selectedOrg && canViewSelectedOrgMembers && (
        <MembersTab
          selectedOrg={selectedOrg}
          members={members}
          unassignedUsers={unassignedUsers}
          memberSearch={memberSearch}
          userId={user?.userId || ""}
          userOrgIds={user?.organizationIds || []}
          isSuperAdmin={isSuperAdmin}
          canManageMembers={canManageSelectedOrgMembers}
          actionLoading={actionLoading}
          onMemberSearch={handleMemberSearch}
          onAddMember={handleAddMember}
          onRemoveMember={handleRemoveMember}
          onPromote={handlePromote}
          onDemote={handleDemote}
          onLeave={handleLeaveOrg}
          onDelete={handleDeleteOrg}
          onTransferOwnership={handleTransferOwnership}
          onEdit={handleEditOrg}
          onUpdateUserName={handleUpdateMemberName}
        />
      )}

      {activeTab === "create" && (
        <CreateOrgForm
          newOrg={newOrg}
          setNewOrg={setNewOrg}
          actionLoading={actionLoading}
          onSubmit={handleCreateOrganization}
        />
      )}

      {/* ─── Leave Org Owner Modal ─── */}
      {leaveModal.show && leaveModal.isOwner && leaveModal.org && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/40">
          <div className="backdrop-blur-2xl bg-secondary/60 border border-white/20 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-xl text-white font-semibold mb-4">⚠️ Organization Owner</h3>
            <p className="text-white/70 mb-6">
              You own "{leaveModal.org.name}" with {leaveModal.memberCount} member
              {leaveModal.memberCount !== 1 ? "s" : ""}. Choose an option:
            </p>
            <div className="space-y-3 mb-6">
              <button
                onClick={() => {
                  const org = leaveModal.org!;
                  setLeaveModal({ show: false, org: null, isOwner: false, memberCount: 0 });
                  handleSelectOrgForMembers(org);
                }}
                className="w-full px-4 py-3 rounded-xl border border-accent/40 bg-accent/10
                  text-accent font-medium text-sm hover:bg-accent/20 transition cursor-pointer"
              >
                👑 Transfer Ownership to Another Member
              </button>
              <button
                onClick={() => {
                  const org = leaveModal.org!;
                  setLeaveModal({ show: false, org: null, isOwner: false, memberCount: 0 });
                  handleDeleteOrg(org);
                }}
                className="w-full px-4 py-3 rounded-xl border border-red-400/40 bg-red-400/10
                  text-red-400 font-medium text-sm hover:bg-red-400/20 transition cursor-pointer"
              >
                🗑️ Delete Organization
              </button>
            </div>
            <button
              onClick={() => setLeaveModal({ show: false, org: null, isOwner: false, memberCount: 0 })}
              className="w-full px-4 py-2 rounded-xl border border-white/15
                text-white/60 text-sm hover:text-white transition cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Organizations;
