import { Navigate } from "react-router-dom";
import { useAuthStore } from "../stores/auth.store";

interface Props {
    children: React.ReactNode;
}

const PublicRoute = ({ children }: Props) => {
    const loading = useAuthStore((state) => state.loading);
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const user = useAuthStore((state) => state.user);

    if (loading) {
        return null;
    }

    if (isAuthenticated && user) {
        return <Navigate to="/dashboard" replace />;
    }

    return <>{children}</>;
};

export default PublicRoute;
