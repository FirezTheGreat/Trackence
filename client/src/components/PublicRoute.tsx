import { Navigate } from "react-router-dom";
import { useAuthStore } from "../stores/auth.store";

interface Props {
    children: React.ReactNode;
}

const PublicRoute = ({ children }: Props) => {
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

    if (isAuthenticated) {
        return <Navigate to="/dashboard" replace />;
    }

    return <>{children}</>;
};

export default PublicRoute;
