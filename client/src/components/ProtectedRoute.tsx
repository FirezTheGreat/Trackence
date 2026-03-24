import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { authAPI } from "../services/auth.service";
import { useAuthStore } from "../stores/auth.store";

interface Props {
    children: React.ReactNode;
    requireAdmin?: boolean;
    requirePlatformOwner?: boolean;
}

const ProtectedRoute = ({
    children,
    requireAdmin = false,
    requirePlatformOwner = false,
}: Props) => {
    const { isAuthenticated, user, loading, setUser } = useAuthStore();
    const [isRevalidating, setIsRevalidating] = useState(false);
    const [hasRevalidatedAccess, setHasRevalidatedAccess] = useState(false);

    const role = user?.role;
    const normalizedPlatformRole = String(user?.platformRole || "").trim().toLowerCase();
    const hasPlatformOwnerAccess =
        normalizedPlatformRole === "platform_owner" ||
        normalizedPlatformRole === "platform owner";

    const accessDenied = useMemo(() => {
        if (requirePlatformOwner && !hasPlatformOwnerAccess) return true;
        if (requireAdmin && role !== "admin" && !hasPlatformOwnerAccess) return true;
        return false;
    }, [hasPlatformOwnerAccess, requireAdmin, requirePlatformOwner, role]);

    useEffect(() => {
        let alive = true;

        const refreshUserForAccess = async () => {
            if (loading || !isAuthenticated || !accessDenied || hasRevalidatedAccess) return;

            setIsRevalidating(true);
            try {
                const me = await authAPI.getMe();
                if (alive) {
                    setUser(me);
                }
            } catch {
                // Keep existing auth state; route checks below will handle fallback.
            } finally {
                if (alive) {
                    setHasRevalidatedAccess(true);
                    setIsRevalidating(false);
                }
            }
        };

        refreshUserForAccess();

        return () => {
            alive = false;
        };
    }, [accessDenied, hasRevalidatedAccess, isAuthenticated, loading, setUser]);

    // Wait until auth bootstrap finishes
    if (loading) return null;

    if (!isAuthenticated) {
        return <Navigate to="/auth/login" replace />;
    }

    if (isRevalidating) return null;

    const renderForbidden = (message: string) => (
        <div className="min-h-[calc(100vh-6rem)] flex items-center justify-center px-6">
            <div className="text-center max-w-lg backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl px-8 py-8 shadow-lg shadow-black/10">
                <h2 className="text-2xl font-bold text-white mb-2">403 Forbidden</h2>
                <p className="text-white/60 text-sm mb-6">{message}</p>
                <button
                    onClick={() => window.location.assign("/dashboard")}
                    className="inline-flex items-center justify-center px-6 py-3 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl transition-all duration-200 cursor-pointer text-sm"
                >
                    Go to Dashboard
                </button>
            </div>
        </div>
    );

    if (requirePlatformOwner && !hasPlatformOwnerAccess) {
        return renderForbidden("Platform owner access is required for this page.");
    }

    // Admin routes
    if (requireAdmin && role !== "admin" && !hasPlatformOwnerAccess) {
        return renderForbidden("Admin access is required for this page.");
    }

    return <>{children}</>;
};

export default ProtectedRoute;
