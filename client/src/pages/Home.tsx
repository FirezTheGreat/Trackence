import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "../stores/auth.store";
import { APP_NAME } from "../config/app";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import {
    Activity,
    ArrowRight,
    BarChart3,
    BookOpen,
    CalendarCheck,
    CheckCircle2,
    ChevronDown,
    Clock3,
    FileSearch,
    LineChart,
    PlayCircle,
    QrCode,
    ScanLine,
    ShieldCheck,
    Sparkles,
    Timer,
    Users,
    XCircle,
} from "lucide-react";
import Footer from "../components/Footer";
import useAppSeo from "../hooks/useAppSeo";
import { isAndroidDevice, isCoarsePointerDevice, isIOSDevice, shouldEnableIOSPerfMode } from "../utils/device";

const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.12, delayChildren: 0.08 },
    },
};

const itemVariants: Variants = {
    hidden: { opacity: 0, y: 26 },
    visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100, damping: 18 } },
};

const heroHighlights = [
    {
        icon: <Timer className="w-4 h-4" />,
        title: "Faster attendance",
    },
    {
        icon: <ShieldCheck className="w-4 h-4" />,
        title: "Anti-proxy flow",
    },
    {
        icon: <LineChart className="w-4 h-4" />,
        title: "Live dashboards",
    },
    {
        icon: <Sparkles className="w-4 h-4" />,
        title: "Free to use",
    },
];

const problemCards = [
    {
        icon: <Clock3 className="w-6 h-6 text-red-300" />,
        title: "Time-consuming roll calls",
        description: "Manual attendance consumes valuable class or session time every day.",
    },
    {
        icon: <Users className="w-6 h-6 text-red-300" />,
        title: "Proxy attendance",
        description: "Buddy marking and backfilling make records unreliable.",
    },
    {
        icon: <FileSearch className="w-6 h-6 text-red-300" />,
        title: "Poor reporting",
        description: "No instant visibility into absentees or trends.",
    },
    {
        icon: <BookOpen className="w-6 h-6 text-red-300" />,
        title: "Paper-based records",
        description: "Registers are hard to audit, store, and share quickly.",
    },
];

const solutionCards = [
    {
        icon: <QrCode className="w-6 h-6 text-emerald-300" />,
        title: "QR attendance",
        description: "Attendees check in within seconds using rotating QR tokens.",
    },
    {
        icon: <ShieldCheck className="w-6 h-6 text-emerald-300" />,
        title: "Anti-proxy validation",
        description: "Secure verification logic reduces fake attendance attempts.",
    },
    {
        icon: <BarChart3 className="w-6 h-6 text-emerald-300" />,
        title: "Instant logs",
        description: "Attendance events are captured and visible in real time.",
    },
    {
        icon: <LineChart className="w-6 h-6 text-emerald-300" />,
        title: "Real-time analytics",
        description: "Track session performance and absentee trends live.",
    },
];

const walkthroughSteps = [
    {
        icon: <CalendarCheck className="w-6 h-6" />,
        title: "Create Session",
        description: "Create a class, batch, meeting, or event session in seconds.",
    },
    {
        icon: <QrCode className="w-6 h-6" />,
        title: "Generate QR",
        description: "A secure rotating QR appears instantly for active attendees.",
    },
    {
        icon: <ScanLine className="w-6 h-6" />,
        title: "Attendees Scan",
        description: "People scan and mark attendance from their own devices.",
    },
    {
        icon: <LineChart className="w-6 h-6" />,
        title: "Live Dashboard Updates",
        description: "Admins and organizers monitor check-ins and absentees live.",
    },
];

const seoUseCases = [
    {
        title: "Attendance Management Software India",
        description:
            "Trackence is built for institutions and organizations in India that need reliable, real-time attendance operations.",
    },
    {
        title: "QR Attendance System",
        description:
            "Use rotating QR attendance to speed up check-ins and reduce proxy attempts in high-volume sessions.",
    },
    {
        title: "College Attendance Software",
        description:
            "Manage attendance across classes and departments with live visibility and exports.",
    },
    {
        title: "Coaching Attendance System",
        description:
            "Track attendance for multiple batches and schedules with quick setup and instant logs.",
    },
];

const recentCheckins = [
    { name: "A. Sharma", at: "09:42 AM", status: "Checked In" },
    { name: "R. Khan", at: "09:43 AM", status: "Checked In" },
    { name: "P. Nair", at: "09:44 AM", status: "Checked In" },
];

const Home = () => {
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const shouldReduceMotion = useReducedMotion();
    const disableDecorativeMotion = shouldReduceMotion || shouldEnableIOSPerfMode();
    const [isNonLaptopDevice, setIsNonLaptopDevice] = useState(false);
    const [hasScrolled, setHasScrolled] = useState(false);

    useEffect(() => {
        setIsNonLaptopDevice(isCoarsePointerDevice() || isIOSDevice() || isAndroidDevice());
    }, []);

    useEffect(() => {
        const onScroll = () => {
            const nextHasScrolled = window.scrollY > 24;
            setHasScrolled((prev) => (prev === nextHasScrolled ? prev : nextHasScrolled));
        };

        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });

        return () => {
            window.removeEventListener("scroll", onScroll);
        };
    }, []);

    const siteUrl = (import.meta.env.VITE_SITE_URL || "https://trackence.app").replace(/\/$/, "");
    useAppSeo({
        title: `${APP_NAME} | QR Attendance Management Platform`,
        description:
            "Trackence is a free-to-use QR attendance management platform for institutions, communities, and organizations. Prevent proxy attendance and monitor live dashboards.",
        path: "/",
        image: "/og-image.png",
        structuredData: [
            {
                "@context": "https://schema.org",
                "@type": "WebSite",
                name: APP_NAME,
                url: siteUrl,
                potentialAction: {
                    "@type": "SearchAction",
                    target: `${siteUrl}/?q={search_term_string}`,
                    "query-input": "required name=search_term_string",
                },
            },
            {
                "@context": "https://schema.org",
                "@type": "Organization",
                name: APP_NAME,
                url: siteUrl,
                logo: `${siteUrl}/logo.png`,
            },
            {
                "@context": "https://schema.org",
                "@type": "SoftwareApplication",
                name: APP_NAME,
                applicationCategory: "BusinessApplication",
                operatingSystem: "Web",
            },
        ],
    });

    return (
        <>
            <div className="ambient-bg absolute top-0 left-0 w-full h-[120vh] pointer-events-none -z-10 overflow-hidden">
                <div className="home-ambient-gradient absolute inset-0 opacity-90" />
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdib3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djI2aDJWMzRoMjZ2LTJoLTI2VjJoLTJ2MjZIMnYyaDM0eiIvPjwvZz48L2c+PC9zdmc+')] opacity-35" />
            </div>

            <div className="flex flex-col items-center justify-center w-full overflow-x-hidden text-center pb-24 px-3 sm:px-5 md:px-6">
                <motion.section
                    variants={containerVariants}
                    initial={disableDecorativeMotion ? undefined : "hidden"}
                    animate={disableDecorativeMotion ? undefined : "visible"}
                    className="perf-section min-h-[85dvh] py-6 max-w-7xl w-full grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] gap-8 xl:gap-12 items-center relative z-10 text-left"
                    id="hero"
                >
                    <div className="home-hero-core-glow home-decor-motion absolute inset-[-20%] pointer-events-none -z-10" />

                    <div>
                        <motion.div variants={itemVariants} className="fake-glass inline-block mb-6 px-4 py-2 rounded-full shadow-[0_0_15px_rgba(255,255,255,0.05)]">
                            <span className="text-white/80 font-inter text-xs sm:text-sm font-medium tracking-wide flex items-center gap-3">
                                <span className="relative flex h-2.5 w-2.5">
                                    <span className={`${disableDecorativeMotion ? "" : "home-signal-pulse"} absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75`}></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,1)]"></span>
                                </span>
                                Built for institutions, coaching centers, communities, and teams
                            </span>
                        </motion.div>

                        <motion.h1
                            variants={itemVariants}
                            className="text-4xl sm:text-5xl md:text-6xl lg:text-6xl xl:text-7xl font-bold text-white font-satoshi tracking-tight leading-tight mb-6 text-center lg:text-left"
                        >
                            QR-Based Attendance Management
                            <span className="text-transparent bg-clip-text bg-linear-to-r from-orange-400 via-[#ff6b2b] to-[#a33c16] drop-shadow-[0_0_20px_rgba(173,67,26,0.3)] block mt-2">
                                made simple and instant
                            </span>
                        </motion.h1>

                        <motion.p
                            variants={itemVariants}
                            className="text-white/65 max-w-2xl text-base sm:text-lg md:text-xl font-inter leading-relaxed mb-8 text-center lg:text-left"
                        >
                            Mark attendance in seconds, reduce proxy entries, and monitor live dashboards for every session.
                            Trackence is currently free to use in early access.
                        </motion.p>

                        <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                            {heroHighlights.map((highlight) => (
                                <div key={highlight.title} className="fake-glass rounded-xl px-3 py-2 text-white/85 text-xs sm:text-sm font-inter flex items-center gap-2 justify-center lg:justify-start">
                                    <span className="text-accent">{highlight.icon}</span>
                                    {highlight.title}
                                </div>
                            ))}
                        </motion.div>

                        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4 z-20 relative">
                            {isAuthenticated ? (
                                <Link
                                    to="/dashboard"
                                    className="inline-flex items-center justify-center gap-2 rounded-2xl px-7 py-3.5 bg-white text-black hover:bg-gray-100 font-semibold text-base transition-all duration-300"
                                >
                                    Open Dashboard
                                    <ArrowRight className="w-4.5 h-4.5" />
                                </Link>
                            ) : (
                                <Link
                                    to="/auth/signup"
                                    className="inline-flex items-center justify-center gap-2 rounded-2xl px-7 py-3.5 bg-white text-black hover:bg-gray-100 font-outfit font-medium text-lg transition-all duration-300"
                                >
                                    Get Started Free
                                    <ArrowRight className="w-4.5 h-4.5" />
                                </Link>
                            )}
                        </motion.div>

                        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-3 mt-4">
                            <a
                                href="https://www.youtube.com/@trackenceapp"
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center justify-center sm:justify-start gap-2 text-white/75 hover:text-white transition-colors text-sm font-inter"
                            >
                                <PlayCircle className="w-4 h-4" />
                                Watch Demo
                            </a>
                        </motion.div>
                    </div>

                    <motion.div variants={itemVariants} className="relative w-full lg:max-w-140 lg:ml-auto" id="dashboard-preview">
                        <div className="relative overflow-hidden bg-secondary/60 border border-white/15 rounded-3xl p-6 sm:p-7 shadow-2xl">

                            <div className="flex items-center justify-between mb-5">
                                <p className="text-white font-satoshi text-lg">Live Attendance Dashboard Preview</p>
                                <span className="text-xs font-inter text-emerald-300 bg-emerald-400/10 border border-emerald-400/30 rounded-full px-2.5 py-1">
                                    Session Active
                                </span>
                            </div>

                            {!disableDecorativeMotion && (
                                <div className="mb-4 flex flex-wrap items-center gap-2">
                                    <motion.div
                                        initial={{ opacity: 0, y: 10, scale: 0.96 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        transition={{ type: "spring", stiffness: 220, damping: 22, delay: 0.25 }}
                                        className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-inter text-emerald-200"
                                    >
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        Live sync active
                                    </motion.div>
                                    <motion.div
                                        initial={{ opacity: 0, y: 10, scale: 0.96 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        transition={{ type: "spring", stiffness: 220, damping: 22, delay: 0.4 }}
                                        className="inline-flex items-center gap-2 rounded-xl border border-orange-300/30 bg-orange-500/10 px-3 py-1.5 text-xs font-inter text-orange-100"
                                    >
                                        <QrCode className="w-3.5 h-3.5" />
                                        QR refreshed 15s ago
                                    </motion.div>
                                </div>
                            )}

                            <div className="grid grid-cols-3 gap-3 mb-4">
                                <div className="bg-black/25 border border-white/10 rounded-2xl p-3">
                                    <p className="text-white/50 text-xs">Present</p>
                                    <p className="text-white text-2xl font-satoshi mt-1">87</p>
                                </div>
                                <div className="bg-black/25 border border-white/10 rounded-2xl p-3">
                                    <p className="text-white/50 text-xs">Absent</p>
                                    <p className="text-white text-2xl font-satoshi mt-1">13</p>
                                </div>
                                <div className="bg-black/25 border border-white/10 rounded-2xl p-3">
                                    <p className="text-white/50 text-xs">Total</p>
                                    <p className="text-white text-2xl font-satoshi mt-1">100</p>
                                </div>
                            </div>

                            <div className="bg-black/25 border border-white/10 rounded-2xl p-4 mb-3">
                                <p className="text-white/55 text-xs mb-2">Attendance Distribution</p>
                                <div className="space-y-2">
                                    <div className="text-[11px] text-white/60">Present 87%</div>
                                    <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                                        <div className="h-full w-[87%] bg-emerald-400/80" />
                                    </div>
                                    <div className="text-[11px] text-white/60">Absent 13%</div>
                                    <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                                        <div className="h-full w-[13%] bg-red-400/75" />
                                    </div>
                                </div>
                            </div>

                            <div className="bg-black/25 border border-white/10 rounded-2xl p-4 mb-3">
                                <p className="text-white/55 text-xs mb-2">Recent Check-ins</p>
                                <div className="space-y-2.5">
                                    {recentCheckins.map((entry) => (
                                        <div key={`${entry.name}-${entry.at}`} className="flex items-center justify-between text-sm">
                                            <span className="text-white/85">{entry.name}</span>
                                            <span className="text-white/55">{entry.at}</span>
                                            <span className="text-xs text-emerald-300">{entry.status}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </motion.section>

                <section className="max-w-6xl w-full mt-2 mb-16 relative z-10">
                    <div className="fake-glass rounded-2xl p-4 md:p-5 border border-white/15 flex flex-col md:flex-row gap-3 md:gap-5 items-center justify-between">
                        <p className="text-white/80 font-inter text-sm md:text-base text-center md:text-left">
                            Free-to-use early access. Built in India, designed for modern attendance operations.
                        </p>
                        {!isAuthenticated && (
                            <Link
                                to="/auth/signup"
                                className="px-5 py-2.5 rounded-xl bg-accent text-white font-inter text-sm font-semibold hover:bg-accent/85 transition-colors"
                            >
                                Create Free Account
                            </Link>
                        )}
                    </div>
                </section>

                {!disableDecorativeMotion && !hasScrolled && (
                    <motion.div className={`home-decor-motion fixed bottom-6 left-1/2 -translate-x-1/2 flex-col items-center gap-1 text-white/30 animate-bounce pointer-events-none z-50 ${isNonLaptopDevice ? "flex" : "hidden md:flex"}`}>
                        <ChevronDown className="w-6 h-6 opacity-70" />
                    </motion.div>
                )}

                <motion.section
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={disableDecorativeMotion ? { duration: 0 } : { duration: 0.7 }}
                    className="perf-section max-w-6xl w-full mt-8 relative z-10"
                    id="problem-solution"
                >
                    <div className="mb-12 text-center">
                        <h2 className="text-3xl md:text-4xl font-bold text-white font-satoshi mb-4">Manual Attendance vs Trackence</h2>
                        <p className="text-white/60 font-inter max-w-3xl mx-auto">See what changes when you replace registers and roll calls with a QR-based attendance workflow.</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-red-500/5 border border-red-300/20 rounded-3xl p-6 text-left">
                            <h3 className="text-xl font-satoshi text-white mb-5 inline-flex items-center gap-2">
                                <XCircle className="w-5 h-5 text-red-300" />
                                Manual Attendance Problems
                            </h3>
                            <div className="space-y-4">
                                {problemCards.map((card) => (
                                    <div key={card.title} className="bg-black/25 border border-white/8 rounded-2xl p-4">
                                        <div className="inline-flex items-center gap-2 text-white mb-1.5 font-medium">
                                            {card.icon}
                                            <span>{card.title}</span>
                                        </div>
                                        <p className="text-white/60 text-sm">{card.description}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-emerald-500/5 border border-emerald-300/25 rounded-3xl p-6 text-left">
                            <h3 className="text-xl font-satoshi text-white mb-5 inline-flex items-center gap-2">
                                <CheckCircle2 className="w-5 h-5 text-emerald-300" />
                                Trackence Solution
                            </h3>
                            <div className="space-y-4">
                                {solutionCards.map((card) => (
                                    <div key={card.title} className="bg-black/25 border border-white/8 rounded-2xl p-4">
                                        <div className="inline-flex items-center gap-2 text-white mb-1.5 font-medium">
                                            {card.icon}
                                            <span>{card.title}</span>
                                        </div>
                                        <p className="text-white/60 text-sm">{card.description}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </motion.section>

                <motion.section
                    initial={{ opacity: 0, scale: 0.95 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={disableDecorativeMotion ? { duration: 0 } : { duration: 0.7 }}
                    className="perf-section max-w-6xl w-full mt-24 relative z-10 mb-20"
                    id="how-it-works"
                >
                    <div className="bg-black/30 border border-white/10 rounded-3xl p-10 md:p-16 w-full shadow-2xl relative overflow-hidden group">
                        <div className="home-steps-glow-a home-decor-motion absolute -top-28 -right-28 w-80 h-80 pointer-events-none transition-opacity duration-500 group-hover:opacity-100 opacity-70" />
                        <div className="home-steps-glow-b home-decor-motion absolute -bottom-28 -left-28 w-80 h-80 pointer-events-none transition-opacity duration-500 group-hover:opacity-100 opacity-50" />

                        <h2 className="text-3xl font-bold text-white font-satoshi mb-4 text-center">How Trackence Works</h2>
                        <p className="text-white/60 text-center mb-12 max-w-3xl mx-auto">Set up a session, let attendees scan, and monitor everything instantly from one dashboard.</p>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 relative">
                            {walkthroughSteps.map((step, idx) => (
                                <div key={step.title} className="flex flex-col items-start relative z-10 text-left bg-secondary/40 border border-white/10 rounded-2xl p-5">
                                    <div className="w-12 h-12 rounded-xl bg-black/25 border border-white/15 flex items-center justify-center text-white mb-4">
                                        {step.icon}
                                    </div>
                                    <p className="text-xs font-inter text-accent/90 mb-2 tracking-wide">Step {idx + 1}</p>
                                    <h4 className="text-lg font-semibold text-white font-satoshi mb-2">{step.title}</h4>
                                    <p className="text-sm text-white/60 font-inter">{step.description}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.section>

                <motion.section
                    initial={{ opacity: 0, y: 35 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={disableDecorativeMotion ? { duration: 0 } : { duration: 0.6 }}
                    className="perf-section max-w-6xl w-full mt-2 relative z-10"
                    id="live-visuals"
                >
                    <div className="text-center mb-8">
                        <h2 className="text-3xl md:text-4xl font-satoshi text-white mb-3">Understand Your Attendance at a Glance</h2>
                        <p className="text-white/60 max-w-3xl mx-auto">These visual panels show what teams monitor every day without opening spreadsheets or paper registers.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
                        <div className="bg-secondary/55 border border-white/10 rounded-2xl p-5">
                            <p className="text-white font-satoshi mb-3 inline-flex items-center gap-2"><LineChart className="w-4 h-4 text-accent" /> Session Trend</p>
                            <div className="h-28 flex items-end gap-2">
                                {[35, 48, 42, 60, 70, 64, 78].map((height, idx) => (
                                    <div key={idx} className="flex-1 rounded-t-sm bg-linear-to-t from-orange-500/80 to-orange-300/60" style={{ height: `${height}%` }} />
                                ))}
                            </div>
                            <p className="text-white/55 text-xs mt-3">Quickly spot whether attendance is improving or dropping session by session.</p>
                        </div>

                        <div className="bg-secondary/55 border border-white/10 rounded-2xl p-5">
                            <p className="text-white font-satoshi mb-3 inline-flex items-center gap-2"><BarChart3 className="w-4 h-4 text-accent" /> Group Snapshot</p>
                            <div className="space-y-3">
                                <div>
                                    <div className="flex justify-between text-xs text-white/60 mb-1"><span>Group A</span><span>86%</span></div>
                                    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden"><div className="h-full w-[86%] bg-emerald-400/80" /></div>
                                </div>
                                <div>
                                    <div className="flex justify-between text-xs text-white/60 mb-1"><span>Group B</span><span>74%</span></div>
                                    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden"><div className="h-full w-[74%] bg-orange-400/80" /></div>
                                </div>
                                <div>
                                    <div className="flex justify-between text-xs text-white/60 mb-1"><span>Group C</span><span>68%</span></div>
                                    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden"><div className="h-full w-[68%] bg-red-400/70" /></div>
                                </div>
                            </div>
                            <p className="text-white/55 text-xs mt-3">Identify which groups need attention before attendance drops further.</p>
                        </div>

                        <div className="bg-secondary/55 border border-white/10 rounded-2xl p-5">
                            <p className="text-white font-satoshi mb-3 inline-flex items-center gap-2"><Activity className="w-4 h-4 text-accent" /> Live Alerts</p>
                            <div className="space-y-2.5">
                                <div className="rounded-lg border border-blue-300/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-200">Attendance dipped 8% in Session B2</div>
                                <div className="rounded-lg border border-red-300/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">Proxy risk pattern in Session B2</div>
                                <div className="rounded-lg border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">Session A1 reached 92% presence</div>
                            </div>
                            <p className="text-white/55 text-xs mt-3">Actionable alerts help you respond during the session, not after it ends.</p>
                        </div>
                    </div>
                </motion.section>

                <motion.section
                    initial={{ opacity: 0, y: 35 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={disableDecorativeMotion ? { duration: 0 } : { duration: 0.6 }}
                    className="perf-section max-w-6xl w-full mt-24 relative z-10"
                    id="seo-use-cases"
                >
                    <div className="text-center mb-10">
                        <h2 className="text-3xl md:text-4xl font-satoshi text-white mb-3">Attendance Software Use Cases in India</h2>
                        <p className="text-white/60 max-w-3xl mx-auto">Trackence supports institutions and organizations evaluating QR attendance systems and modern alternatives to manual registers.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 text-left">
                        {seoUseCases.map((item) => (
                            <article key={item.title} className="bg-secondary/55 border border-white/10 rounded-2xl p-5">
                                <h3 className="text-white text-xl font-satoshi mb-2">{item.title}</h3>
                                <p className="text-white/60 text-sm leading-relaxed">{item.description}</p>
                            </article>
                        ))}
                    </div>

                    <div className="bg-black/30 border border-white/10 rounded-2xl p-5 text-left">
                        <h3 className="text-white font-satoshi text-xl mb-4">Frequently Asked Questions</h3>
                        <div className="space-y-3 text-sm text-white/75">
                            <p><strong className="text-white">Is Trackence currently free to use?</strong> Yes, it is currently free to use in early access.</p>
                            <p><strong className="text-white">Can Trackence reduce proxy attendance?</strong> Yes, rotating QR and secure verification logic help reduce proxy attempts significantly.</p>
                            <p><strong className="text-white">Who can use Trackence?</strong> Colleges, coaching centers, communities, organizations, and teams that need structured attendance tracking.</p>
                        </div>
                    </div>
                </motion.section>

                <section className="max-w-5xl w-full mt-24 mb-10 relative z-10">
                    <div className="fake-glass rounded-3xl border border-white/15 px-6 py-8 sm:px-10 sm:py-10 text-center">
                        <h2 className="text-3xl sm:text-4xl text-white font-satoshi mb-3">Ready to start tracking attendance faster?</h2>
                        <p className="text-white/60 mb-6">Create a free account and start with live QR attendance workflows.</p>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            {isAuthenticated ? (
                                <Link
                                    to="/dashboard"
                                    className="px-6 py-3 rounded-xl bg-white text-black font-inter font-semibold hover:bg-gray-100 transition-colors"
                                >
                                    Go to Dashboard
                                </Link>
                            ) : (
                                <p className="text-white/70 text-sm sm:text-base font-inter">
                                    Use the Get Started Free button in the hero section to create your account.
                                </p>
                            )}
                        </div>
                    </div>
                </section>
            </div>

            <Footer />
        </>
    );
};

export default Home;
