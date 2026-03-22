import { Activity, AlertCircle, ShieldAlert } from "lucide-react";

const ActionItem: React.FC<{
  item: { id: string; title: string; priority: "high" | "medium" | "low" };
}> = ({ item }) => {
  const styles = {
    high: {
      bg: "bg-red-500/10 border-red-500/20",
      icon: <ShieldAlert className="w-4 h-4 text-red-400" />,
      badge: "bg-red-500/20 text-red-400",
    },
    medium: {
      bg: "bg-amber-500/10 border-amber-500/20",
      icon: <AlertCircle className="w-4 h-4 text-amber-400" />,
      badge: "bg-amber-500/20 text-amber-400",
    },
    low: {
      bg: "bg-blue-500/10 border-blue-500/20",
      icon: <Activity className="w-4 h-4 text-blue-400" />,
      badge: "bg-blue-500/20 text-blue-400",
    },
  };

  const s = styles[item.priority];

  return (
    <div className={`border rounded-xl p-3.5 flex items-center justify-between gap-3 transition-all hover:scale-[1.01] ${s.bg}`}>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {s.icon}
        <span className="text-sm font-medium text-white/80 truncate">{item.title}</span>
      </div>
      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${s.badge}`}>
        {item.priority}
      </span>
    </div>
  );
};

export default ActionItem;
