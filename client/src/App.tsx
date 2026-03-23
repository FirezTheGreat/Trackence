import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Lenis from "lenis";

import MainLayout from "./layouts/MainLayout";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Signup from "./pages/SignUp";
import VerifyOTP from "./pages/VerifyOTP";
import InviteLanding from "./pages/InviteLanding";
import AdminDashboard from "./pages/AdminDashboard";
import AdminSessionManagement from "./pages/AdminSessionManagement";
import AbsenceReport from "./pages/AbsenceReport";
import QRScanner from "./pages/QRScanner";
import AuditLogs from "./pages/AuditLogs";
import SystemMonitoring from "./pages/SystemMonitoring";
import SessionHistory from "./pages/SessionHistory";
import QRFullscreen from "./pages/QRFullscreen";
import Organizations from "./pages/Organizations";
import CreateOrganization from "./pages/CreateOrganization";
import JoinOrganization from "./pages/JoinOrganization";
import { Analytics } from "./pages/Analytics";
import Profile from "./pages/Profile";
import MyAttendance from "./pages/MyAttendance";
import NotFound from "./pages/NotFound";
import ErrorFallback from "./pages/ErrorFallback";

import { useAuthStore } from "./stores/auth.store";
import ProtectedRoute from "./components/ProtectedRoute";
import { ErrorBoundary, ToastContainer } from "./components/ui";
import { GlobalModal } from "./components/ui/GlobalModal";

const ScrollToTop = () => {
    const { pathname } = useLocation();

    useEffect(() => {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }, [pathname]);

    return null;
};

const App = () => {
    const checkAuth = useAuthStore((state) => state.checkAuth);
    const loading = useAuthStore((state) => state.loading);

    useEffect(() => {
        const lenis = new Lenis({
            autoRaf: true,
            duration: 1.2,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t))
        });
        
        return () => {
            lenis.destroy();
        };
    }, []);

    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    if (loading) return null;

    return (
        <ErrorBoundary
            fallbackRender={({ error, retry }) => (
                <ErrorFallback
                    error={error || new Error("Unexpected application error")}
                    retry={retry}
                />
            )}
        >
            <BrowserRouter>
                <ScrollToTop />
                <ToastContainer />
                <Routes>
                    <Route path="/" element={<MainLayout />}>
                        <Route index element={<Home />} />
                        <Route path="auth/login" element={<Login />} />
                        <Route path="auth/signup" element={<Signup />} />
                        <Route path="auth/verify-otp" element={<VerifyOTP />} />
                        <Route path="invite/:token" element={<InviteLanding />} />

                        <Route
                            path="dashboard"
                            element={
                                <ProtectedRoute>
                                    <AdminDashboard />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="admin/analytics"
                            element={
                                <ProtectedRoute requireAdmin>
                                    <Analytics />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="admin/sessions"
                            element={
                                <ProtectedRoute requireAdmin>
                                    <AdminSessionManagement />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="admin/session-history"
                            element={
                                <ProtectedRoute requireAdmin>
                                    <SessionHistory />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="admin/absences"
                            element={
                                <ProtectedRoute requireAdmin>
                                    <AbsenceReport />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="admin/audit"
                            element={
                                <ProtectedRoute requireSuperAdmin>
                                    <AuditLogs />
                                </ProtectedRoute>
                            }
                        />

                        <Route
                            path="admin/system"
                            element={
                                <ProtectedRoute requireSuperAdmin>
                                    <SystemMonitoring />
                                </ProtectedRoute>
                            }
                        />

                        <Route path="organizations">
                            <Route index element={
                                <ProtectedRoute>
                                    <Organizations />
                                </ProtectedRoute>
                            } />
                            <Route path="create" element={
                                <ProtectedRoute>
                                    <CreateOrganization />
                                </ProtectedRoute>
                            } />
                            <Route path="join" element={
                                <ProtectedRoute>
                                    <JoinOrganization />
                                </ProtectedRoute>
                            } />
                        </Route>

                        <Route
                            path="scan-qr"
                            element={
                                <ProtectedRoute>
                                    <QRScanner />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="profile"
                            element={
                                <ProtectedRoute>
                                    <Profile />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="my-attendance"
                            element={
                                <ProtectedRoute>
                                    <MyAttendance />
                                </ProtectedRoute>
                            }
                        />

                        <Route path="*" element={<NotFound />} />
                    </Route>

                    <Route
                        path="/sessions/scan/:sessionId"
                        element={
                            <ProtectedRoute requireAdmin>
                                <QRFullscreen />
                            </ProtectedRoute>
                        }
                    />
                </Routes>
                <GlobalModal />
            </BrowserRouter>
        </ErrorBoundary>
    );
};

export default App;
