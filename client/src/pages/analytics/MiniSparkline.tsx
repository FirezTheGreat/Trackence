const MiniSparkline: React.FC<{
  data: Array<{ value: number }>;
  color: string;
  height?: number;
  id: string;
}> = ({ data, color, height = 32, id }) => {
  if (!data || data.length === 0) return null;

  const safeData = data.map((d) => ({
    value: Number.isFinite(d.value) ? d.value : 0,
  }));

  const max = Math.max(...safeData.map((d) => d.value), 1);
  const width = 80;
  const denominator = Math.max(safeData.length - 1, 1);
  const points = safeData.map((d, i) => ({
    x: (i / denominator) * width,
    y: height - (d.value / max) * (height - 4) - 2,
  }));
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaD = `${pathD} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg width={width} height={height} className="opacity-60">
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.4} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#spark-${id})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
};

export default MiniSparkline;
