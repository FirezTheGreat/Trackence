import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Clock } from "lucide-react";
import { APIError } from "../services/api";
import { useAuthStore } from "../stores/auth.store";
import { authAPI } from "../services/auth.service";
import { toast } from "../stores/toast.store";

const DEFAULT_OTP_EXPIRY_SECONDS = 300;

const VerifyOTP = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [otp, setOtp] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [timeLeft, setTimeLeft] = useState(DEFAULT_OTP_EXPIRY_SECONDS);
  const [deliverySuppressed, setDeliverySuppressed] = useState(false);

  const setLoginEmail = useAuthStore((state) => state.setLoginEmail);
  const setUser = useAuthStore((state) => state.setUser);
  const email = useAuthStore((state) => state.loginEmail);
  const fallbackEmail = String(sessionStorage.getItem("authLoginEmail") || "").trim().toLowerCase();
  const activeEmail = email || fallbackEmail || null;
  const redirectParam = searchParams.get("redirect") || "";
  const safeRedirect = redirectParam.startsWith("/") ? redirectParam : "";

  useEffect(() => {
    if (!email && fallbackEmail) {
      setLoginEmail(fallbackEmail);
    }
  }, [email, fallbackEmail, setLoginEmail]);

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

  useEffect(() => {
    if (!activeEmail) {
      const loginPath = safeRedirect
        ? `/auth/login?redirect=${encodeURIComponent(safeRedirect)}`
        : "/auth/login";
      navigate(loginPath, { replace: true });
    }
  }, [activeEmail, navigate, safeRedirect]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const expiresAtRaw = sessionStorage.getItem("authOtpExpiresAt");
    const expiresAt = expiresAtRaw ? Number(expiresAtRaw) : NaN;

    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      setTimeLeft(DEFAULT_OTP_EXPIRY_SECONDS);
      return;
    }

    const secondsRemaining = Math.ceil((expiresAt - Date.now()) / 1000);
    setTimeLeft(Math.max(0, secondsRemaining));
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  useEffect(() => {
    if (!activeEmail) return;

    let cancelled = false;

    const syncDeliveryStatus = async () => {
      try {
        const status = await authAPI.getOtpDeliveryStatus(activeEmail);
        if (cancelled) return;

        if (status?.suppressed) {
          setDeliverySuppressed(true);
          setSubmitError(
            "This email address cannot receive OTP emails (delivery bounced). Please go back and use a valid email address."
          );
          return;
        }

        setDeliverySuppressed(false);
      } catch {
        // Keep OTP flow usable even if status polling is temporarily unavailable.
      }
    };

    syncDeliveryStatus();
    const interval = window.setInterval(syncDeliveryStatus, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeEmail]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (loading || !activeEmail || deliverySuppressed) return;

      if (timeLeft === 0) {
        const message = "OTP has expired. Please request a new code.";
        setSubmitError(message);
        toast.error(message);
        return;
      }

      try {
        setLoading(true);
        setSubmitError(null);

        const response = await authAPI.verifyOTP(activeEmail, otp);
        setUser(response.user);
        sessionStorage.removeItem("authOtpExpiresAt");
        toast.success("Logged in successfully.");

        if (safeRedirect) {
          navigate(safeRedirect, { replace: true });
        } else {
          navigate("/dashboard", { replace: true });
        }
      } catch (err: unknown) {
        const message = getErrorMessage(err);
        setSubmitError(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    },
    [loading, activeEmail, deliverySuppressed, timeLeft, otp, setUser, safeRedirect, navigate]
  );

  const handleResendOtp = useCallback(async () => {
    if (!activeEmail || resending || resendCooldown > 0 || deliverySuppressed) return;

    try {
      setResending(true);
      setSubmitError(null);
      const response = await authAPI.resendOTP(activeEmail);
      setDeliverySuppressed(false);
      const expirySeconds = response?.otpExpiresInSeconds ?? DEFAULT_OTP_EXPIRY_SECONDS;
      sessionStorage.setItem("authOtpExpiresAt", String(Date.now() + expirySeconds * 1000));
      setTimeLeft(expirySeconds);
      setResendCooldown(30);
      toast.success("A new verification code has been sent.");
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setSubmitError(message);
      toast.error(message);
    } finally {
      setResending(false);
    }
  }, [activeEmail, resending, resendCooldown, deliverySuppressed]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6);

    if (submitError) setSubmitError(null);
    setOtp(value);
  };

  if (!activeEmail) return null;

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds < 10 ? "0" : ""}${remainingSeconds}`;
  };

  return (
    <div className="pt-32 md:pt-60 flex items-center justify-center px-4 sm:px-8 animate-fade-in-up w-full box-border pb-20">
      <section className="w-full max-w-md backdrop-blur-2xl bg-secondary/45 border border-white/20 rounded-3xl px-6 sm:px-10 py-8 sm:py-10 shadow-2xl relative box-border">
        <h1 className="text-3xl font-bold text-white font-satoshi text-center mb-3 tracking-tight">
          Verify Email
        </h1>

        <p className="text-white/60 font-inter text-sm text-center mb-6">
          A verification code has been sent to
          <br />
          <strong className="text-white/90 break-all">{activeEmail}</strong>
        </p>

        {submitError && (
          <div className="mb-5 rounded-2xl border border-red-400/20 bg-red-500/5 px-5 py-4">
            <p className="text-red-400 text-sm font-semibold font-inter">
              {deliverySuppressed ? "Email Delivery Failed" : "Verification Failed"}
            </p>
            <p className="text-white/70 text-sm mt-1.5 font-outfit leading-relaxed">{submitError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col items-center gap-5 w-full relative z-10">
          <div className="flex items-center w-full">
            <input
              ref={inputRef}
              type="text"
              required
              minLength={6}
              maxLength={6}
              value={otp}
              onChange={handleInputChange}
              placeholder="ENTER 6-DIGIT CODE"
              pattern="[A-Z0-9]{6}"
              disabled={loading || timeLeft === 0 || deliverySuppressed}
              className="flex-1 w-full min-w-0 px-2 sm:px-5 py-4 rounded-2xl bg-black/30 backdrop-blur-md border border-white/10 text-white text-lg sm:text-xl font-semibold text-center tracking-[0.3em] sm:tracking-[0.5em] placeholder-white/30 placeholder:text-sm placeholder:tracking-normal placeholder:font-normal outline-none focus:border-white/40 focus:bg-black/50 transition-all duration-300 uppercase disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={loading || timeLeft === 0 || otp.length < 6 || deliverySuppressed}
            className="w-full px-5 py-3.5 rounded-2xl bg-white text-black font-semibold font-inter tracking-wide text-md hover:bg-gray-100 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_25px_rgba(255,255,255,0.2)] disabled:opacity-60 disabled:cursor-not-allowed flex justify-center items-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                Verifying...
              </>
            ) : (
              "Verify & Continue"
            )}
          </button>

          <div className="mt-4 flex flex-col items-center gap-3 w-full border-t border-white/5 pt-6">
            {timeLeft > 0 ? (
              <div className="flex items-center gap-2 text-white/60 text-sm font-inter bg-white/5 px-4 py-2 rounded-full border border-white/5">
                <Clock className="w-4 h-4" />
                <span>
                  Code expires in <strong className="text-white/90 font-mono tracking-wider">{formatTime(timeLeft)}</strong>
                </span>
              </div>
            ) : (
              <div className="text-red-400 text-sm font-inter bg-red-400/10 px-4 py-2 rounded-full border border-red-400/20">
                Code has expired. Request a new one.
              </div>
            )}

            <button
              type="button"
              onClick={handleResendOtp}
              disabled={loading || resending || resendCooldown > 0 || deliverySuppressed}
              className="text-sm font-inter text-white/50 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:underline underline-offset-4 disabled:no-underline"
            >
              {resending
                ? "Sending..."
                : resendCooldown > 0
                ? `Resend available in ${resendCooldown}s`
                : "Didn't receive code? Resend"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

export default VerifyOTP;
