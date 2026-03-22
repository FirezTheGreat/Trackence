import React, { useEffect, useRef, useState } from "react";
import { Building2, ChevronDown } from "lucide-react";
import { useAuthStore } from "../stores/auth.store";
import { apiGet } from "../services/api";

interface Organization {
    organizationId: string;
    name: string;
    code: string;
}

export const OrgSwitcher: React.FC = () => {
    const { user, setCurrentOrganization } = useAuthStore();
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isFetching, setIsFetching] = useState(true);
    const defaultOrgInitForUser = useRef<string | null>(null);
    const orgIdsKey = (user?.organizationIds ?? []).join("|");

    // Persist a default current organization when missing
    useEffect(() => {
        if (!user?.organizationIds?.length) return;
        if (user.currentOrganizationId) {
            defaultOrgInitForUser.current = user.userId ?? null;
            return;
        }

        if (defaultOrgInitForUser.current === (user.userId ?? null)) return;
        defaultOrgInitForUser.current = user.userId ?? null;

        const defaultOrgId = user.organizationIds[0];
        setCurrentOrganization(defaultOrgId).catch(() => {
            // Silent fail; backend normalization on /me also handles this
        });
    }, [orgIdsKey, user?.currentOrganizationId, user?.userId, setCurrentOrganization]);

    // Fetch all organizations the user belongs to
    useEffect(() => {
        const fetchOrganizations = async () => {
            if (!user?.organizationIds?.length) {
                setIsFetching(false);
                return;
            }

            try {
                const data = await apiGet<{ organizations: Organization[] }>(
                    "/api/auth/organizations",
                    { skipAuth: true }
                );

                const orgMap = new Map(
                    (data.organizations || []).map((org) => [org.organizationId, org])
                );

                const memberOrgs = user.organizationIds.map((orgId) => {
                    const found = orgMap.get(orgId);
                    if (found) return found;
                    return {
                        organizationId: orgId,
                        name: "Organization",
                        code: orgId,
                    };
                });

                setOrganizations(memberOrgs);
            } catch (error) {
                console.error("Failed to fetch organizations:", error);
            } finally {
                setIsFetching(false);
            }
        };

        fetchOrganizations();
    }, [orgIdsKey]);

    // Handle organization selection
    const handleSelect = async (orgId: string) => {
        try {
            await setCurrentOrganization(orgId);
            setIsOpen(false);
        } catch (error) {
            console.error("Failed to set current organization:", error);
        }
    };

    if (isFetching) {
        return (
            <div className="px-4 py-2 text-sm text-white/60 flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                <span>Loading...</span>
            </div>
        );
    }

    if (!user?.organizationIds?.length) {
        return null;
    }

    // Get current organization
    const currentOrgId =
        user.currentOrganizationId || user.organizationIds[0] || "";
    const currentOrg = organizations.find(
        (org) => org.organizationId === currentOrgId
    );

    // If user only has one organization, show it as a static display
    if (organizations.length === 1) {
        return (
            <div className="px-4 py-2 text-sm font-medium text-white/90 flex items-center gap-2 bg-white/10 rounded-lg border border-white/20 backdrop-blur-md">
                <Building2 className="w-4 h-4 text-accent" />
                <span>{currentOrg?.name || "Organization"}</span>
            </div>
        );
    }

    // If user has multiple organizations, show dropdown
    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="px-4 py-2 text-sm font-medium text-white/90 flex items-center gap-2 bg-white/10 rounded-lg border border-white/20 backdrop-blur-md hover:bg-white/15 transition-colors cursor-pointer"
            >
                <Building2 className="w-4 h-4 text-accent" />
                <span>{currentOrg?.name || "Select Organization"}</span>
                <ChevronDown
                    className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""
                        }`}
                />
            </button>

            {isOpen && (
                <div className="absolute top-full mt-2 right-0 w-64 bg-white/95 backdrop-blur-md rounded-lg shadow-xl border border-gray-200 max-h-64 overflow-y-auto z-50">
                    <div className="py-1 flex flex-col">
                        {organizations.map((org) => (
                            <button
                                key={org.organizationId}
                                onClick={() => handleSelect(org.organizationId)}
                                className={`w-full px-4 py-2 text-left text-sm hover:bg-accent/10 transition-colors cursor-pointer ${org.organizationId === currentOrgId
                                        ? "bg-accent/20 font-medium text-accent"
                                        : "text-gray-700"
                                    }`}
                            >
                                <div className="flex items-center gap-2">
                                    <Building2 className="w-4 h-4" />
                                    <div>
                                        <div>{org.name}</div>
                                        <div className="text-xs text-gray-500">{org.code}</div>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Click outside to close */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-30"
                    onClick={() => setIsOpen(false)}
                />
            )}
        </div>
    );
};
