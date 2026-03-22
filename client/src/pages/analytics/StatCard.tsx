import type { ReactNode } from "react";
import AnimatedCounter from "./AnimatedCounter";
import MiniSparkline from "./MiniSparkline";

interface StatCardProps {
  title: string;
  value: number;
  suffix?: string;
  change?: number;
  icon: ReactNode;
  iconBg: string;
  sparkData?: Array<{ value: number }>;
  sparkColor?: string;
  sparkId?: string;
  loading?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  suffix = "",
  change,
  icon,
  iconBg,
  sparkData,
  sparkColor = "#3B82F6",
  sparkId = "default",
  loading,
}) => {
  const safeChange = Number.isFinite(change) ? Number(change) : undefined;

  return (
    <div className="relative overflow-hidden rounded-2xl backdrop-blur-2xl bg-secondary/45 border border-white/20 p-5 transition-all duration-300 hover:border-white/30 hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5">
      <div className="absolute top-0 right-0 w-32 h-32 opacity-[0.03]">
        <svg viewBox="0 0 100 100" fill="currentColor" className="text-white">
          <circle cx="80" cy="20" r="40" />
        </svg>
      </div>

      <div className="relative flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <div className={`p-2 rounded-xl ${iconBg}`}>{icon}</div>
            <p className="text-xs font-medium text-white/50 uppercase tracking-wider">{title}</p>
          </div>
          <div className="flex items-end gap-3 mt-3">
            {loading ? (
              <div className="h-9 w-20 bg-white/10 rounded-lg animate-pulse" />
            ) : (
              <p className="text-3xl font-bold text-white font-geist-sans tabular-nums">
                <AnimatedCounter value={value} suffix={suffix} />
              </p>
            )}
            {safeChange !== undefined && !loading && (
              <div className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold ${safeChange >= 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                {safeChange >= 0 ? "↗" : "↘"}
                {Math.abs(safeChange)}%
              </div>
            )}
          </div>
        </div>
        {sparkData && sparkData.length > 0 && (
          <div className="mt-auto pt-2">
            <MiniSparkline data={sparkData} color={sparkColor} id={sparkId} />
          </div>
        )}
      </div>
    </div>
  );
};

export default StatCard;
