import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/auth.store";
import { organizationAPI } from "../services/organization.service";

/* ─── Types ─────────────────────────────────────────── */

interface DashboardCard {
    icon: string;
    title: string;
    description: string;
    path: string;
    /** Which roles can see this card */
    roles: Array<"faculty" | "admin" | "superAdmin" | "platform_owner">;
}

interface DashboardSection {
    key: string;
    title: string;
    /** Minimum role required to see the entire section */
    minRole: "faculty" | "admin" | "superAdmin" | "platform_owner";
}

/* ─── Static Config ─────────────────────────────────── */

const SECTIONS: DashboardSection[] = [
    { key: "quick", title: "Quick Actions", minRole: "faculty" },
    { key: "admin", title: "Administration", minRole: "admin" },
    { key: "system", title: "System & Security", minRole: "platform_owner" },
];

const CARDS: DashboardCard[] = [
    // ── Quick Actions (all roles) ──
    {
        icon: "📱",
        title: "Scan QR",
        description: "Mark your attendance by scanning session QR codes",
        path: "/scan-qr",
        roles: ["faculty", "admin"],
    },
    {
        icon: "🏢",
        title: "Organizations",
        description: "Browse, join, and manage your organizations",
        path: "/organizations",
        roles: ["faculty", "admin"],
    },
    {
        icon: "📋",
        title: "My Attendance",
        description: "View your attendance history, stats, and session records",
        path: "/my-attendance",
        roles: ["faculty", "admin"],
    },
    {
        icon: "👤",
        title: "My Profile",
        description: "View and manage your account details and preferences",
        path: "/profile",
        roles: ["faculty", "admin"],
    },
    // ── Administration (admin only) ──
    {
        icon: "📋",
        title: "Manage Sessions",
        description: "Create and manage attendance sessions with live QR codes",
        path: "/admin/sessions",
        roles: ["admin"],
    },
    {
        icon: "📊",
        title: "Session History",
        description: "View past sessions and attendance records",
        path: "/admin/session-history",
        roles: ["admin"],
    },
    {
        icon: "🔍",
        title: "Absence Reports",
        description: "Track and review absence requests from faculty",
        path: "/admin/absences",
        roles: ["admin"],
    },
    {
        icon: "📈",
        title: "Analytics",
        description: "View comprehensive metrics, charts, and insights",
        path: "/admin/analytics",
        roles: ["admin"],
    },
    // ── System & Security (superAdmin only) ──
    {
        icon: "📝",
        title: "Audit Logs",
        description: "Review system activity and security logs",
        path: "/admin/audit",
        roles: ["superAdmin", "platform_owner"],
    },
    {
        icon: "⚙️",
        title: "System Health",
        description: "Monitor system performance and health metrics",
        path: "/admin/system",
        roles: ["superAdmin", "platform_owner"],
    },
];

const ROLE_LABEL: Record<string, string> = {
    faculty: "Faculty",
    admin: "Administrator",
    superAdmin: "Super Admin",
    platform_owner: "Platform Owner",
};

const ROLE_BADGE: Record<string, string> = {
    faculty: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    admin: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    superAdmin: "bg-accent/20 text-accent border-accent/40",
    platform_owner: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
};

const ROLE_RANK: Record<string, number> = {
    faculty: 0,
    admin: 1,
    superAdmin: 2,
    platform_owner: 2,
};

/* ─── Helpers ───────────────────────────────────────── */

/** Returns true if userRole meets or exceeds requiredRole */
const hasAccess = (userRole: string, requiredRole: string) =>
    (ROLE_RANK[userRole] ?? -1) >= (ROLE_RANK[requiredRole] ?? 99);

/** Map a card to the first section it belongs to */
const cardSection = (card: DashboardCard): string => {
    if (["Scan QR", "Organizations", "My Attendance", "My Profile"].includes(card.title)) return "quick";
    if (["Manage Sessions", "Session History", "Absence Reports", "Analytics"].includes(card.title)) return "admin";
    return "system";
};

/* ─── Component ─────────────────────────────────────── */

const AdminDashboard = () => {
    const navigate = useNavigate();
    const { user } = useAuthStore();

    const isSuperAdmin = user?.platformRole === "superAdmin";
    const isPlatformOwner = user?.platformRole === "platform_owner";
    const role = user?.role ?? "faculty";
    const accessRole = isPlatformOwner ? "platform_owner" : isSuperAdmin ? "superAdmin" : role;
    const displayRole = isPlatformOwner ? "platform_owner" : isSuperAdmin ? "superAdmin" : role;

    /* ── Derived card / section lists ── */
    const visibleCards = useMemo(() => {
        return CARDS.filter((c) => {
            if (isPlatformOwner) {
                return c.roles.includes("platform_owner");
            }
            if (isSuperAdmin) {
                return c.roles.includes("superAdmin") || c.roles.includes("admin");
            }
            return c.roles.includes(role as "faculty" | "admin");
        });
    }, [isPlatformOwner, isSuperAdmin, role]);

    const visibleSections = useMemo(() => {
        return SECTIONS
            .filter((s) => hasAccess(accessRole, s.minRole))
            .map((s) => ({
                ...s,
                cards: visibleCards.filter((c) => cardSection(c) === s.key),
            }))
            .filter((s) => s.cards.length > 0);
    }, [accessRole, visibleCards]);

    const [orgName, setOrgName] = useState("");

    useEffect(() => {
        fetchOrgName();
    }, [user?.currentOrganizationId]);

    /* ── Data fetching ── */
    const fetchOrgName = async () => {
        if (!user?.organizationIds?.length) return;
        // Use currentOrganizationId if set, otherwise fallback to first org
        const orgId = user.currentOrganizationId || user.organizationIds[0];
        try {
            const data = await organizationAPI.get(orgId);
            setOrgName(data.organization?.name || "");
        } catch {
            /* silent */
        }
    };

    /* ── Render ── */
    return (
        <div className="px-4 sm:px-8 md:px-16 pt-8 md:pt-10 flex flex-col gap-8 pb-16 animate-fade-in-up">
            {/* ── Header ── */}
            <section className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl px-6 md:px-8 py-6 shadow-lg shadow-black/10">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-white font-satoshi tracking-tight">
                            Welcome back, {user?.name?.split(" ")[0] ?? "User"}
                        </h1>
                        <div className="flex flex-wrap items-center gap-3 mt-2">
                            <span
                                className={`inline-flex items-center px-3 py-0.5 rounded-full text-xs font-medium border ${ROLE_BADGE[displayRole] ?? ROLE_BADGE.faculty}`}
                            >
                                {ROLE_LABEL[displayRole] ?? "User"}
                            </span>
                            {orgName && (
                                <span className="text-white/40 text-sm">
                                    {orgName}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Card sections ── */}
            {visibleSections.map((section) => (
                <section key={section.key}>
                    <h2 className="text-lg text-white/70 font-semibold mb-4 tracking-wide">
                        {section.title}
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {section.cards.map((card) => (
                            <button
                                key={card.title}
                                onClick={() => navigate(card.path)}
                                className="backdrop-blur-2xl bg-secondary/45 border border-white/20 rounded-2xl px-6 py-8 shadow-lg shadow-black/10
                  hover:bg-secondary/60 hover:border-white/30 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300
                  text-left group cursor-pointer flex flex-col h-full min-h-35"
                            >
                                <div className="flex items-center gap-4 mb-3">
                                    <span className="text-3xl">{card.icon}</span>
                                    <h3 className="text-xl text-white font-semibold group-hover:text-accent transition-colors">
                                        {card.title}
                                    </h3>
                                </div>
                                <p className="text-white/60 text-sm mt-auto">{card.description}</p>
                            </button>
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
};

export default AdminDashboard;

