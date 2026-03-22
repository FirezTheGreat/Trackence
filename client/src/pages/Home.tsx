import { Link } from "react-router-dom";
import { useAuthStore } from "../stores/auth.store";
import { APP_NAME } from "../config/app";
import { motion, type Variants } from "framer-motion";
import { QrCode, BarChart3, ShieldCheck, Zap, ArrowRight, Building2, Smartphone, Users } from "lucide-react";
import Footer from "../components/Footer";

const Home = () => {
    const { isAuthenticated } = useAuthStore();

    // Framer Motion Variants
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

    return (
        <>
            {/* AMBIENT BACKGROUND */}
            <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
                <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] bg-[#ad431a]/20 rounded-full blur-[150px] mix-blend-screen animate-pulse" style={{ animationDuration: '6s' }} />
                <div className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] bg-accent/20 rounded-full blur-[200px] mix-blend-screen animate-pulse" style={{ animationDuration: '8s' }} />
                
                {/* CSS GRID OVERLAY */}
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdib3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djI2aDJWMzRoMjZ2LTJoLTI2VjJoLTJ2MjZIMnYyaDM0eiIvPjwvZz48L2c+PC9zdmc+')] opacity-50 mask-[linear-gradient(to_bottom,white_0%,transparent_80%)]" />
            </div>

            <div className="flex flex-col items-center justify-center w-full overflow-hidden text-center pb-24 px-4 sm:px-6">
            
            {/* HERO SECTION */}
            <motion.section
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="mt-20 md:mt-32 max-w-5xl flex flex-col items-center justify-center relative z-10"
            >
                <motion.div variants={itemVariants} className="inline-block mb-4 px-4 py-1.5 rounded-full border border-white/20 bg-white/5 backdrop-blur-md">
                    <span className="text-white/80 font-inter text-sm font-medium tracking-wide">
                        Next-Generation Presence Intelligence
                    </span>
                </motion.div>

                <motion.h1 
                    variants={itemVariants}
                    className="text-5xl md:text-7xl font-bold text-white font-satoshi tracking-tight leading-tight mb-6"
                >
                    Seamless Tracking. <br className="hidden md:block" />
                    <span className="text-transparent bg-clip-text bg-linear-to-r from-orange-400 to-[#ad431a]">
                        Zero Friction.
                    </span>
                </motion.h1>

                <motion.p 
                    variants={itemVariants}
                    className="text-white/70 max-w-2xl text-lg md:text-xl font-outfit leading-relaxed mb-10 px-2"
                >
                    {APP_NAME} is your ultimate platform for recording, managing, and analyzing attendance. 
                    Built for speed, styled for the modern web, and scalable to any institution.
                </motion.p>

                <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                    <Link
                        to={isAuthenticated ? "/scan-qr" : "/auth/login"}
                        className="group flex items-center justify-center gap-2 font-geist-mono tracking-wider
                                 rounded-2xl px-8 py-3.5 bg-white text-black hover:bg-gray-100 font-bold text-lg
                                 transition-all shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:shadow-[0_0_40px_rgba(255,255,255,0.4)] hover:scale-105 duration-300"
                    >
                        {isAuthenticated ? "Launch Scanner" : "Get Started"}
                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </Link>
                    {!isAuthenticated && (
                        <Link
                            to="/auth/signup"
                            className="flex items-center justify-center font-geist-mono tracking-wider
                                     backdrop-blur-md rounded-2xl px-8 py-3.5 border border-white/20
                                     bg-secondary/30 text-white hover:bg-secondary/60 font-medium text-lg
                                     transition-all duration-300 hover:scale-105"
                        >
                            Create Account
                        </Link>
                    )}
                </motion.div>
            </motion.section>

            {/* FEATURES GRID SECTION */}
            <motion.section 
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.7 }}
                className="max-w-6xl w-full mt-32 relative z-10"
            >
                <div className="mb-12 text-center">
                    <h2 className="text-3xl md:text-4xl font-bold text-white font-satoshi mb-4">Everything You Need</h2>
                    <p className="text-white/60 font-inter max-w-xl mx-auto">Powerful features designed to make tracking effortless for both attendees and administrators.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {featureCards.map((card, idx) => (
                        <motion.div 
                            key={idx}
                            whileHover={{ y: -8, scale: 1.02 }}
                            className="bg-secondary/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-left shadow-lg transition-colors hover:bg-secondary/60 hover:border-white/20"
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
                transition={{ duration: 0.7 }}
                className="max-w-5xl w-full mt-32 relative z-10 mb-20"
            >
                <div className="bg-black/20 backdrop-blur-2xl border border-white/10 rounded-3xl p-10 md:p-16 w-full shadow-2xl relative overflow-hidden">
                    {/* Glowing background hint */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-[#ad431a]/20 blur-[100px] rounded-full pointer-events-none" />
                    
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
