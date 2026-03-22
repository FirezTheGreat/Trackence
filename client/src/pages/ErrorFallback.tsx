type ErrorFallbackProps = {
  error: Error;
  retry: () => void;
};

export default function ErrorFallback({ error, retry }: ErrorFallbackProps) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center max-w-lg backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl px-8 py-8 shadow-lg shadow-black/10">
        <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
        <p className="text-white/60 text-sm mb-6">
          An unexpected error occurred. You can retry this page or return to dashboard.
        </p>
        <p className="text-white/40 text-xs mb-6 wrap-break-word">{error?.message || "Unknown error"}</p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={retry}
            className="inline-flex items-center justify-center px-6 py-3 bg-secondary/70 hover:bg-secondary/90 text-white border border-white/20 rounded-xl transition-all duration-200 cursor-pointer text-sm"
          >
            Retry
          </button>
          <button
            onClick={() => window.location.assign("/dashboard")}
            className="inline-flex items-center justify-center px-6 py-3 bg-accent hover:bg-accent/80 text-white font-semibold rounded-xl transition-all duration-200 cursor-pointer text-sm"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
