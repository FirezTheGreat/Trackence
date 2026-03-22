const CustomTooltip: React.FC<{
  active?: boolean;
  payload?: any[];
  label?: string;
  valueLabel?: string;
}> = ({ active, payload, label, valueLabel = "Value" }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a1a2e] border border-white/15 rounded-xl px-4 py-3 shadow-xl shadow-black/30">
      <p className="text-xs text-white/50 mb-1">{label}</p>
      <p className="text-sm font-semibold text-white">
        {valueLabel}: <span className="text-blue-400">{payload[0].value}</span>
      </p>
    </div>
  );
};

export default CustomTooltip;
