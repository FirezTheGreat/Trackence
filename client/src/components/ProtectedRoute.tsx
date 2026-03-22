import { Navigate } from "react-router-dom";
import { useAuthStore } from "../stores/auth.store";

interface Props {
    children: React.ReactNode;
    requireAdmin?: boolean;
    requireSuperAdmin?: boolean;
}

const ProtectedRoute = ({
    children,
    requireAdmin = false,
    requireSuperAdmin = false,
}: Props) => {
    const { isAuthenticated, user, loading } = useAuthStore();

    // Wait until checkAuth finishes
    if (loading) return null;

    if (!isAuthenticated) {
        return <Navigate to="/auth/login" replace />;
    }

    const role = user?.role;
    const hasPlatformSecurityAccess =
        user?.platformRole === "superAdmin" || user?.platformRole === "platform_owner";

    const renderForbidden = (message: string) => (
        <div className="min-h-[calc(100vh-6rem)] flex items-center justify-center px-6">
            <div className="text-center max-w-lg backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl px-8 py-8 shadow-lg shadow-black/10">
                <h2 className="text-2xl font-bold text-white mb-2">403 Forbidden</h2>
                <p className="text-white/60 text-sm mb-6">{message}</p>
                <button
                    onClick={() => window.history.back()}
                    className="inline-flex items-center justify-center px-6 py-3 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl transition-all duration-200 cursor-pointer text-sm"
                >
                    Go Back
                </button>
            </div>
        </div>
    );

    // SuperAdmin routes
    if (requireSuperAdmin && !hasPlatformSecurityAccess) {
        return renderForbidden("Platform owner access is required for this page.");
    }

    // Admin routes
    if (requireAdmin && role !== "admin" && user?.platformRole !== "superAdmin") {
        return renderForbidden("Admin access is required for this page.");
    }

    return <>{children}</>;
};

export default ProtectedRoute;
