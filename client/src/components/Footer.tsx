import { Link } from "react-router-dom";
import { APP_NAME } from "../config/app";
import { Github, Twitter, Linkedin, Mail } from "lucide-react";

const Footer = () => {
    return (
        <footer className="w-full border-t border-white/10 bg-secondary/20 backdrop-blur-md mt-auto z-10 relative">
            <div className="max-w-7xl mx-auto px-6 py-12 md:py-16">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-10 md:gap-8">
                    
                    {/* Brand */}
                    <div className="col-span-1 md:col-span-1 flex flex-col items-start">
                        <Link to="/" className="text-2xl font-bold font-satoshi text-white tracking-wide mb-4">
                            {APP_NAME}
                        </Link>
                        <p className="text-white/60 font-inter text-sm leading-relaxed mb-6">
                            The ultimate platform for seamless attendance recording, management, and analytics. Universal and friction-free.
                        </p>
                        <div className="flex gap-4 text-white/50">
                            <a href="#" className="hover:text-white transition-colors duration-200">
                                <Twitter className="w-5 h-5" />
                            </a>
                            <a href="#" className="hover:text-white transition-colors duration-200">
                                <Github className="w-5 h-5" />
                            </a>
                            <a href="#" className="hover:text-white transition-colors duration-200">
                                <Linkedin className="w-5 h-5" />
                            </a>
                        </div>
                    </div>

                    {/* Links */}
                    <div>
                        <h4 className="text-white font-satoshi font-semibold mb-4">Product</h4>
                        <ul className="space-y-3">
                            <li><Link to="/" className="text-white/60 hover:text-white text-sm font-inter transition-colors">Features</Link></li>
                            <li><Link to="/" className="text-white/60 hover:text-white text-sm font-inter transition-colors">Integrations</Link></li>
                            <li><Link to="/" className="text-white/60 hover:text-white text-sm font-inter transition-colors">Pricing</Link></li>
                            <li><Link to="/" className="text-white/60 hover:text-white text-sm font-inter transition-colors">Changelog</Link></li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="text-white font-satoshi font-semibold mb-4">Resources</h4>
                        <ul className="space-y-3">
                            <li><Link to="/" className="text-white/60 hover:text-white text-sm font-inter transition-colors">Documentation</Link></li>
                            <li><Link to="/" className="text-white/60 hover:text-white text-sm font-inter transition-colors">API Reference</Link></li>
                            <li><Link to="/" className="text-white/60 hover:text-white text-sm font-inter transition-colors">Community</Link></li>
                            <li><Link to="/" className="text-white/60 hover:text-white text-sm font-inter transition-colors">Blog</Link></li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="text-white font-satoshi font-semibold mb-4">Legal</h4>
                        <ul className="space-y-3">
                            <li><Link to="/" className="text-white/60 hover:text-white text-sm font-inter transition-colors">Privacy Policy</Link></li>
                            <li><Link to="/" className="text-white/60 hover:text-white text-sm font-inter transition-colors">Terms of Service</Link></li>
                            <li><Link to="/" className="text-white/60 hover:text-white text-sm font-inter transition-colors">Security</Link></li>
                            <li><Link to="/" className="text-white/60 hover:text-white text-sm font-inter transition-colors">Contact Us</Link></li>
                        </ul>
                    </div>
                </div>

                <div className="border-t border-white/10 mt-12 pt-8 flex flex-col md:flex-row items-center justify-between">
                    <p className="text-white/40 text-sm font-inter">
                        &copy; {new Date().getFullYear()} {APP_NAME}. All rights reserved.
                    </p>
                    <div className="flex gap-6 mt-4 md:mt-0 text-white/40 text-sm font-inter">
                        <span className="flex items-center gap-1">
                            <Mail className="w-4 h-4" /> support@{APP_NAME.toLowerCase()}.com
                        </span>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default Footer;