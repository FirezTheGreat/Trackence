import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Lenis from "lenis";

import MainLayout from "./layouts/MainLayout";
import ErrorFallback from "./pages/ErrorFallback";

import { useAuthStore } from "./stores/auth.store";
import ProtectedRoute from "./components/ProtectedRoute";
import PublicRoute from "./components/PublicRoute";
import { ErrorBoundary, ToastContainer } from "./components/ui";
import { GlobalModal } from "./components/ui/GlobalModal";

const Home = lazy(() => import("./pages/Home"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/SignUp"));
const VerifyOTP = lazy(() => import("./pages/VerifyOTP"));
const InviteLanding = lazy(() => import("./pages/InviteLanding"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminSessionManagement = lazy(() => import("./pages/AdminSessionManagement"));
const AbsenceReport = lazy(() => import("./pages/AbsenceReport"));
const QRScanner = lazy(() => import("./pages/QRScanner"));
const AuditLogs = lazy(() => import("./pages/AuditLogs"));
const SystemMonitoring = lazy(() => import("./pages/SystemMonitoring"));
const SessionHistory = lazy(() => import("./pages/SessionHistory"));
const QRFullscreen = lazy(() => import("./pages/QRFullscreen"));
const Organizations = lazy(() => import("./pages/Organizations"));
const CreateOrganization = lazy(() => import("./pages/CreateOrganization"));
const JoinOrganization = lazy(() => import("./pages/JoinOrganization"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Profile = lazy(() => import("./pages/Profile"));
const MyAttendance = lazy(() => import("./pages/MyAttendance"));
const NotFound = lazy(() => import("./pages/NotFound"));

const ScrollToTop = () => {
    const { pathname } = useLocation();

    useEffect(() => {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }, [pathname]);

    return null;
};

const RouteLoadingFallback = () => (
    <div className="min-h-[40vh] flex items-center justify-center">
        <div className="w-9 h-9 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
);

const SmoothScrollManager = () => {
    const { pathname } = useLocation();

    useEffect(() => {
        const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const isAuthSurface = pathname.startsWith("/auth/") || pathname.startsWith("/invite/");
        const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;

        if (prefersReducedMotion || isAuthSurface || isTouchDevice) {
            return;
        }

        const lenis = new Lenis({
            autoRaf: true,
            duration: 1,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        });

        return () => {
            lenis.destroy();
        };
    }, [pathname]);

    return null;
};

const App = () => {
    const checkAuth = useAuthStore((state) => state.checkAuth);

    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    useEffect(() => {
        const ua = navigator.userAgent || "";
        const isIOS = /iP(hone|ad|od)/i.test(ua);
        const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
        const isSmallViewport = window.matchMedia("(max-width: 900px)").matches;
        const enablePerfMode = isIOS && (isCoarsePointer || isSmallViewport);

        document.documentElement.classList.toggle("perf-mobile", enablePerfMode);

        return () => {
            document.documentElement.classList.remove("perf-mobile");
        };
    }, []);

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
                <SmoothScrollManager />
                <ScrollToTop />
                <ToastContainer />
                <Suspense fallback={<RouteLoadingFallback />}>
                    <Routes>
                        <Route path="/" element={<MainLayout />}>
                            <Route index element={<Home />} />
                            <Route
                                path="auth/login"
                                element={
                                    <PublicRoute>
                                        <Login />
                                    </PublicRoute>
                                }
                            />
                            <Route
                                path="auth/signup"
                                element={
                                    <PublicRoute>
                                        <Signup />
                                    </PublicRoute>
                                }
                            />
                            <Route
                                path="auth/verify-otp"
                                element={
                                    <PublicRoute>
                                        <VerifyOTP />
                                    </PublicRoute>
                                }
                            />
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
                </Suspense>
                <GlobalModal />
            </BrowserRouter>
        </ErrorBoundary>
    );
};

export default App;
