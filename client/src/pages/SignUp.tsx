import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../stores/auth.store";
import { authAPI } from "../services/auth.service";
import { APIError } from "../services/api";
import { toast } from "../stores/toast.store";
import { organizationAPI } from "../services/organization.service";
import { APP_NAME } from "../config/app";
import useAppSeo from "../hooks/useAppSeo";

const SIGNUP_NAME_DRAFT_KEY = "authSignupDraftName";
const SIGNUP_EMAIL_DRAFT_KEY = "authSignupDraftEmail";

const Signup = () => {
  const [name, setName] = useState(() => String(sessionStorage.getItem(SIGNUP_NAME_DRAFT_KEY) || ""));
  const [emailInput, setEmailInput] = useState(() => String(sessionStorage.getItem(SIGNUP_EMAIL_DRAFT_KEY) || ""));
  const [inviteInfo, setInviteInfo] = useState<{
    token: string;
    organization: { name: string; code: string };
    invite: { expiresAt: string; invitedEmail?: string | null };
  } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const inviteToken = (searchParams.get("invite") || "").trim();

  const navigate = useNavigate();
  const setLoginEmail = useAuthStore((state) => state.setLoginEmail);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);

  useAppSeo({
    title: `${APP_NAME} | Create Account`,
    description: `Create your ${APP_NAME} account to start secure QR attendance tracking, session management, and analytics.`,
    path: "/auth/signup",
  });

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof APIError) {
      const normalized = String(error.message || "").trim();
      if (!normalized) {
        return "Request failed. Please try again.";
      }

      if (error.status === 422) {
        return `${normalized} Please use another email address or request account recovery.`;
      }

      return normalized;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return "Network error. Please try again.";
  };

  useEffect(() => {
    if (isAuthenticated && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  useEffect(() => {
    sessionStorage.setItem(SIGNUP_NAME_DRAFT_KEY, name);
  }, [name]);

  useEffect(() => {
    sessionStorage.setItem(SIGNUP_EMAIL_DRAFT_KEY, emailInput);
  }, [emailInput]);

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
      } catch (err: unknown) {
        if (!cancelled) {
          setInviteInfo(null);
          setInviteError(getErrorMessage(err) || "Invite link is invalid or expired.");
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
      toast.error("Full name is required.");
      return;
    }

    try {
      setLoading(true);
      setSubmitError(null);

      const response = await authAPI.signup({
        name: name.trim(),
        email,
        inviteToken: inviteToken || undefined,
      });

      setLoginEmail(email);
      sessionStorage.removeItem(SIGNUP_NAME_DRAFT_KEY);
      sessionStorage.removeItem(SIGNUP_EMAIL_DRAFT_KEY);
      const expirySeconds = response?.otpExpiresInSeconds ?? 300;
      sessionStorage.setItem("authOtpExpiresAt", String(Date.now() + expirySeconds * 1000));
      toast.success("Verification code sent to your email.");

      const redirect = inviteToken ? `/invite/${encodeURIComponent(inviteToken)}` : "";
      const otpPath = redirect
        ? `/auth/verify-otp?redirect=${encodeURIComponent(redirect)}`
        : "/auth/verify-otp";

      navigate(otpPath);
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setSubmitError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-32 md:mt-40 flex items-center justify-center px-3 sm:px-5 md:px-6 pb-20 w-full overflow-hidden box-border">
      <section
        className="w-full max-w-md backdrop-blur-2xl bg-secondary/45
        perf-auth-surface border border-white/20 rounded-3xl px-6 sm:px-10 py-8 sm:py-10 shadow-2xl relative animate-fade-in-up"
      >
        <div className="absolute -top-10 -left-10 w-40 h-40 bg-[#ad431a]/10 blur-[60px] rounded-full pointer-events-none perf-auth-deco" />

        <h1 className="text-3xl font-bold text-white font-satoshi text-center mb-2 tracking-tight">
          Create Account
        </h1>

        <p className="text-white/60 font-inter text-sm text-center mb-8">
          Sign up to securely access the attendance platform
        </p>

        {inviteInfo && (
          <div className="mb-5 rounded-2xl border border-green-400/20 bg-green-500/5 px-5 py-4">
            <p className="text-green-400 text-sm font-semibold font-inter flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
              Workspace Invite
            </p>
            <p className="text-white/70 text-sm mt-1.5 font-outfit leading-relaxed">
              Joining <strong className="text-white">{inviteInfo.organization.name}</strong> ({inviteInfo.organization.code}).
            </p>
          </div>
        )}

        {inviteError && (
          <div className="mb-5 rounded-2xl border border-red-400/20 bg-red-500/5 px-5 py-4">
            <p className="text-red-400 text-sm font-semibold font-inter">Invalid Invite</p>
            <p className="text-white/70 text-sm mt-1.5 font-outfit">{inviteError}</p>
          </div>
        )}

        {submitError && (
          <div className="mb-5 rounded-2xl border border-red-400/20 bg-red-500/5 px-5 py-4">
            <p className="text-red-400 text-sm font-semibold font-inter">Signup Failed</p>
            <p className="text-white/70 text-sm mt-1.5 font-outfit leading-relaxed">{submitError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5 relative z-10">
          <input
            type="text"
            required
            placeholder="Jane Doe"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (submitError) setSubmitError(null);
            }}
            className="w-full rounded-2xl px-5 py-3.5
              bg-black/30 backdrop-blur-md perf-input-smooth
              border border-white/10
              text-white placeholder-white/30 text-sm sm:text-base font-inter
              outline-none focus:border-white/40 focus:bg-black/50 transition-all duration-300"
          />

          <input
            type="email"
            required
            placeholder="name@example.com"
            value={emailInput}
            onChange={(e) => {
              setEmailInput(e.target.value);
              if (submitError) setSubmitError(null);
            }}
            className="w-full rounded-2xl px-5 py-3.5
              bg-black/30 backdrop-blur-md perf-input-smooth
              border border-white/10
              text-white placeholder-white/30 text-sm sm:text-base font-geist-mono leading-6 tracking-normal [font-variant-ligatures:none]
              outline-none focus:border-white/40 focus:bg-black/50 transition-all duration-300"
          />

          <button
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
                Submitting...
              </>
            ) : "Create Account"}
          </button>
        </form>

        <div className="mt-8 text-center border-t border-white/5 pt-6">
          <Link
            to={(() => {
              const redirect = searchParams.get("redirect") || "";
              return redirect
                ? `/auth/login?redirect=${encodeURIComponent(redirect)}`
                : "/auth/login";
            })()}
            className="text-sm font-inter text-white/50 hover:text-white transition-colors flex items-center justify-center gap-2"
          >
            Back to Login
          </Link>
        </div>
      </section>
    </div>
  );
};

export default Signup;

