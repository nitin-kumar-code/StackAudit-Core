import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { EngineResult } from "@/services/engine/types";
import { formatCurrency } from "@/services/engine/utils/savings-math";

function AnimatedCounter({ value }: { value: number }) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => formatCurrency(Math.round(latest)));

  useEffect(() => {
    const animation = animate(count, value, {
      duration: 2,
      ease: "easeOut",
    });
    return animation.stop;
  }, [value, count]);

  return <motion.span>{rounded}</motion.span>;
}

export function SavingsOverview({ result }: { result: EngineResult }) {
  const chartData = [
    {
      name: "Current Run-Rate",
      spend: result.currentAnnualSpend,
      color: "#f4f4f5", // zinc-100 (will override in dark mode via CSS or use static)
    },
    {
      name: "Optimized Run-Rate",
      spend: result.optimizedAnnualSpend,
      color: "#22c55e", // green-500
    },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
      <div className="flex flex-col justify-center p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest mb-2">Total Identified Waste</h2>
        <div className="text-6xl font-extrabold text-zinc-900 dark:text-white mb-4 tracking-tight">
          <AnimatedCounter value={result.totalAnnualSavings} />
          <span className="text-xl font-medium text-zinc-500 ml-2">/ year</span>
        </div>
        <div className="text-xl text-green-600 dark:text-green-500 font-medium flex items-center gap-2">
          <span className="inline-block size-2 rounded-full bg-green-500 animate-pulse" />
          <AnimatedCounter value={result.totalMonthlySavings} /> / month
        </div>
      </div>

      <div className="p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black h-80">
        <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest mb-6">Annual Run-Rate Comparison</h3>
        <ResponsiveContainer width="100%" height="80%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
            <XAxis type="number" hide />
            <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} className="text-xs font-medium dark:fill-zinc-400" width={140} />
            <Tooltip
              cursor={{ fill: 'transparent' }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-zinc-950 text-white p-3 rounded-lg text-sm font-medium shadow-xl">
                      {formatCurrency(payload[0].value as number)}
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="spend" radius={[0, 4, 4, 0]} barSize={32}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
