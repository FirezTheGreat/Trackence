import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { organizationAPI } from "../services/organization.service";
import { useAuthStore } from "../stores/auth.store";

const InviteLanding = () => {
    const { token: rawToken } = useParams<{ token: string }>();
    const token = String(rawToken || "").trim();
    const navigate = useNavigate();

    const user = useAuthStore((state) => state.user);
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const checkAuth = useAuthStore((state) => state.checkAuth);

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [inviteInfo, setInviteInfo] = useState<{
        organization: {
            organizationId: string;
            name: string;
            code: string;
            description?: string;
        };
        invite: {
            expiresAt: string;
            invitedEmail?: string | null;
            invitedUserId?: string | null;
        };
    } | null>(null);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            if (!token) {
                setError("Invite token is missing.");
                setLoading(false);
                return;
            }

            setLoading(true);
            setError(null);

            try {
                const data = await organizationAPI.getInviteByToken(token);
                if (!cancelled) {
                    setInviteInfo({
                        organization: data.organization,
                        invite: data.invite,
                    });
                }
            } catch (err: any) {
                if (!cancelled) {
                    setError(err?.message || "Invite link is invalid or expired.");
                    setInviteInfo(null);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [token]);

    const hasOrgMembership = useMemo(() => {
        if (!inviteInfo || !user) return false;
        return (user.organizationIds || []).includes(inviteInfo.organization.organizationId);
    }, [inviteInfo, user]);

    const hasPendingRequest = useMemo(() => {
        if (!inviteInfo || !user) return false;
        return (user.requestedOrganizationIds || []).includes(inviteInfo.organization.organizationId);
    }, [inviteInfo, user]);

    const isPublicInvite = useMemo(() => {
        if (!inviteInfo) return false;
        return !inviteInfo.invite.invitedEmail && !inviteInfo.invite.invitedUserId;
    }, [inviteInfo]);

    const handleAcceptInvite = async () => {
        if (!token) return;
        setSubmitting(true);
        setError(null);
        setSuccess(null);

        try {
            const response = await organizationAPI.requestOrganizationViaInvite(token);
            setSuccess(response.message || "Join request submitted successfully.");
            await checkAuth();
        } catch (err: any) {
            setError(err?.message || "Failed to submit request.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleRejectInvite = async () => {
        if (!token) return;
        setSubmitting(true);
        setError(null);
        setSuccess(null);

        try {
            const response = await organizationAPI.rejectInvite(token);
            setSuccess(response.message || "Invite rejected.");
            await checkAuth();
        } catch (err: any) {
            setError(err?.message || "Failed to reject invite.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-[70vh] px-4 sm:px-6 md:px-8 py-10 flex items-center justify-center animate-fade-in-up box-border w-full">
            <section className="w-full max-w-2xl backdrop-blur-2xl bg-secondary/45 border border-white/20 rounded-2xl px-5 sm:px-10 py-8 shadow-lg shadow-black/10 box-border">
                <div className="text-center mb-6">
                    <p className="text-accent text-sm font-geist-mono tracking-wide">Organization Invite</p>
                    <h1 className="text-3xl font-semibold text-white font-satoshi mt-1">Join Organization</h1>
                    <p className="text-white/60 text-sm mt-2">Review this invitation and continue securely.</p>
                </div>

                {loading ? (
                    <div className="text-center py-8">
                        <p className="text-white/70">Loading invite details...</p>
                    </div>
                ) : error ? (
                    <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-4 text-center">
                        <p className="text-red-300 text-sm font-semibold">Invite unavailable</p>
                        <p className="text-white/70 text-sm mt-1">{error}</p>
                        <div className="mt-4">
                            <Link to="/" className="text-sm text-accent hover:underline">Go to Home</Link>
                        </div>
                    </div>
                ) : inviteInfo ? (
                    <>
                        <div className="rounded-xl border border-white/15 bg-white/5 px-4 py-4 mb-5">
                            <p className="text-white text-lg font-semibold">{inviteInfo.organization.name}</p>
                            <p className="text-white/50 text-xs mt-1">Code: {inviteInfo.organization.code}</p>
                            {inviteInfo.organization.description ? (
                                <p className="text-white/70 text-sm mt-3">{inviteInfo.organization.description}</p>
                            ) : null}
                            <p className="text-white/40 text-xs mt-3">
                                Expires: {new Date(inviteInfo.invite.expiresAt).toLocaleString()}
                            </p>
                        </div>

                        {success && (
                            <div className="rounded-xl border border-green-400/30 bg-green-500/10 px-4 py-3 mb-4">
                                <p className="text-green-300 text-sm">{success}</p>
                            </div>
                        )}

                        {!success && isAuthenticated && hasOrgMembership && (
                            <div className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 mb-4">
                                <p className="text-accent text-sm">You are already a member of this organization.</p>
                            </div>
                        )}

                        {!success && isAuthenticated && !hasOrgMembership && hasPendingRequest && (
                            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 mb-4">
                                <p className="text-amber-300 text-sm">You already have a pending request, but you can still accept or reject this invite below.</p>
                            </div>
                        )}

                        {!success && isAuthenticated && !hasOrgMembership && (
                            <div className="flex flex-col sm:flex-row gap-3">
                                <button
                                    onClick={handleAcceptInvite}
                                    disabled={submitting}
                                    className="flex-1 px-4 py-3 rounded-xl bg-accent/20 border border-accent/40 text-accent font-semibold hover:bg-accent/30 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {submitting ? "Processing..." : "Request to Join"}
                                </button>
                                {!isPublicInvite && (
                                    <button
                                        onClick={handleRejectInvite}
                                        disabled={submitting}
                                        className="flex-1 px-4 py-3 rounded-xl bg-red-500/10 border border-red-400/40 text-red-300 font-semibold hover:bg-red-500/20 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {submitting ? "Processing..." : "Ignore Invite"}
                                    </button>
                                )}
                            </div>
                        )}

                        {!isAuthenticated && (
                            <div className="flex flex-col sm:flex-row gap-3">
                                <button
                                    onClick={() => navigate(`/auth/signup?invite=${encodeURIComponent(token)}`)}
                                    className="flex-1 px-4 py-3 rounded-xl bg-accent/20 border border-accent/40 text-accent font-semibold hover:bg-accent/30 transition cursor-pointer"
                                >
                                    Sign Up with Invite
                                </button>
                                <button
                                    onClick={() => navigate(`/auth/login?redirect=${encodeURIComponent(`/invite/${token}`)}`)}
                                    className="flex-1 px-4 py-3 rounded-xl bg-secondary/55 border border-white/20 text-white/80 font-semibold hover:text-white transition cursor-pointer"
                                >
                                    Log In First
                                </button>
                            </div>
                        )}
                    </>
                ) : null}
            </section>
        </div>
    );
};

export default InviteLanding;
