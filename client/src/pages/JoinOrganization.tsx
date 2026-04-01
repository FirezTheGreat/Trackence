import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { organizationAPI } from "../services/organization.service";
import { useAuthStore } from "../stores/auth.store";
import { toast } from "../stores/toast.store";
import { Link2, LogIn, CheckCircle2 } from "lucide-react";
import useAppSeo from "../hooks/useAppSeo";
import { APP_NAME } from "../config/app";

const JoinOrganization = () => {
    useAppSeo({
        title: `${APP_NAME} | Join Organization`,
        description: `Join an existing organization in ${APP_NAME} using an invite token and start tracking attendance.`,
        path: "/organizations/join",
        isPrivate: true,
    });

    const navigate = useNavigate();
    const location = useLocation();
    const [actionLoading, setActionLoading] = useState(false);
    
    // Automatically extract token if passed via ?token= URL parameter
    const queryParams = new URLSearchParams(location.search);
    const initialToken = queryParams.get("token") || "";
    const [inviteInput, setInviteInput] = useState(initialToken);

    const { checkAuth } = useAuthStore();

    const handleJoinWithToken = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const trimmedOptions = inviteInput.trim();
        if (!trimmedOptions) {
            toast.error("Please enter a valid invite token or link.");
            return;
        }

        // Extract token if user pastes full URL
        let tokenToUse = trimmedOptions;
        if (tokenToUse.includes('/invite/')) {
            try {
                const url = new URL(tokenToUse);
                const parts = url.pathname.split('/invite/');
                if (parts.length > 1) {
                    tokenToUse = parts[1].split('/')[0];
                }
            } catch {
                // Ignore parsing errors, assume it's a raw token
            }
        }

        setActionLoading(true);
        try {
            const data = await organizationAPI.requestOrganizationViaInvite(tokenToUse);
            toast.success(data.message || "Join request submitted. Awaiting admin approval.");
            
            // Re-sync auth status to update memberships/pending
            await checkAuth();
            
            // Navigate back to organizations to see pending status
            navigate("/organizations"); 
        } catch (err: any) {
            toast.error(err.message || "Failed to submit join request. The token may be invalid or expired.");
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
            <div className="w-full max-w-xl backdrop-blur-3xl bg-secondary/40 border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden">
                {/* Decorative Elements */}
                <div className="absolute top-0 left-0 -ml-16 -mt-16 w-64 h-64 bg-accent/20 rounded-full blur-[80px] pointer-events-none" />
                <div className="absolute bottom-0 right-0 -mr-16 -mb-16 w-48 h-48 bg-purple-500/10 rounded-full blur-[80px] pointer-events-none" />

                <div className="relative z-10">
                    <div className="mb-10 text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-linear-to-br from-white/10 to-white/5 border border-white/10 mb-6 shadow-inner">
                            <Link2 className="w-8 h-8 text-white/80" />
                        </div>
                        <h1 className="text-3xl md:text-4xl font-bold text-white mb-3 tracking-tight">Join Organization</h1>
                        <p className="text-white/60 text-lg">Enter an invite token or paste an invite link to request access.</p>
                    </div>

                    <form onSubmit={handleJoinWithToken} className="space-y-6">
                        <div className="space-y-4">
                            <div className="relative group">
                                <label className="text-white/80 text-sm font-medium mb-1.5 block ml-1">Invite Token or URL</label>
                                <div className="relative h-14">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <LogIn className="w-5 h-5 text-white/40 group-focus-within:text-white/80 transition-colors" />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="e.g., https://example.com/invite/abc-123 or abc-123"
                                        value={inviteInput}
                                        onChange={(e) => setInviteInput(e.target.value)}
                                        className="w-full h-full pl-11 pr-4 bg-black/20 border border-white/10 rounded-xl text-white placeholder:text-white/20 focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-all outline-none"
                                        required
                                    />
                                </div>
                                <p className="text-white/40 text-xs mt-2 ml-1">You will be placed in a pending state until an administrator approves your request.</p>
                            </div>
                        </div>

                        <div className="pt-4 flex flex-col sm:flex-row gap-4">
                            <button
                                type="button"
                                onClick={() => navigate(-1)}
                                className="flex-1 py-4 px-6 rounded-xl border border-white/10 text-white/70 font-medium hover:bg-white/5 hover:text-white transition-all order-2 sm:order-1 cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={actionLoading || !inviteInput.trim()}
                                className="flex-1 py-4 px-6 rounded-xl bg-white text-black font-semibold hover:bg-white/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group order-1 sm:order-2 shadow-lg cursor-pointer"
                            >
                                {actionLoading ? (
                                    <>Requesting...</>
                                ) : (
                                    <>
                                        Request Join
                                        <CheckCircle2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default JoinOrganization;

