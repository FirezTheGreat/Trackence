import { motion, type Variants } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";

const sections = [
    {
        title: "Introduction",
        body: "By using Trackence, you agree to these terms. Trackence is a personal project, not a commercial product of a registered entity.",
    },
    {
        title: "Eligibility",
        body: "You must be 13 or older to use Trackence. By using the platform, you confirm that you have permission from your organization to create sessions.",
    },
    {
        title: "Account Responsibilities",
        body: "You are responsible for keeping your account credentials secure. Do not share your account with others.",
    },
    {
        title: "Acceptable Use",
        body: "Do not use Trackence to collect attendance fraudulently, impersonate others, or abuse the QR session system.",
    },
    {
        title: "Data Ownership",
        body: "You own the attendance data you create. Trackence does not claim ownership of your data.",
    },
    {
        title: "Service Availability",
        body: "Trackence is provided as-is. No uptime guarantees are made because this is an individual-run project.",
    },
    {
        title: "Limitation of Liability",
        body: "The developer is not liable for any loss of data or damages arising from the use of the platform.",
    },
    {
        title: "Termination",
        body: "Accounts found violating these terms may be suspended or deleted.",
    },
    {
        title: "Governing Law",
        body: "These terms are governed by the laws of India.",
    },
    {
        title: "Contact",
        body: "For questions about these terms, contact support@trackence.app.",
    },
];

const pageVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.12,
            delayChildren: 0.08,
        },
    },
};

const itemVariants: Variants = {
    hidden: { opacity: 0, y: 26 },
    visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100, damping: 18 } },
};

export default function Terms() {
    const navigate = useNavigate();

    return (
        <div className="relative min-h-dvh overflow-hidden text-white">
            <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none bg-primary">
                <div className="absolute inset-0 animated-ocean-background opacity-80" />
                <div className="home-ambient-gradient absolute inset-0 opacity-60" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.08),transparent_30%)]" />
            </div>

            <motion.div variants={pageVariants} initial="hidden" animate="visible">
                <div className="max-w-3xl mx-auto px-6 py-16">
                    <div className="backdrop-blur-2xl bg-secondary/40 border border-white/10 rounded-2xl p-6 sm:p-10 shadow-lg shadow-black/20">
                        <motion.div variants={itemVariants} className="mb-6 flex items-start justify-between gap-6">
                            <div>
                                <p className="text-white/60 font-inter text-sm uppercase tracking-[0.2em]">Trackence Legal</p>
                                <h1 className="text-3xl font-satoshi font-bold text-white tracking-tight mt-2">Terms of Service</h1>
                                <p className="text-white/70 font-inter text-sm leading-relaxed max-w-2xl mt-3">Effective date: June 2025. These terms describe the rules for using Trackence at trackence.app.</p>
                            </div>

                            <div className="shrink-0">
                                <Button
                                    type="button"
                                    variant="tertiary"
                                    size="sm"
                                    onClick={() => navigate("/")}
                                    className="inline-flex items-center gap-2"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                    Back to Home
                                </Button>
                            </div>
                        </motion.div>

                        <motion.nav variants={itemVariants} className="mb-6">
                            <h3 className="text-sm font-satoshi text-white mb-2">On This Page</h3>
                            <ul className="flex flex-wrap gap-3">
                                {sections.map((s) => (
                                    <li key={s.title}>
                                        <a href={`#${s.title.replace(/\s+/g, "-").toLowerCase()}`} className="text-white/70 text-sm font-inter hover:text-white transition-colors">{s.title}</a>
                                    </li>
                                ))}
                            </ul>
                        </motion.nav>

                        <motion.div variants={itemVariants} className="space-y-6">
                            {sections.map((section) => (
                                <section id={section.title.replace(/\s+/g, "-").toLowerCase()} key={section.title} className="pb-6 border-b border-white/10 last:border-b-0 last:pb-0">
                                    <h2 className="text-lg font-satoshi font-semibold text-white mb-3 pl-3 border-l-2 border-accent/60">{section.title}</h2>
                                    <p className="text-sm font-inter text-white/70 leading-relaxed">{section.body}</p>
                                </section>
                            ))}
                        </motion.div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}