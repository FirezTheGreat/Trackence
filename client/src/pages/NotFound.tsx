import { Link } from "react-router-dom";
import { useAuthStore } from "../stores/auth.store";
import { APP_NAME } from "../config/app";

export default function NotFound() {
  const { isAuthenticated } = useAuthStore();

  return (
    <div className="min-h-[calc(100vh-6rem)] flex items-center justify-center px-6">
      <div className="text-center max-w-lg">
        {/* Glitch-style 404 */}
        <div className="relative mb-6">
          <h1 className="text-[120px] sm:text-[160px] font-black text-white/5 font-satoshi leading-none select-none">
            404
          </h1>
          <h2 className="absolute inset-0 flex items-center justify-center text-6xl sm:text-7xl font-black text-white font-satoshi tracking-tight">
            4
            <span className="text-accent">0</span>
            4
          </h2>
        </div>

        {/* Message */}
        <p className="text-xl text-white font-semibold mb-2 font-satoshi">
          Page Not Found
        </p>
        <p className="text-white/50 text-sm leading-relaxed mb-8 max-w-md mx-auto font-outfit">
          The page you're looking for doesn't exist or has been moved.
          Check the URL or navigate back to a known page.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to={isAuthenticated ? "/dashboard" : "/"}
            className="inline-flex items-center justify-center px-6 py-3 bg-accent hover:bg-accent/80 text-white font-semibold rounded-xl transition-all duration-200 cursor-pointer text-sm"
          >
            {isAuthenticated ? "Go to Dashboard" : "Go Home"}
          </Link>
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center justify-center px-6 py-3 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl transition-all duration-200 cursor-pointer text-sm"
          >
            Go Back
          </button>
        </div>

        {/* Decorative line */}
        <div className="mt-12 flex items-center justify-center gap-3">
          <div className="h-px w-12 bg-white/20" />
          <span className="text-white/20 text-xs font-geist-mono">{APP_NAME.toUpperCase()}</span>
          <div className="h-px w-12 bg-white/20" />
        </div>
      </div>
    </div>
  );
}
