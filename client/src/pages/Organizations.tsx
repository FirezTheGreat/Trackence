import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useAuthStore } from "../stores/auth.store";
import { organizationAPI, type OrgMember, type OrganizationInviteRecord } from "../services/organization.service";
import { adminAPI } from "../services/admin.service";
import type { PublicOrg, OrgDetail, TabKey } from "../types/organizations.types";
import MyOrgsTab from "./organizations/MyOrgsTab";
import ManageRequestsTab from "./organizations/ManageRequestsTab";
import MembersTab from "./organizations/MembersTab";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useModalStore } from "../stores/modal.store";
import { toast } from "../stores/toast.store";
import {
  connectAdminSocket,
  connectUserUpdatesSocket,
  disconnectAdminSocket,
  disconnectUserUpdatesSocket,
} from "../services/socket.service";

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
  const [leaveOwnerMembers, setLeaveOwnerMembers] = useState<OrgMember[]>([]);
  const [leaveOwnerMembersLoading, setLeaveOwnerMembersLoading] = useState(false);
  const [leaveTransferTargetId, setLeaveTransferTargetId] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
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

  const refreshSelectedOrgMembers = useCallback(async () => {
    if (!selectedOrg) return;
    try {
      const allMembers = await fetchAllMembers(selectedOrg.organizationId);
      setMembers(allMembers);

      const query = debouncedMemberSearch.trim();
      if (canManageSelectedOrgMembers && query.length >= 2) {
        const unassignedData = await organizationAPI.getUnassignedUsers(query, selectedOrg.organizationId);
        setUnassignedUsers(unassignedData.users || []);
      }
    } catch {
      // keep existing UI data on transient failures
    }
  }, [selectedOrg, debouncedMemberSearch, canManageSelectedOrgMembers]);

  useEffect(() => {
    const socket = connectUserUpdatesSocket({
      onOrganizationMembershipChanged: () => {
        refreshOrganizationView().catch(() => {
          // no-op: transient sync failures should not break the page
        });
      },
      onOrganizationMembershipUpdated: async (data) => {
        await refreshOrganizationView();

        if (data.organizationId === selectedOrg?.organizationId) {
          await refreshSelectedOrgMembers();
        }

        if (adminOrgIds.includes(data.organizationId)) {
          await fetchAllPendingRequests();
          await fetchAllOrgInvites();
        }
      },
    });

    return () => {
      socket.removeAllListeners("user:org-membership-changed");
      socket.removeAllListeners("organization:membership-updated");
      disconnectUserUpdatesSocket();
    };
  }, [
    refreshOrganizationView,
    refreshSelectedOrgMembers,
    selectedOrg,
    adminOrgIds,
    fetchAllPendingRequests,
    fetchAllOrgInvites,
  ]);

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
  }, [currentOrgs, adminOrgIds, adminOrgIdsKey]);

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
  }, [user?.userId, user?.role, fetchPendingOrgIds]);

  useEffect(() => {
    if (!canManageOrgWorkflows) return;

    const socket = connectAdminSocket({
      onOrganizationJoinRequestUpdated: (data) => {
        if (!adminOrgIds.includes(data.organizationId)) return;

        fetchAllPendingRequests().catch(() => {
          // no-op
        });
        fetchAllOrgInvites().catch(() => {
          // no-op
        });
        fetchPendingOrgIds().catch(() => {
          // no-op
        });
      },
    });

    return () => {
      socket.removeAllListeners("organization:join-request-updated");
      disconnectAdminSocket();
    };
  }, [canManageOrgWorkflows, adminOrgIds, fetchAllPendingRequests, fetchAllOrgInvites, fetchPendingOrgIds]);

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
  }, [pendingOrgIds, publicOrgs]);

  /* ─── Fetch pending requests when managed orgs change ─── */
  useEffect(() => {
    fetchAllPendingRequests();
    fetchAllOrgInvites();
  }, [canManageOrgWorkflows, managedOrgs, fetchAllPendingRequests, fetchAllOrgInvites]);

  const handleCreateInvite = async (orgId: string, email?: string, userId?: string): Promise<boolean> => {
    setActionLoading(true);
    try {
      const normalizedEmail = (email || "").trim().toLowerCase();
      const normalizedUserId = (userId || "").trim();

      if (normalizedUserId && user?.userId && normalizedUserId === user.userId) {
        showToast("error", "You cannot invite yourself.");
        return false;
      }

      if (normalizedEmail && user?.email && normalizedEmail === String(user.email).trim().toLowerCase()) {
        showToast("error", "You cannot invite yourself.");
        return false;
      }

      const result = await organizationAPI.createInvite(orgId, {
        email: normalizedEmail || undefined,
        userId: normalizedUserId || undefined,
      });

      let copiedToClipboard = false;
      const inviteLink = result.invite?.inviteLink;
      if (inviteLink && navigator?.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(inviteLink);
          copiedToClipboard = true;
        } catch {
          copiedToClipboard = false;
        }
      }

      if (copiedToClipboard) {
        showToast(
          "success",
          normalizedEmail
            ? `${result.message} Invite link copied to clipboard.`
            : `${result.message} It has been copied to your clipboard.`
        );
      } else if (inviteLink) {
        await useModalStore.getState().alert(
          "Invite Link Ready",
          `Clipboard access was denied on this device. Copy this link manually:\n\n${inviteLink}`
        );
        showToast("success", result.message);
      } else {
        showToast("success", result.message);
      }

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
      setLeaveOwnerMembers([]);
      setLeaveTransferTargetId("");
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
        setLeaveOwnerMembersLoading(true);
        try {
          const allMembers = await fetchAllMembers(org.organizationId);
          const transferableMembers = allMembers.filter((member) => member.userId !== user?.userId);
          setLeaveOwnerMembers(transferableMembers);
          setLeaveTransferTargetId(transferableMembers[0]?.userId || "");
        } catch {
          setLeaveOwnerMembers([]);
          setLeaveTransferTargetId("");
        } finally {
          setLeaveOwnerMembersLoading(false);
        }
      } else {
        showToast("error", err.message || "Failed to leave organization.");
      }
    } finally {
      setActionLoading(false);
    }
  };

  const closeLeaveOwnerModal = () => {
    setLeaveModal({ show: false, org: null, isOwner: false, memberCount: 0 });
    setLeaveOwnerMembers([]);
    setLeaveTransferTargetId("");
    setLeaveOwnerMembersLoading(false);
  };

  const handleTransferOwnershipAndLeave = async () => {
    if (!leaveModal.org || !leaveTransferTargetId) return;

    setActionLoading(true);
    try {
      const transferData = await organizationAPI.transferOwnership(
        leaveModal.org.organizationId,
        leaveTransferTargetId
      );
      showToast("success", transferData.message);

      const leaveData = await organizationAPI.leaveOrganization(leaveModal.org.organizationId);
      showToast("success", leaveData.message);

      closeLeaveOwnerModal();

      await checkAuth();
      const refreshedUser = useAuthStore.getState().user;
      const refreshedOrgIds = Array.from(
        new Set([...(refreshedUser?.organizationIds || []), ...(refreshedUser?.orgAdmins || [])])
      );
      await fetchCurrentOrgs(undefined, refreshedOrgIds);
      await fetchPublicOrgs();

      if (selectedOrg?.organizationId === leaveModal.org.organizationId) {
        setSelectedOrg(null);
        setActiveTab("current");
      }
    } catch (err: any) {
      showToast("error", err.message || "Failed to transfer ownership and leave organization.");
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

      // Optimistic local cleanup so the deleted org disappears instantly.
      setCurrentOrgs((prev) => prev.filter((item) => item.organizationId !== org.organizationId));
      setManagedOrgs((prev) => prev.filter((item) => item.organizationId !== org.organizationId));
      setPendingRequests((prev) => {
        const next = { ...prev };
        delete next[org.organizationId];
        return next;
      });
      setOrgInvites((prev) => {
        const next = { ...prev };
        delete next[org.organizationId];
        return next;
      });

      setSelectedOrg(null);
      setActiveTab("current");

      // Server-authoritative sync to avoid stale membership snapshots.
      await refreshOrganizationView();
      await fetchAllPendingRequests();
      await fetchAllOrgInvites();
    } catch (err: any) {
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
              : "Manage your organizations"}
          </p>
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

      {/* ─── Leave Org Owner Modal ─── */}
      {leaveModal.show && leaveModal.isOwner && leaveModal.org && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/40">
          <div className="backdrop-blur-2xl bg-secondary/65 border border-white/20 rounded-2xl p-5 sm:p-7 max-w-2xl w-full mx-4 shadow-2xl max-h-[85vh] overflow-y-auto">
            <h3 className="text-xl sm:text-2xl text-white font-semibold mb-2">Organization Owner Action Required</h3>
            <p className="text-white/70 text-sm sm:text-base mb-5">
              You own <span className="text-white font-semibold">{leaveModal.org.name}</span> with {leaveModal.memberCount} member
              {leaveModal.memberCount !== 1 ? "s" : ""}. Transfer ownership before leaving.
            </p>

            {leaveOwnerMembersLoading ? (
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-5 mb-5 flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <p className="text-white/70 text-sm">Loading member list...</p>
              </div>
            ) : leaveOwnerMembers.length > 0 ? (
              <div className="mb-5">
                <p className="text-white/60 text-xs uppercase tracking-wider mb-3">Select New Owner</p>
                <div className="grid grid-cols-1 gap-2">
                  {leaveOwnerMembers.map((member) => {
                    const selected = leaveTransferTargetId === member.userId;
                    return (
                      <button
                        key={member.userId}
                        onClick={() => setLeaveTransferTargetId(member.userId)}
                        className={`w-full text-left rounded-xl border px-4 py-3 transition cursor-pointer ${
                          selected
                            ? "border-accent/50 bg-accent/10"
                            : "border-white/10 bg-white/5 hover:bg-white/10"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-white font-medium truncate">{member.name}</p>
                            <p className="text-white/50 text-xs truncate">{member.email}</p>
                          </div>
                          <span
                            className={`px-2 py-1 rounded-md text-[11px] uppercase tracking-wide border ${
                              member.role === "admin"
                                ? "border-amber-400/40 text-amber-300 bg-amber-500/10"
                                : "border-blue-400/30 text-blue-300 bg-blue-500/10"
                            }`}
                          >
                            {member.role}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-4 mb-5">
                <p className="text-amber-300 text-sm">
                  No eligible members available to transfer ownership. You can delete the organization or invite members first.
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <button
                onClick={handleTransferOwnershipAndLeave}
                disabled={actionLoading || leaveOwnerMembersLoading || !leaveTransferTargetId}
                className="flex-1 px-4 py-3 rounded-xl border border-accent/40 bg-accent/15 text-accent font-semibold text-sm hover:bg-accent/25 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading ? "Processing..." : "Transfer Ownership & Leave"}
              </button>
              <button
                onClick={() => {
                  const org = leaveModal.org!;
                  closeLeaveOwnerModal();
                  handleDeleteOrg(org);
                }}
                disabled={actionLoading}
                className="flex-1 px-4 py-3 rounded-xl border border-red-400/40 bg-red-500/10 text-red-300 font-semibold text-sm hover:bg-red-500/20 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete Organization
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => {
                  const org = leaveModal.org!;
                  closeLeaveOwnerModal();
                  handleSelectOrgForMembers(org);
                }}
                className="flex-1 px-4 py-2.5 rounded-xl border border-white/15 text-white/70 text-sm hover:text-white hover:bg-white/5 transition cursor-pointer"
              >
                Open Full Member Management
              </button>
              <button
                onClick={closeLeaveOwnerModal}
                className="flex-1 px-4 py-2.5 rounded-xl border border-white/15 text-white/60 text-sm hover:text-white transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Organizations;
