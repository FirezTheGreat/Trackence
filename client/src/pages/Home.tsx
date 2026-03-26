import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "../stores/auth.store";
import { APP_NAME } from "../config/app";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { QrCode, BarChart3, ShieldCheck, Zap, ArrowRight, Building2, Smartphone, Users, ChevronDown } from "lucide-react";
import Footer from "../components/Footer";
import useAppSeo from "../hooks/useAppSeo";
import { isAndroidDevice, isCoarsePointerDevice, isIOSDevice, shouldEnableIOSPerfMode } from "../utils/device";

const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.15, delayChildren: 0.1 }
    }
};

const itemVariants: Variants = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100, damping: 20 } }
};

const featureCards = [
    {
        icon: <QrCode className="w-8 h-8 text-[#ad431a]" />,
        title: "Instant QR Scanning",
        description: "Mark attendance seamlessly with encrypted, fast, and secure QR codes. No more roll call delays."
    },
    {
        icon: <Building2 className="w-8 h-8 text-[#ad431a]" />,
        title: "Multi-Org Support",
        description: "Scale effortlessly. Manage various departments, branches, or entire institutions under one roof."
    },
    {
        icon: <BarChart3 className="w-8 h-8 text-[#ad431a]" />,
        title: "Real-Time Analytics",
        description: "Gain immediate insights into attendance trends, absent alerts, and demographic breakdown instantly."
    },
    {
        icon: <ShieldCheck className="w-8 h-8 text-[#ad431a]" />,
        title: "Secure Verification",
        description: "Enterprise-grade security using registered email verifications preventing proxy attendance."
    }
];

const steps = [
    { icon: <Smartphone />, title: "Register", desc: "Create an organization or join one via an official invite." },
    { icon: <Zap />, title: "Scan", desc: "Use the built-in scanner to mark presence instantly during a session." },
    { icon: <Users />, title: "Monitor", desc: "Keep track of session histories and overall organizational analytics." }
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
        title: `${APP_NAME} | QR Attendance Platform`,
        description:
            "Trackence is a secure QR-based attendance platform with real-time session tracking, analytics, and organization-aware access control.",
        path: "/",
        image: "/logo.png",
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
        ],
    });

    return (
        <>
            {/* AMBIENT BACKGROUND */}
            <div className="ambient-bg absolute top-0 left-0 w-full h-[120vh] pointer-events-none -z-10 overflow-hidden">
                <div className="home-ambient-gradient absolute inset-0 opacity-90" />
                
                {/* CSS GRID OVERLAY */}
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdib3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djI2aDJWMzRoMjZ2LTJoLTI2VjJoLTJ2MjZIMnYyaDM0eiIvPjwvZz48L2c+PC9zdmc+')] opacity-35" />
            </div>

            <div className="flex flex-col items-center justify-center w-full overflow-x-hidden text-center pb-24 px-3 sm:px-5 md:px-6">
            
            {/* HERO SECTION */}
            <motion.section
                variants={containerVariants}
                initial={disableDecorativeMotion ? undefined : "hidden"}
                animate={disableDecorativeMotion ? undefined : "visible"}
                className="perf-section min-h-[85dvh] py-4 max-w-5xl flex flex-col items-center justify-center relative z-10"
            >
                {/* Abstract Core Glow Behind Text */}
                <div className="home-hero-core-glow home-decor-motion absolute inset-[-20%] pointer-events-none -z-10" />

                <motion.div variants={itemVariants} className="fake-glass inline-block mb-8 px-5 py-2 rounded-full shadow-[0_0_15px_rgba(255,255,255,0.05)] hover:bg-white/12 transition-all duration-500 cursor-default">
                    <span className="text-white/80 font-inter text-sm font-medium tracking-wider flex items-center gap-3">
                        <span className="relative flex h-2.5 w-2.5">
                            <span className={`${disableDecorativeMotion ? "" : "home-signal-pulse"} absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75`}></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,1)]"></span>
                        </span>
                        Next-Generation Presence Intelligence
                    </span>
                </motion.div>

                <motion.h1 
                    variants={itemVariants}
                    className="text-5xl md:text-7xl lg:text-8xl font-bold text-white font-satoshi tracking-tight leading-tight mb-8"
                >
                    Seamless Tracking. <br className="hidden md:block" />
                    <span className="text-transparent bg-clip-text bg-linear-to-r from-orange-400 via-[#ff6b2b] to-[#a33c16] drop-shadow-[0_0_20px_rgba(173,67,26,0.3)] select-none">
                        Zero Friction.
                    </span>
                </motion.h1>

                <motion.p 
                    variants={itemVariants}
                    className="text-white/60 max-w-3xl text-lg md:text-2xl font-outfit leading-relaxed mb-12 px-2"
                >
                    {APP_NAME} is your ultimate platform for recording, managing, and analyzing attendance. 
                    Built for speed, styled for the modern web, and scalable to any institution.
                </motion.p>

                <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-5 w-full sm:w-auto z-20 relative">
                    {/* Glow wrapper for primary button */}
                    <div className="relative group">
                        <div className="absolute -inset-0.5 bg-linear-to-r from-orange-500 to-[#ad431a] rounded-2xl blur opacity-30 group-hover:opacity-60 transition duration-500 group-hover:duration-200"></div>
                        <Link
                            to={isAuthenticated ? "/scan-qr" : "/auth/login"}
                            className="relative flex items-center justify-center gap-2 font-geist-mono tracking-wider
                                     rounded-2xl px-10 py-4 bg-white text-black hover:bg-gray-100 font-bold text-lg
                                     transition-all duration-300"
                        >
                            {isAuthenticated ? "Launch Scanner" : "Get Started"}
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </Link>
                    </div>
                    
                    {!isAuthenticated && (
                        <Link
                            to="/auth/signup"
                            className="flex items-center justify-center font-geist-mono tracking-wider
                                     fake-glass rounded-2xl px-10 py-4
                                     text-white hover:bg-white/10 hover:border-white/40 font-medium text-lg
                                     transition-all duration-300"
                        >
                            Create Account
                        </Link>
                    )}
                </motion.div>
            </motion.section>

            {/* SCROLL DOWN CUE */}
            {!disableDecorativeMotion && !hasScrolled && (
                <motion.div className={`home-decor-motion fixed bottom-6 left-1/2 -translate-x-1/2 flex-col items-center gap-1 text-white/30 animate-bounce pointer-events-none z-50 ${isNonLaptopDevice ? "flex" : "hidden md:flex"}`}>
                    <ChevronDown className="w-6 h-6 opacity-70" />
                </motion.div>
            )}

            {/* FEATURES GRID SECTION */}
            <motion.section 
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                        transition={disableDecorativeMotion ? { duration: 0 } : { duration: 0.7 }}
                className="perf-section max-w-6xl w-full mt-10 relative z-10"
            >
                <div className="mb-12 text-center">
                    <h2 className="text-3xl md:text-4xl font-bold text-white font-satoshi mb-4">Everything You Need</h2>
                    <p className="text-white/60 font-inter max-w-xl mx-auto">Powerful features designed to make tracking effortless for both attendees and administrators.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {featureCards.map((card, idx) => (
                        <motion.div 
                            key={idx}
                            whileHover={disableDecorativeMotion ? undefined : { y: -8, scale: 1.02 }}
                            className="bg-secondary/55 border border-white/10 rounded-2xl p-6 text-left shadow-[0_4px_30px_rgba(0,0,0,0.1)] transition-all duration-300 hover:bg-white/8 hover:border-[#ad431a]/50 hover:shadow-[0_8px_40px_rgba(173,67,26,0.15)]"
                        >
                            <div className="bg-black/30 w-14 h-14 rounded-2xl flex items-center justify-center mb-5 border border-white/5">
                                {card.icon}
                            </div>
                            <h3 className="text-xl font-semibold text-white font-satoshi mb-3">{card.title}</h3>
                            <p className="text-sm text-white/60 font-inter leading-relaxed">{card.description}</p>
                        </motion.div>
                    ))}
                </div>
            </motion.section>

            {/* HOW IT WORKS SECTION */}
            <motion.section 
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={disableDecorativeMotion ? { duration: 0 } : { duration: 0.7 }}
                className="perf-section max-w-5xl w-full mt-32 relative z-10 mb-20"
            >
                <div className="bg-black/30 border border-white/10 rounded-3xl p-10 md:p-16 w-full shadow-2xl relative overflow-hidden group">
                    {/* Glowing background hints */}
                    <div className="home-steps-glow-a home-decor-motion absolute -top-28 -right-28 w-80 h-80 pointer-events-none transition-opacity duration-500 group-hover:opacity-100 opacity-70" />
                    <div className="home-steps-glow-b home-decor-motion absolute -bottom-28 -left-28 w-80 h-80 pointer-events-none transition-opacity duration-500 group-hover:opacity-100 opacity-50" />
                    
                    <h2 className="text-3xl font-bold text-white font-satoshi mb-12 text-center">Get Flowing in 3 Steps</h2>
                    
                    <div className="flex flex-col md:flex-row gap-8 items-start justify-between relative">
                        {/* Connecting Line connecting steps on desktop */}
                        <div className="hidden md:block absolute top-11 left-[15%] right-[15%] h-0.5 bg-linear-to-r from-transparent via-white/20 to-transparent z-0" />

                        {steps.map((step, idx) => (
                            <div key={idx} className="flex-1 flex flex-col items-center relative z-10 text-center group">
                                <div className="w-20 h-20 rounded-full bg-secondary/80 border border-white/20 flex items-center justify-center text-white mb-6 shadow-xl transition-transform group-hover:scale-110 duration-300">
                                    {step.icon}
                                </div>
                                <h4 className="text-lg font-bold text-white font-satoshi mb-2">{step.title}</h4>
                                <p className="text-sm text-white/60 font-inter">{step.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </motion.section>

            </div>
            <Footer />
        </>
    );
};

export default Home;
