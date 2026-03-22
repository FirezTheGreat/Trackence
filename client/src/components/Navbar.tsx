import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, User, LayoutDashboard } from "lucide-react";
import logo from "../assets/images/logo.png";
import { useAuthStore } from "../stores/auth.store";
import { OrgSwitcher } from "./OrgSwitcher";
import { APP_NAME } from "../config/app";

export default function Navbar() {
    const { isAuthenticated, user } = useAuthStore();
    const location = useLocation();
    const [mobileOpen, setMobileOpen] = useState(false);

    const isActive = (path: string) => location.pathname === path;

    return (
        <nav
            className="fixed inset-x-0 top-0 py-4 sm:py-6 px-4 sm:px-8 md:px-16 pointer-events-none"
            style={{ zIndex: 100 }}
        >
            <div className="flex items-center justify-between">
                {/* Left: Branding */}
                <Link
                    to="/"
                    className="flex items-center gap-x-3 sm:gap-x-4 font-geist-mono tracking-wide
                     backdrop-blur-md rounded-[14px] px-3 sm:px-4 py-2
                     bg-primary/80 hover:bg-primary
                     transition duration-200 cursor-pointer pointer-events-auto"
                >
                    <img
                        src={logo}
                        alt={`${APP_NAME} Logo`}
                        className="h-8 sm:h-9 w-auto object-contain"
                    />
                    <span className="text-white/80 font-medium text-sm sm:text-xl tracking-wide max-w-40 sm:max-w-none truncate">
                        {APP_NAME}
                    </span>
                </Link>

                {/* Right: Navigation */}
                {isAuthenticated ? (
                    <>
                        {/* Desktop nav */}
                        <div className="hidden md:flex items-center gap-3 relative z-50">
                            <div className="pointer-events-auto">
                                <OrgSwitcher />
                            </div>

                            <Link
                                to="/dashboard"
                                className={`flex items-center gap-x-2 font-geist-mono tracking-wide
                           backdrop-blur-md rounded-[14px] px-4 py-2
                           bg-primary/80 hover:bg-primary
                           transition duration-200 text-sm font-medium cursor-pointer pointer-events-auto
                           ${isActive("/dashboard") ? "text-accent border border-accent/30" : "text-white/70 hover:text-accent"}`}
                            >
                                <LayoutDashboard className="w-4 h-4" />
                                Dashboard
                            </Link>

                            <Link
                                to="/profile"
                                className={`flex items-center gap-x-2 font-geist-mono tracking-wide
                           backdrop-blur-md rounded-[14px] px-4 py-2
                           bg-primary/80 hover:bg-primary
                           transition duration-200 text-sm font-medium cursor-pointer pointer-events-auto
                           ${isActive("/profile") ? "text-accent border border-accent/30" : "text-white/70 hover:text-accent"}`}
                            >
                                <User className="w-4 h-4" />
                                {user?.name?.split(" ")[0] || "Profile"}
                            </Link>
                        </div>

                        {/* Mobile hamburger */}
                        <button
                            onClick={() => setMobileOpen(!mobileOpen)}
                            className="md:hidden pointer-events-auto backdrop-blur-md rounded-[14px] p-2.5 bg-primary/80 text-white/80 hover:text-white transition cursor-pointer"
                            aria-label="Toggle menu"
                        >
                            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                        </button>

                        {/* Mobile drawer */}
                        {mobileOpen && (
                            <>
                                {/* Backdrop */}
                                <div
                                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 pointer-events-auto md:hidden"
                                    onClick={() => setMobileOpen(false)}
                                />
                                {/* Panel */}
                                <div className="fixed top-0 right-0 h-full w-72 bg-primary/95 backdrop-blur-xl border-l border-white/10 z-50 pointer-events-auto md:hidden animate-slide-in-right">
                                    <div className="flex items-center justify-between px-5 py-5 border-b border-white/10">
                                        <span className="text-white font-semibold font-satoshi">Menu</span>
                                        <button
                                            onClick={() => setMobileOpen(false)}
                                            className="text-white/60 hover:text-white transition cursor-pointer"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>
                                    </div>
                                    <div className="flex flex-col gap-1 p-4">
                                        {/* User info */}
                                        <div className="flex items-center gap-3 px-3 py-3 mb-2 bg-white/5 rounded-xl border border-white/10">
                                            <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-sm">
                                                {user?.name?.charAt(0)?.toUpperCase() || "?"}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-white text-sm font-medium truncate">{user?.name}</p>
                                                <p className="text-white/40 text-xs truncate">{user?.email}</p>
                                            </div>
                                        </div>

                                        <MobileLink to="/dashboard" label="Dashboard" icon={<LayoutDashboard className="w-4 h-4" />} active={isActive("/dashboard")} onClick={() => setMobileOpen(false)} />
                                        <MobileLink to="/profile" label="Profile" icon={<User className="w-4 h-4" />} active={isActive("/profile")} onClick={() => setMobileOpen(false)} />
                                        <MobileLink to="/scan-qr" label="Scan QR" icon={<span className="text-sm">📱</span>} active={isActive("/scan-qr")} onClick={() => setMobileOpen(false)} />
                                        <MobileLink to="/my-attendance" label="My Attendance" icon={<span className="text-sm">📋</span>} active={isActive("/my-attendance")} onClick={() => setMobileOpen(false)} />
                                        <MobileLink to="/organizations" label="Organizations" icon={<span className="text-sm">🏢</span>} active={isActive("/organizations")} onClick={() => setMobileOpen(false)} />

                                        {(user?.role === "admin" || user?.platformRole === "superAdmin" || user?.platformRole === "platform_owner") && (
                                            <>
                                                <div className="h-px bg-white/10 my-2" />
                                                <p className="text-white/30 text-xs uppercase tracking-wider px-3 mb-1">Administration</p>
                                                <MobileLink to="/admin/sessions" label="Manage Sessions" icon={<span className="text-sm">📋</span>} active={isActive("/admin/sessions")} onClick={() => setMobileOpen(false)} />
                                                <MobileLink to="/admin/session-history" label="Session History" icon={<span className="text-sm">📊</span>} active={isActive("/admin/session-history")} onClick={() => setMobileOpen(false)} />
                                                <MobileLink to="/admin/absences" label="Absences" icon={<span className="text-sm">🔍</span>} active={isActive("/admin/absences")} onClick={() => setMobileOpen(false)} />
                                                <MobileLink to="/admin/analytics" label="Analytics" icon={<span className="text-sm">📈</span>} active={isActive("/admin/analytics")} onClick={() => setMobileOpen(false)} />
                                            </>
                                        )}

                                        <div className="h-px bg-white/10 my-2" />
                                        <div className="px-2 mt-1">
                                            <OrgSwitcher />
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </>
                ) : (
                    <Link
                        to="/auth/login"
                        className="flex items-center gap-x-2 font-geist-mono tracking-wide
                     backdrop-blur-md rounded-[14px] px-4 py-2
                     bg-primary/80 text-accent hover:bg-primary
                     transition duration-200 text-base sm:text-xl font-medium cursor-pointer pointer-events-auto"
                    >
                        Login
                    </Link>
                )}
            </div>
        </nav>
    );
}

/* ─── Mobile Nav Link ─── */

function MobileLink({
    to,
    label,
    icon,
    active,
    onClick,
}: {
    to: string;
    label: string;
    icon: React.ReactNode;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <Link
            to={to}
            onClick={onClick}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer
        ${active
                    ? "bg-accent/15 text-accent border border-accent/20"
                    : "text-white/70 hover:bg-white/5 hover:text-white"
                }`}
        >
            {icon}
            {label}
        </Link>
    );
}
