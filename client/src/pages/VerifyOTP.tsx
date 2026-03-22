import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CircleArrowRightIcon } from "lucide-react";
import { APIError } from "../services/api";
import { useAuthStore } from "../stores/auth.store";
import { authAPI } from "../services/auth.service";

const VerifyOTP = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const setUser = useAuthStore((state) => state.setUser);
  const email = useAuthStore((state) => state.loginEmail);
  const redirectParam = searchParams.get("redirect") || "";
  const safeRedirect = redirectParam.startsWith("/") ? redirectParam : "";

  useEffect(() => {
    if (!email) {
      const loginPath = safeRedirect
        ? `/auth/login?redirect=${encodeURIComponent(safeRedirect)}`
        : "/auth/login";
      navigate(loginPath, { replace: true });
    }
  }, [email, navigate, safeRedirect]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (loading || !email) return;

      try {
        setLoading(true);
        setError(null);
        setInfoMessage(null);

        const responseObj = await authAPI.verifyOTP(email, otp);
        const result = responseObj.user ? responseObj.user : responseObj as any;

        setUser({
          userId: result.userId,
          role: result.role,
          adminStatus: result.adminStatus,
          email: result.email,
          name: result.name,
          organizationIds: result.organizationIds || [],
          requestedOrganizationIds: result.requestedOrganizationIds || [],
          orgAdmins: result.orgAdmins || [],
          currentOrganizationId: result.currentOrganizationId || null,
          platformRole: result.platformRole || "user",
          notificationDefaults: result.notificationDefaults || {
            recipients: [],
            includeSelf: true,
            sendSessionEndEmail: true,
            sendAbsenceEmail: true,
            attachReport: true,
          },
        });

        if (safeRedirect) {
          navigate(safeRedirect, { replace: true });
        } else {
          navigate("/dashboard", { replace: true });
        }
      } catch (err: any) {
        if (err instanceof APIError) {
          setError(err.message || "OTP verification failed.");
          return;
        }
        setError(err?.message || "Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [loading, otp, email, navigate, setUser, safeRedirect]
  );

  const handleResendOtp = useCallback(async () => {
    if (!email || resending || resendCooldown > 0) return;

    try {
      setResending(true);
      setError(null);
      setInfoMessage(null);
      await authAPI.resendOTP(email);
      setInfoMessage("A new verification code has been sent.");
      setResendCooldown(30);
    } catch (err: any) {
      if (err instanceof APIError) {
        setError(err.message || "Failed to resend OTP.");
        return;
      }
      setError(err?.message || "Network error. Please try again.");
    } finally {
      setResending(false);
    }
  }, [email, resending, resendCooldown]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6);

    setOtp(value);
  };

  if (!email) return null;

  return (
    <div className="pt-32 md:pt-60 flex items-center justify-center px-4 sm:px-8 animate-fade-in-up w-full box-border pb-20">
      <section
        className="w-full max-w-md backdrop-blur-2xl bg-secondary/45
        border border-white/20 rounded-2xl px-6 sm:px-10 py-8 sm:py-10 shadow-lg shadow-black/10 box-border"
      >
        <h1 className="text-3xl font-semibold text-white font-satoshi text-center mb-2">
          Verify Email
        </h1>

        <p className="text-white/70 font-outfit text-center mb-6">
          A verification code has been sent to
        </p>

        <p className="text-white font-semibold text-center mb-8 break-all">
          {email}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col items-center gap-4 w-full">
          <div className="flex items-center w-full max-w-75">
            <input
              ref={inputRef}
              type="text"
              required
              minLength={6}
              maxLength={6}
              value={otp}
              onChange={handleInputChange}
              placeholder="ENTER CODE"
              pattern="[A-Z0-9]{6}"
              disabled={loading}
              className="flex-1 w-full min-w-0 px-4 py-3 rounded-xl
                bg-secondary/45 backdrop-blur-md
                border border-white/20
                text-white text-lg text-center tracking-widest
                placeholder-white/40 outline-none
                focus:border-[#ad431a]"
            />

            <button
              type="submit"
              disabled={loading}
              className="ml-3 px-4 py-3 rounded-xl
                backdrop-blur-md bg-secondary/45
                border border-white/20
                text-white hover:text-[#ad431a]
                transition shadow-md cursor-pointer"
            >
              <CircleArrowRightIcon className="h-6 w-6" />
            </button>
          </div>

          {error && (
            <p className="text-red-400 text-sm mt-2 text-center">
              {error}
            </p>
          )}

          {infoMessage && (
            <p className="text-emerald-400 text-sm mt-2 text-center">
              {infoMessage}
            </p>
          )}

          {loading && (
            <p className="text-white/60 text-sm mt-2">
              Verifying...
            </p>
          )}

          <button
            type="button"
            onClick={handleResendOtp}
            disabled={loading || resending || resendCooldown > 0}
            className="text-sm text-white/70 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resending
              ? "Resending..."
              : resendCooldown > 0
              ? `Resend in ${resendCooldown}s`
              : "Resend OTP"}
          </button>
        </form>
      </section>
    </div>
  );
};

export default VerifyOTP;
