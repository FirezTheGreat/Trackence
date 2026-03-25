import { RadialBarChart, RadialBar } from "recharts";

const HealthGauge: React.FC<{ score: number; loading?: boolean; animate?: boolean }> = ({
  score,
  loading,
  animate = true,
}) => {
  const gaugeColor = score >= 80 ? "#10B981" : score >= 60 ? "#F59E0B" : "#EF4444";
  const data = [{ value: score, fill: gaugeColor }];

  return (
    <div className="flex items-center justify-center">
      {loading ? (
        <div className="w-40 h-40 rounded-full bg-white/5 animate-pulse" />
      ) : (
        <RadialBarChart
          width={180}
          height={180}
          cx={90}
          cy={90}
          innerRadius={60}
          outerRadius={80}
          barSize={12}
          data={data}
          startAngle={210}
          endAngle={-30}
        >
          <RadialBar
            dataKey="value"
            cornerRadius={10}
            background={{ fill: "rgba(255,255,255,0.06)" }}
            isAnimationActive={animate}
            animationDuration={animate ? 450 : 0}
          />
          <text x={90} y={82} textAnchor="middle" dominantBaseline="central">
            <tspan className="fill-white text-3xl font-bold font-geist-sans">{score}</tspan>
          </text>
          <text x={90} y={104} textAnchor="middle" dominantBaseline="central">
            <tspan className="fill-white/40 text-xs">Health Score</tspan>
          </text>
        </RadialBarChart>
      )}
    </div>
  );
};

export default HealthGauge;
