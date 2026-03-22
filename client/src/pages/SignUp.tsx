import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuthStore } from "../stores/auth.store";
import { authAPI } from "../services/auth.service";
import { organizationAPI } from "../services/organization.service";

const Signup = () => {
  const [name, setName] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [inviteInfo, setInviteInfo] = useState<{
    token: string;
    organization: { name: string; code: string };
    invite: { expiresAt: string; invitedEmail?: string | null };
  } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const inviteToken = (searchParams.get("invite") || "").trim();

  const navigate = useNavigate();
  const setLoginEmail = useAuthStore((state) => state.setLoginEmail);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  useEffect(() => {
    let cancelled = false;
    const resolveInvite = async () => {
      if (!inviteToken) {
        setInviteInfo(null);
        setInviteError(null);
        return;
      }

      try {
        const info = await organizationAPI.getInviteByToken(inviteToken);
        if (!cancelled) {
          setInviteInfo(info);
          setInviteError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setInviteInfo(null);
          setInviteError(err?.message || "Invite link is invalid or expired.");
        }
      }
    };

    resolveInvite();
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const email = emailInput.trim().toLowerCase();

    if (!name.trim()) {
      setError("Full name is required.");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await authAPI.signup({
        name: name.trim(),
        email,
        inviteToken: inviteToken || undefined,
      });

      // ✅ Save email for OTP page
      setLoginEmail(email);

      // ✅ Navigate to OTP page and preserve invite redirect if present
      const redirect = inviteToken ? `/invite/${encodeURIComponent(inviteToken)}` : "";
      const otpPath = redirect
        ? `/auth/verify-otp?redirect=${encodeURIComponent(redirect)}`
        : "/auth/verify-otp";
      navigate(otpPath);
    } catch (err: any) {
      setError(
        err?.message || "Network error. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-32 md:mt-40 flex items-center justify-center px-6 pb-20 w-full overflow-hidden">
      <motion.section 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-md backdrop-blur-2xl bg-secondary/45
        border border-white/20 rounded-3xl px-8 sm:px-10 py-10 shadow-2xl relative"
      >
        <div className="absolute -top-10 -left-10 w-40 h-40 bg-[#ad431a]/10 blur-[60px] rounded-full pointer-events-none" />

        <h1 className="text-3xl font-bold text-white font-satoshi text-center mb-2 tracking-tight">
          Create Account
        </h1>

        <p className="text-white/60 font-inter text-sm text-center mb-8">
          Sign up to securely access the attendance platform
        </p>

        {inviteInfo && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="mb-5 rounded-2xl border border-green-400/20 bg-green-500/5 px-5 py-4"
          >
            <p className="text-green-400 text-sm font-semibold font-inter flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
              Workspace Invite
            </p>
            <p className="text-white/70 text-sm mt-1.5 font-outfit leading-relaxed">
              Joining <strong className="text-white">{inviteInfo.organization.name}</strong> ({inviteInfo.organization.code}).
            </p>
          </motion.div>
        )}

        {inviteError && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="mb-5 rounded-2xl border border-red-400/20 bg-red-500/5 px-5 py-4"
          >
            <p className="text-red-400 text-sm font-semibold font-inter">Invalid Invite</p>
            <p className="text-white/70 text-sm mt-1.5 font-outfit">{inviteError}</p>
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5 relative z-10">
          <input
            type="text"
            required
            placeholder="Jane Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-2xl px-5 py-3.5
              bg-black/30 backdrop-blur-md
              border border-white/10
              text-white placeholder-white/30 font-inter
              outline-none focus:border-white/40 focus:bg-black/50 transition-all duration-300"
          />

          <input
            type="email"
            required
            placeholder="name@organization.com"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            className="w-full rounded-2xl px-5 py-3.5
              bg-black/30 backdrop-blur-md
              border border-white/10
              text-white placeholder-white/30 font-inter
              outline-none focus:border-white/40 focus:bg-black/50 transition-all duration-300"
          />

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={loading}
            className="mt-2 w-full px-5 py-3.5 rounded-2xl
              bg-white
              text-black font-semibold font-inter tracking-wide text-md
              hover:bg-gray-100 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_25px_rgba(255,255,255,0.2)] disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer flex justify-center items-center gap-2"
          >
            {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                  Submitting…
                </>
            ) : "Create Account"}
          </motion.button>
        </form>

        {error && (
          <motion.p 
            initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
            className="text-red-400 text-sm mt-5 text-center font-inter bg-red-400/10 py-2 px-3 rounded-lg border border-red-400/20"
          >
            {error}
          </motion.p>
        )}

        <div className="mt-8 text-center border-t border-white/5 pt-6">
          <Link
            to="/auth/login"
            className="text-sm font-inter text-white/50 hover:text-white transition-colors flex items-center justify-center gap-2"
          >
            ← Back to Login
          </Link>
        </div>
      </motion.section>
    </div>
  );
};

export default Signup;
