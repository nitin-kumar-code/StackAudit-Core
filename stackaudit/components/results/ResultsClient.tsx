"use client";

import { useEffect, useState } from "react";
import { AuditEngine } from "@/services/engine/AuditEngine";
import { EngineResult, SubscriptionData, SeatUsage } from "@/services/engine/types";
import { OptimizedEmptyState } from "./OptimizedEmptyState";
import { RecommendationCard } from "./RecommendationCard";
import { SavingsOverview } from "./SavingsOverview";
import { DashboardSkeleton } from "./DashboardSkeleton";
import { AlertCircle, FileWarning, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import Link from "next/link";

export function ResultsClient({ reportId }: { reportId?: string }) {
  const [result, setResult] = useState<EngineResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAndRunAudit = () => {
    setIsLoading(true);
    setError(null);
    // In a real app, we would fetch data from a DB or parse localStorage.
    // For this premium UI demonstration, we inject the realistic mock dataset
    // that triggers multiple complex rules (Enterprise downgrade, API arbitrage, etc).
    
    const engine = new AuditEngine();

    const mockSubscriptions: SubscriptionData[] = [
      { id: 'sub-001', toolId: 'github-copilot', tierId: 'copilot-enterprise-monthly', seats: 20, billingCycle: 'monthly', costPerSeat: 39 },
      { id: 'sub-002', toolId: 'cursor', tierId: 'cursor-pro-monthly', seats: 10, billingCycle: 'monthly', costPerSeat: 20 },
      { id: 'sub-003', toolId: 'chatgpt', tierId: 'chatgpt-team-monthly', seats: 10, billingCycle: 'monthly', costPerSeat: 30 },
      { id: 'sub-004', toolId: 'claude', tierId: 'claude-pro', seats: 20, billingCycle: 'monthly', costPerSeat: 20 }
    ];

    const mockUsage: SeatUsage[] = [
      // Copilot: 20 active seats, but 15 use very few tokens (no PR/Enterprise features)
      ...Array(15).fill(0).map((_, i) => ({ seatId: `cp-${i}`, subscriptionId: 'sub-001', lastActiveDaysAgo: 2, tokensUsedMonthly: 2000 })),
      ...Array(5).fill(0).map((_, i) => ({ seatId: `cp-${i+15}`, subscriptionId: 'sub-001', lastActiveDaysAgo: 1, tokensUsedMonthly: 60000 })),
      // Cursor: 10 highly active users
      ...Array(10).fill(0).map((_, i) => ({ seatId: `cr-${i}`, subscriptionId: 'sub-002', lastActiveDaysAgo: 1 })),
      // ChatGPT: 2 active, 8 inactive (>30 days)
      ...Array(2).fill(0).map((_, i) => ({ seatId: `cg-${i}`, subscriptionId: 'sub-003', lastActiveDaysAgo: 1 })),
      ...Array(8).fill(0).map((_, i) => ({ seatId: `cg-${i+2}`, subscriptionId: 'sub-003', lastActiveDaysAgo: 45 })),
      // Claude: 5 heavy users, 15 light users (< 100k tokens)
      ...Array(5).fill(0).map((_, i) => ({ seatId: `cl-${i}`, subscriptionId: 'sub-004', lastActiveDaysAgo: 3, tokensUsedMonthly: 500000 })),
      ...Array(15).fill(0).map((_, i) => ({ seatId: `cl-${i+5}`, subscriptionId: 'sub-004', lastActiveDaysAgo: 10, tokensUsedMonthly: 25000 }))
    ];

    setTimeout(() => {
      try {
        // Here we simulate checking if the report is valid.
        if (reportId && reportId !== 'demo' && reportId.length < 5) {
          throw new Error("INVALID_REPORT");
        }

        const auditResult = engine.runAudit(mockSubscriptions, mockUsage);
        setResult(auditResult);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Unknown error"));
      } finally {
        setIsLoading(false);
      }
    }, 1500);
  };

  useEffect(() => {
    fetchAndRunAudit();
  }, [reportId]);

  if (error) {
    if (error.message === "INVALID_REPORT") {
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4 text-center">
          <FileWarning className="size-16 text-amber-500 mb-2" />
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Invalid Report ID</h2>
          <p className="text-zinc-600 dark:text-zinc-400 max-w-md">
            We couldn't find an audit report matching this ID. It may have expired or been deleted for privacy reasons.
          </p>
          <Button asChild className="mt-4">
            <Link href="/audit">Start New Audit</Link>
          </Button>
        </div>
      );
    }

    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4 text-center">
        <AlertCircle className="size-16 text-red-500 mb-2" />
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Something went wrong</h2>
        <p className="text-zinc-600 dark:text-zinc-400 max-w-md">
          Our engine encountered an error while processing your data. 
        </p>
        <Button onClick={fetchAndRunAudit} variant="outline" className="mt-4">
          <RefreshCcw className="size-4 mr-2" /> Try Again
        </Button>
      </div>
    );
  }

  if (isLoading || !result) {
    return <DashboardSkeleton />;
  }

  if (result.totalAnnualSavings === 0) {
    return <OptimizedEmptyState />;
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full max-w-5xl mx-auto"
    >
      <SavingsOverview result={result} />
      
      <div className="space-y-6">
        <h3 className="text-2xl font-bold tracking-tight mb-8 border-b border-zinc-200 dark:border-zinc-800 pb-4">
          Optimization Opportunities
        </h3>
        {result.recommendations.map((rec, index) => (
          <RecommendationCard key={rec.id} rec={rec} index={index} />
        ))}
      </div>
    </motion.div>
  );
}
