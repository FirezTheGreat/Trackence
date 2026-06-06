import { Link } from "react-router-dom";
import { APP_NAME } from "../config/app";
import { Mail } from "lucide-react";
import { FaXTwitter } from "react-icons/fa6";

const Footer = () => {
    return (
        <footer className="w-full border-t border-white/10 bg-secondary/20 backdrop-blur-md mt-auto z-10 relative">
            <div className="max-w-7xl mx-auto px-6 py-12 md:py-16">

                {/* Top row: brand left, links right */}
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-10">

                    {/* Brand */}
                    <div className="max-w-xs">
                        <Link to="/" className="text-2xl font-bold font-satoshi text-white tracking-wide mb-4 block">
                            {APP_NAME}
                        </Link>
                        <p className="text-white/60 font-inter text-sm leading-relaxed mb-6">
                            The ultimate platform for seamless attendance recording, management, and analytics. Universal and friction-free.
                        </p>
                        <a href="https://x.com/trackenceapp" target="_blank" rel="noreferrer" aria-label="Twitter (X)" className="text-white/50 hover:text-white transition-colors duration-200 inline-block">
                            <FaXTwitter className="w-5 h-5" />
                        </a>
                    </div>

                    {/* Link columns */}
                    <div className="flex gap-16 md:gap-20">
                        <div>
                            <h4 className="text-white font-satoshi font-semibold mb-4 text-sm">Product</h4>
                            <ul className="space-y-3">
                                <li><a href="/#problem-solution" className="text-white/60 hover:text-white text-sm font-inter transition-colors">Problem vs Solution</a></li>
                                <li><a href="/#how-it-works" className="text-white/60 hover:text-white text-sm font-inter transition-colors">How It Works</a></li>
                                <li><a href="/#dashboard-preview" className="text-white/60 hover:text-white text-sm font-inter transition-colors">Dashboard</a></li>
                                <li><a href="/#seo-use-cases" className="text-white/60 hover:text-white text-sm font-inter transition-colors">Use Cases</a></li>
                            </ul>
                        </div>

                        <div>
                            <h4 className="text-white font-satoshi font-semibold mb-4 text-sm">Company</h4>
                            <ul className="space-y-3">
                                <li><a href="https://github.com/FirezTheGreat/Trackence" target="_blank" rel="noreferrer" className="text-white/60 hover:text-white text-sm font-inter transition-colors">Open Source</a></li>
                                <li><a href="mailto:support@trackence.app" className="text-white/60 hover:text-white text-sm font-inter transition-colors">Contact</a></li>
                                <li><Link to="/privacy" className="text-white/60 hover:text-white text-sm font-inter transition-colors">Privacy Policy</Link></li>
                                <li><Link to="/terms" className="text-white/60 hover:text-white text-sm font-inter transition-colors">Terms of Service</Link></li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Bottom row: copyright left, email right */}
                <div className="border-t border-white/10 mt-12 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
                    <p className="text-white/40 text-sm font-inter">
                        &copy; {new Date().getFullYear()} {APP_NAME}. All rights reserved.
                    </p>
                    <a href="mailto:support@trackence.app" className="text-white/40 hover:text-white/70 text-sm font-inter transition-colors flex items-center gap-1.5">
                        <Mail className="w-4 h-4" />
                        support@trackence.app
                    </a>
                </div>

            </div>
        </footer>
    );
};

export default Footer;