import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../stores/auth.store";
import { authAPI } from "../services/auth.service";
import { APIError } from "../services/api";
import { toast } from "../stores/toast.store";
import { APP_NAME } from "../config/app";
import useAppSeo from "../hooks/useAppSeo";

const LOGIN_EMAIL_DRAFT_KEY = "authLoginDraftEmail";

const Login = () => {
  const [emailInput, setEmailInput] = useState(() => String(sessionStorage.getItem(LOGIN_EMAIL_DRAFT_KEY) || ""));
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setLoginEmail = useAuthStore((state) => state.setLoginEmail);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);

  useAppSeo({
    title: `Login | ${APP_NAME}`,
    description: `Sign in to ${APP_NAME} to access attendance sessions, analytics, and organization dashboards.`,
    path: "/auth/login",
  });

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof APIError) {
      const normalized = String(error.message || "").trim();
      if (!normalized) {
        return "Request failed. Please try again.";
      }

      if (error.status === 422) {
        return `${normalized} Please use another email address or contact support for recovery.`;
      }

      return normalized;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return "Network error. Please try again.";
  };

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  useEffect(() => {
    sessionStorage.setItem(LOGIN_EMAIL_DRAFT_KEY, emailInput);
  }, [emailInput]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const email = emailInput.trim().toLowerCase();

    try {
      setLoading(true);
      setSubmitError(null);

      const response = await authAPI.login(email);

      // Save email globally for OTP step
      setLoginEmail(email);
      sessionStorage.removeItem(LOGIN_EMAIL_DRAFT_KEY);
      const expirySeconds = response?.otpExpiresInSeconds ?? 300;
      sessionStorage.setItem("authOtpExpiresAt", String(Date.now() + expirySeconds * 1000));
      toast.success("Verification code sent to your email.");

      const redirect = searchParams.get("redirect") || "";
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
    <div className="mt-32 md:mt-48 flex items-center justify-center px-4 sm:px-6 pb-20 w-full overflow-hidden box-border">
      <section
        className="w-full max-w-md backdrop-blur-2xl bg-secondary/45
        perf-auth-surface border border-white/20 rounded-3xl px-6 sm:px-10 py-8 sm:py-10 shadow-2xl relative animate-fade-in-up"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#ad431a]/10 blur-[60px] rounded-full pointer-events-none perf-auth-deco" />

        <h1 className="text-3xl font-bold text-white font-satoshi tracking-tight text-center mb-3">
          Welcome Back
        </h1>

        <p className="text-white/60 text-center font-inter mb-8 text-sm">
          Enter your email to continue
        </p>

        {submitError && (
          <div className="mb-5 rounded-2xl border border-red-400/20 bg-red-500/5 px-5 py-4">
            <p className="text-red-400 text-sm font-semibold font-inter">Login Failed</p>
            <p className="text-white/70 text-sm mt-1.5 font-outfit leading-relaxed">{submitError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5 relative z-10">
          <div className="group">
            <input
              type="email"
              required
              value={emailInput}
              onChange={(e) => {
                setEmailInput(e.target.value);
                if (submitError) setSubmitError(null);
              }}
              placeholder="name@company.com"
              className="w-full rounded-2xl px-5 py-3.5
                bg-black/30 backdrop-blur-md perf-input-smooth
                border border-white/10
                text-white placeholder-white/30 text-sm sm:text-base font-inter
                outline-none focus:border-white/40 focus:bg-black/50 transition-all duration-300"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-5 py-3.5 rounded-2xl
              bg-white
              text-black font-semibold font-inter tracking-wide text-md
              hover:bg-gray-100 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_25px_rgba(255,255,255,0.2)] disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer flex justify-center items-center gap-2"
          >
            {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                  Sending OTP...
                </>
            ) : "Continue with Email"}
          </button>
        </form>

        

        <div className="mt-8 text-center border-t border-white/5 pt-6">
          <Link
            to={(() => {
              const redirect = searchParams.get("redirect") || "";
              return redirect
                ? `/auth/signup?redirect=${encodeURIComponent(redirect)}`
                : "/auth/signup";
            })()}
            className="text-sm font-inter text-white/50 hover:text-white transition-colors"
          >
            Don't have an account? <span className="text-white hover:underline underline-offset-4">Sign up here</span>
          </Link>
        </div>
      </section>
    </div>
  );
};

export default Login;
