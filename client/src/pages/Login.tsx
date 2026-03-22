import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuthStore } from "../stores/auth.store";
import { authAPI } from "../services/auth.service";

const Login = () => {
  const [emailInput, setEmailInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setLoginEmail = useAuthStore((state) => state.setLoginEmail);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const email = emailInput.trim().toLowerCase();

    try {
      setLoading(true);
      setError(null);

      await authAPI.login(email);

      // ✅ Save email globally for OTP step
      setLoginEmail(email);

      // ✅ Navigate to OTP page (preserve redirect target if any)
      const redirect = searchParams.get("redirect") || "";
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
    <div className="mt-32 md:mt-48 flex items-center justify-center px-4 sm:px-6 pb-20 w-full overflow-hidden box-border">
      <motion.section 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-md backdrop-blur-2xl bg-secondary/45
        border border-white/20 rounded-3xl px-6 sm:px-10 py-8 sm:py-10 shadow-2xl relative"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#ad431a]/10 blur-[60px] rounded-full pointer-events-none" />

        <h1 className="text-3xl font-bold text-white font-satoshi tracking-tight text-center mb-3">
          Welcome Back
        </h1>

        <p className="text-white/60 text-center font-inter mb-8 text-sm">
          Enter your organization email to continue
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5 relative z-10">
          <div className="group">
            <input
              type="email"
              required
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="name@organization.com"
              className="w-full rounded-2xl px-5 py-3.5
                bg-black/30 backdrop-blur-md
                border border-white/10
                text-white placeholder-white/30 font-inter
                outline-none focus:border-white/40 focus:bg-black/50 transition-all duration-300"
            />
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
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
      </motion.section>
    </div>
  );
};

export default Login;
