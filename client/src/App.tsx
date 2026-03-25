import { Suspense, lazy, useEffect, useRef, type ComponentType } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Lenis from "lenis";

import MainLayout from "./layouts/MainLayout";
import ErrorFallback from "./pages/ErrorFallback";

import { useAuthStore } from "./stores/auth.store";
import ProtectedRoute from "./components/ProtectedRoute";
import PublicRoute from "./components/PublicRoute";
import { ErrorBoundary, ToastContainer } from "./components/ui";
import { GlobalModal } from "./components/ui/GlobalModal";
import { shouldEnableIOSPerfMode } from "./utils/device";

const CHUNK_RELOAD_GUARD_KEY = "trackence:chunk-reload-once";

const forceChunkRecoveryReload = () => {
    try {
        sessionStorage.removeItem(CHUNK_RELOAD_GUARD_KEY);
    } catch {
        // Ignore session storage errors.
    }

    const url = new URL(window.location.href);
    url.searchParams.set("__chunkRetry", Date.now().toString());
    window.location.replace(url.toString());
};

const isDynamicImportChunkError = (error: unknown): boolean => {
    const message = error instanceof Error ? error.message : String(error || "");
    return /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(message);
};

const lazyWithChunkRecovery = <T extends ComponentType<any>>(
    importer: () => Promise<{ default: T }>
) =>
    lazy(async () => {
        try {
            const module = await importer();
            try {
                sessionStorage.removeItem(CHUNK_RELOAD_GUARD_KEY);
            } catch {
                // Ignore session storage errors.
            }
            return module;
        } catch (error) {
            if (isDynamicImportChunkError(error)) {
                const alreadyReloaded = (() => {
                    try {
                        return sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) === "1";
                    } catch {
                        return false;
                    }
                })();

                if (!alreadyReloaded) {
                    try {
                        sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, "1");
                    } catch {
                        // Ignore session storage errors.
                    }
                    forceChunkRecoveryReload();
                    return new Promise<never>(() => {
                        // Keep suspense pending while the page reloads.
                    });
                }
            }

            throw error;
        }
    });

const Home = lazyWithChunkRecovery(() => import("./pages/Home"));
const Login = lazyWithChunkRecovery(() => import("./pages/Login"));
const Signup = lazyWithChunkRecovery(() => import("./pages/SignUp"));
const VerifyOTP = lazyWithChunkRecovery(() => import("./pages/VerifyOTP"));
const InviteLanding = lazyWithChunkRecovery(() => import("./pages/InviteLanding"));
const AdminDashboard = lazyWithChunkRecovery(() => import("./pages/AdminDashboard"));
const AdminSessionManagement = lazyWithChunkRecovery(() => import("./pages/AdminSessionManagement"));
const AbsenceReport = lazyWithChunkRecovery(() => import("./pages/AbsenceReport"));
const QRScanner = lazyWithChunkRecovery(() => import("./pages/QRScanner"));
const AuditLogs = lazyWithChunkRecovery(() => import("./pages/AuditLogs"));
const SystemMonitoring = lazyWithChunkRecovery(() => import("./pages/SystemMonitoring"));
const SessionHistory = lazyWithChunkRecovery(() => import("./pages/SessionHistory"));
const QRFullscreen = lazyWithChunkRecovery(() => import("./pages/QRFullscreen"));
const Organizations = lazyWithChunkRecovery(() => import("./pages/Organizations"));
const CreateOrganization = lazyWithChunkRecovery(() => import("./pages/CreateOrganization"));
const JoinOrganization = lazyWithChunkRecovery(() => import("./pages/JoinOrganization"));
const Analytics = lazyWithChunkRecovery(() => import("./pages/Analytics"));
const Profile = lazyWithChunkRecovery(() => import("./pages/Profile"));
const MyAttendance = lazyWithChunkRecovery(() => import("./pages/MyAttendance"));
const NotFound = lazyWithChunkRecovery(() => import("./pages/NotFound"));

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

const ScrollStateManager = () => {
    const { pathname } = useLocation();

    useEffect(() => {
        if (pathname !== "/") {
            document.documentElement.classList.remove("is-scrolling");
            return;
        }

        let scrollTimer: number | undefined;

        const handleScroll = () => {
            document.documentElement.classList.add("is-scrolling");

            if (scrollTimer !== undefined) {
                window.clearTimeout(scrollTimer);
            }

            scrollTimer = window.setTimeout(() => {
                document.documentElement.classList.remove("is-scrolling");
            }, 150);
        };

        window.addEventListener("scroll", handleScroll, { passive: true });

        return () => {
            window.removeEventListener("scroll", handleScroll);
            if (scrollTimer !== undefined) {
                window.clearTimeout(scrollTimer);
            }
            document.documentElement.classList.remove("is-scrolling");
        };
    }, [pathname]);

    return null;
};

const SmoothScrollManager = () => {
    const { pathname } = useLocation();
    const lenisRef = useRef<Lenis | null>(null);
    const rafIdRef = useRef<number | null>(null);

    const stopRafLoop = () => {
        if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
        }
    };

    const startRafLoop = () => {
        if (!lenisRef.current || rafIdRef.current !== null) {
            return;
        }

        const tick = (time: number) => {
            lenisRef.current?.raf(time);
            rafIdRef.current = requestAnimationFrame(tick);
        };

        rafIdRef.current = requestAnimationFrame(tick);
    };

    useEffect(() => {
        const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const isIOSPerfMode = shouldEnableIOSPerfMode();

        if (prefersReducedMotion || isIOSPerfMode) {
            return;
        }

        if (!lenisRef.current) {
            lenisRef.current = new Lenis({
                autoRaf: false,
                duration: 0.9,
                easing: (t) => 1 - Math.pow(1 - t, 3),
                wheelMultiplier: 1,
                touchMultiplier: 1,
            });
        }

        return () => {
            stopRafLoop();
            lenisRef.current?.destroy();
            lenisRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!lenisRef.current) {
            return;
        }

        const isHomeSurface = pathname === "/";

        if (!isHomeSurface) {
            lenisRef.current.stop();
            stopRafLoop();
            return;
        }

        lenisRef.current.start();
        startRafLoop();
    }, [pathname]);

    return null;
};

const App = () => {
    const checkAuth = useAuthStore((state) => state.checkAuth);

    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    useEffect(() => {
        const enablePerfMode = shouldEnableIOSPerfMode();

        document.documentElement.classList.toggle("ios-perf-mode", enablePerfMode);

        return () => {
            document.documentElement.classList.remove("ios-perf-mode");
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
                <ScrollStateManager />
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
                                    <ProtectedRoute requirePlatformOwner>
                                        <AuditLogs />
                                    </ProtectedRoute>
                                }
                            />

                            <Route
                                path="admin/system"
                                element={
                                    <ProtectedRoute requirePlatformOwner>
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
