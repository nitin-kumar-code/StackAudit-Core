import { motion } from "framer-motion";
import { Recommendation } from "@/services/engine/types";
import { formatCurrency } from "@/services/engine/utils/savings-math";
import { AlertCircle, ArrowRight, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

function ConfidenceRing({ score }: { score: number }) {
  const color = score >= 90 ? "text-green-500" : score >= 75 ? "text-amber-500" : "text-blue-500";
  const bgRing = "text-zinc-200 dark:text-zinc-800";
  
  return (
    <div className="relative size-12 flex items-center justify-center shrink-0">
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
        <path
          className={bgRing}
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
        <motion.path
          className={color}
          initial={{ strokeDasharray: "0, 100" }}
          animate={{ strokeDasharray: `${score}, 100` }}
          transition={{ duration: 1, delay: 0.5 }}
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
      </svg>
      <span className="absolute text-[10px] font-bold">{score}%</span>
    </div>
  );
}

const actionMap = {
  CANCEL: { label: "Revoke Seats", icon: AlertCircle, color: "text-red-500" },
  DOWNGRADE: { label: "Downgrade Tier", icon: ArrowRight, color: "text-amber-500" },
  SWITCH: { label: "Migrate Tool", icon: Zap, color: "text-blue-500" },
  ANNUAL_COMMIT: { label: "Commit Annually", icon: Zap, color: "text-green-500" },
};

export function RecommendationCard({ rec, index }: { rec: Recommendation; index: number }) {
  const action = actionMap[rec.type];
  const Icon = action.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      className="p-6 rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 shadow-sm flex flex-col sm:flex-row gap-6"
    >
      <div className="flex flex-col items-center justify-start gap-2 border-r border-zinc-100 dark:border-zinc-800 pr-6 shrink-0">
        <span className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Confidence</span>
        <ConfidenceRing score={rec.confidenceScore} />
      </div>
      
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-3">
          <div className={`flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider ${action.color}`}>
            <Icon className="size-4" />
            {rec.type.replace('_', ' ')}
          </div>
          <span className="text-zinc-300 dark:text-zinc-700">•</span>
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            {rec.affectedSeats} affected seats
          </span>
        </div>
        
        <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed mb-6">
          {rec.financeReasoning}
        </p>

        <div className="flex items-center justify-between pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
          <div>
            <div className="text-2xl font-bold text-zinc-900 dark:text-white">
              {formatCurrency(rec.annualSavings)} <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">/ yr savings</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="hidden sm:flex text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
              Dismiss
            </Button>
            <Button size="sm" className="rounded-full shadow-sm">
              {action.label}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
