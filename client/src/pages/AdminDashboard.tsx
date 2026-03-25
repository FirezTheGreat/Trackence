import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useAuthStore } from "../stores/auth.store";
import { organizationAPI } from "../services/organization.service";
import { shouldEnableIOSPerfMode } from "../utils/device";
import {
    QrCode,
    Building2,
    ClipboardList,
    UserCircle,
    CalendarCheck,
    History,
    UserX,
    BarChart3,
    ShieldCheck,
    Activity,
    Search,
    PlusCircle
} from "lucide-react";

/* ─── Types ─────────────────────────────────────────── */

interface DashboardCard {
    icon: React.ElementType;
    title: string;
    description: string;
    path: string;
    roles: Array<"member" | "admin" | "platform_owner">;
    color: string;
    bg: string;
}

interface DashboardSection {
    key: string;
    title: string;
    minRole: "member" | "admin" | "platform_owner";
}

/* ─── Static Config ─────────────────────────────────── */

const SECTIONS: DashboardSection[] = [
    { key: "quick", title: "Quick Actions", minRole: "member" },
    { key: "admin", title: "Administration", minRole: "admin" },
    { key: "system", title: "System & Security", minRole: "platform_owner" },
];

const CARDS: DashboardCard[] = [
    // ── Quick Actions (all roles) ──
    {
        icon: QrCode,
        title: "Scan QR",
        description: "Mark your attendance by scanning session QR codes",
        path: "/scan-qr",
        roles: ["member", "admin"],
        color: "text-blue-400",
        bg: "bg-blue-400/10 group-hover:bg-blue-400/20",
    },
    {
        icon: Building2,
        title: "Organizations",
        description: "Browse, join, and manage your organizations",
        path: "/organizations",
        roles: ["member", "admin"],
        color: "text-purple-400",
        bg: "bg-purple-400/10 group-hover:bg-purple-400/20",
    },
    {
        icon: ClipboardList,
        title: "My Attendance",
        description: "View your attendance history, stats, and session records",
        path: "/my-attendance",
        roles: ["member", "admin"],
        color: "text-emerald-400",
        bg: "bg-emerald-400/10 group-hover:bg-emerald-400/20",
    },
    {
        icon: UserCircle,
        title: "My Profile",
        description: "View and manage your account details and preferences",
        path: "/profile",
        roles: ["member", "admin"],
        color: "text-amber-400",
        bg: "bg-amber-400/10 group-hover:bg-amber-400/20",
    },
    // ── Administration (admin only) ──
    {
        icon: CalendarCheck,
        title: "Manage Sessions",
        description: "Create and manage attendance sessions with live QR codes",
        path: "/admin/sessions",
        roles: ["admin"],
        color: "text-orange-400",
        bg: "bg-orange-400/10 group-hover:bg-orange-400/20",
    },
    {
        icon: History,
        title: "Session History",
        description: "View past sessions and attendance records",
        path: "/admin/session-history",
        roles: ["admin"],
        color: "text-indigo-400",
        bg: "bg-indigo-400/10 group-hover:bg-indigo-400/20",
    },
    {
        icon: UserX,
        title: "Absence Reports",
        description: "Track and review absence requests from members",
        path: "/admin/absences",
        roles: ["admin"],
        color: "text-rose-400",
        bg: "bg-rose-400/10 group-hover:bg-rose-400/20",
    },
    {
        icon: BarChart3,
        title: "Analytics",
        description: "View comprehensive metrics, charts, and insights",
        path: "/admin/analytics",
        roles: ["admin"],
        color: "text-cyan-400",
        bg: "bg-cyan-400/10 group-hover:bg-cyan-400/20",
    },
    // ── System & Security (platform owner only) ──
    {
        icon: ShieldCheck,
        title: "Audit Logs",
        description: "Review system activity and security logs",
        path: "/admin/audit",
        roles: ["platform_owner"],
        color: "text-slate-400",
        bg: "bg-slate-400/10 group-hover:bg-slate-400/20",
    },
    {
        icon: Activity,
        title: "System Health",
        description: "Monitor system performance and health metrics",
        path: "/admin/system",
        roles: ["platform_owner"],
        color: "text-green-400",
        bg: "bg-green-400/10 group-hover:bg-green-400/20",
    },
];

const ROLE_LABEL: Record<string, string> = {
    member: "Member",
    admin: "Administrator",
    platform_owner: "Platform Owner",
};

const ROLE_BADGE: Record<string, string> = {
    member: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    admin: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    platform_owner: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
};

const ROLE_RANK: Record<string, number> = {
    member: 0,
    admin: 1,
    platform_owner: 2,
};

/* ─── Helpers ───────────────────────────────────────── */

const hasAccess = (userRole: string, requiredRole: string) =>
    (ROLE_RANK[userRole] ?? -1) >= (ROLE_RANK[requiredRole] ?? 99);

const cardSection = (card: DashboardCard): string => {
    if (["Scan QR", "Organizations", "My Attendance", "My Profile"].includes(card.title)) return "quick";
    if (["Manage Sessions", "Session History", "Absence Reports", "Analytics"].includes(card.title)) return "admin";
    return "system";
};

/* ─── Component ─────────────────────────────────────── */

const AdminDashboard = () => {
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const shouldReduceMotion = useReducedMotion();
    const disableDecorativeMotion = shouldReduceMotion || shouldEnableIOSPerfMode();

    const isPlatformOwner = user?.platformRole === "platform_owner";
    const role = user?.role ?? "member";
    const accessRole = isPlatformOwner ? "platform_owner" : role;
    const displayRole = isPlatformOwner ? "platform_owner" : role;
    const hasOrg = (user?.organizationIds?.length ?? 0) > 0;

    /* ── Derived card / section lists ── */
    const visibleCards = useMemo(() => {
        return CARDS.filter((c) => {
            if (isPlatformOwner) {
                return c.roles.includes("platform_owner") || c.roles.includes("admin") || c.roles.includes("member");
            }
            return c.roles.includes(role as "member" | "admin");
        });
    }, [isPlatformOwner, role]);

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

    const fetchOrgName = useCallback(async () => {
        if (!hasOrg) return;
        const orgId = user?.currentOrganizationId || user?.organizationIds[0];
        try {
            const data = await organizationAPI.get(orgId!);
            setOrgName(data.organization?.name || "");
        } catch {
            /* silent */
        }
    }, [hasOrg, user?.currentOrganizationId, user?.organizationIds]);

    // Fetches organization metadata on org switch; state updates happen after async IO.
    useEffect(() => {
        fetchOrgName();
    }, [fetchOrgName]);

    /* ── Empty State (No Organizations) ── */
    if (!hasOrg && !isPlatformOwner) {
        return (
            <div className="px-3 sm:px-6 md:px-16 pt-12 md:pt-24 flex flex-col items-center justify-center min-h-[70vh] text-center pb-20">
                <motion.div
                    initial={disableDecorativeMotion ? undefined : { opacity: 0, scale: 0.9 }}
                    animate={disableDecorativeMotion ? undefined : { opacity: 1, scale: 1 }}
                    transition={disableDecorativeMotion ? { duration: 0 } : { duration: 0.5, ease: "easeOut" }}
                    className="flex flex-col items-center max-w-2xl"
                >
                    <div className="w-24 h-24 bg-[#EE441C]/10 border border-[#EE441C]/20 rounded-full flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(238,68,28,0.15)] relative">
                        <Building2 className="w-10 h-10 text-[#EE441C]" />
                        <div className="absolute inset-0 bg-[#EE441C]/5 blur-xl rounded-full" />
                    </div>

                    <h1 className="text-4xl md:text-5xl font-bold text-white font-satoshi tracking-tight mb-4">
                        Welcome to Trackence
                    </h1>
                    
                    <p className="text-white/60 font-inter text-lg mb-10 leading-relaxed">
                        You aren't associated with any organizations yet. Get started by joining your institution or creating a new workspace.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full">
                        <motion.button
                            whileHover={disableDecorativeMotion ? undefined : { scale: 1.02 }}
                            whileTap={disableDecorativeMotion ? undefined : { scale: 0.98 }}
                            onClick={() => navigate("/organizations/join")}
                            className="flex flex-col items-start text-left p-6 md:p-8 rounded-3xl bg-secondary/40 border border-white/10 hover:bg-secondary/60 hover:border-white/20 transition-all duration-300 relative overflow-hidden group cursor-pointer"
                        >
                            <div className="perf-auth-deco absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-[50px] rounded-full pointer-events-none group-hover:bg-blue-500/20 transition-all duration-500" />
                            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                                <Search className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2 font-satoshi group-hover:text-blue-400 transition-colors">Join Organization</h3>
                            <p className="text-white/50 text-sm font-inter leading-relaxed">
                                Have an invite code or looking for an institution? Find and join an existing workspace.
                            </p>
                        </motion.button>

                        <motion.button
                            whileHover={disableDecorativeMotion ? undefined : { scale: 1.02 }}
                            whileTap={disableDecorativeMotion ? undefined : { scale: 0.98 }}
                            onClick={() => navigate("/organizations/create")}
                            className="flex flex-col items-start text-left p-6 md:p-8 rounded-3xl bg-secondary/40 border border-white/10 hover:bg-secondary/60 hover:border-white/20 transition-all duration-300 relative overflow-hidden group cursor-pointer"
                        >
                            <div className="perf-auth-deco absolute top-0 right-0 w-32 h-32 bg-[#EE441C]/10 blur-[50px] rounded-full pointer-events-none group-hover:bg-[#EE441C]/20 transition-all duration-500" />
                            <div className="w-12 h-12 rounded-2xl bg-[#EE441C]/10 text-[#EE441C] flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                                <PlusCircle className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2 font-satoshi group-hover:text-[#EE441C] transition-colors">Create Organization</h3>
                            <p className="text-white/50 text-sm font-inter leading-relaxed">
                                Set up a new workspace for your institution, manage members, and track attendance.
                            </p>
                        </motion.button>
                    </div>
                </motion.div>
            </div>
        );
    }

    /* ── Render Main Dashboard ── */
    return (
        <div className="px-3 sm:px-6 md:px-16 pt-8 md:pt-10 flex flex-col gap-10 pb-16 animate-fade-in-up">
            {/* ── Header ── */}
            <section className="perf-section backdrop-blur-2xl bg-secondary/30 border border-white/10 rounded-3xl px-6 md:px-10 py-8 shadow-xl shadow-black/10 relative overflow-hidden">
                <div className="perf-auth-deco absolute top-0 right-0 w-64 h-64 bg-[#EE441C]/5 blur-[80px] rounded-full pointer-events-none" />
                <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 relative z-10">
                    <div>
                        <h1 className="text-3xl md:text-4xl font-bold text-white font-satoshi tracking-tight mb-2">
                            Welcome back, {user?.name?.split(" ")[0] ?? "User"}
                        </h1>
                        <div className="flex flex-wrap items-center gap-3">
                            <span
                                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${ROLE_BADGE[displayRole] ?? ROLE_BADGE.member}`}
                            >
                                {ROLE_LABEL[displayRole] ?? "User"}
                            </span>
                            {orgName && (
                                <span className="flex items-center gap-2 text-white/60 text-sm font-inter">
                                    <span className="w-1 h-1 rounded-full bg-white/30" />
                                    {orgName}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Card sections ── */}
            {visibleSections.map((section) => (
                <section key={section.key} className="perf-section flex flex-col gap-4">
                    <h2 className="text-xl text-white/90 font-bold font-satoshi flex items-center gap-3">
                        {section.title}
                        <div className="h-px bg-white/10 flex-1 ml-2" />
                    </h2>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                        {section.cards.map((card) => (
                            <motion.button
                                whileHover={disableDecorativeMotion ? undefined : { y: -4 }}
                                whileTap={disableDecorativeMotion ? undefined : { scale: 0.98 }}
                                key={card.title}
                                onClick={() => navigate(card.path)}
                                className="backdrop-blur-2xl bg-secondary/40 border border-white/10 rounded-2xl p-6 shadow-lg shadow-black/10
                                    hover:bg-secondary/60 hover:border-white/20 hover:shadow-2xl transition-all duration-300
                                    text-left group cursor-pointer flex flex-col h-full relative overflow-hidden"
                            >
                                <div className={`perf-auth-deco absolute -right-6 -top-6 w-24 h-24 blur-2xl rounded-full transition-colors duration-500 ${card.bg.replace('group-hover:', '')}`} />
                                
                                <div className={`w-12 h-12 rounded-xl mb-5 flex items-center justify-center transition-colors duration-300 ${card.bg} ${card.color}`}>
                                    <card.icon className="w-6 h-6" />
                                </div>
                                
                                <h3 className="text-lg text-white font-bold font-satoshi mb-2 group-hover:text-white/90 transition-colors">
                                    {card.title}
                                </h3>
                                
                                <p className="text-white/50 text-sm font-inter leading-relaxed mt-auto">
                                    {card.description}
                                </p>
                            </motion.button>
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
};

export default AdminDashboard;

