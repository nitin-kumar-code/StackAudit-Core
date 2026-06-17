"use client";

import { useState, useEffect } from "react";
import { EngineResult } from "@/services/engine/types";
import { formatCurrency } from "@/services/engine/utils/savings-math";
import { Sparkles, RefreshCcw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export function PersonalizedSummary({ result }: { result: EngineResult }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const generateSummary = async () => {
    setIsLoading(true);
    setIsError(false);
    
    try {
      const response = await fetch("/api/summary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ result }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch AI summary");
      }

      const data = await response.json();
      setSummary(data.summary);
    } catch (error) {
      console.error(error);
      setIsError(true);
      // Fallback deterministic summary
      setSummary(
        `We identified ${formatCurrency(result.totalAnnualSavings)} in potential annual savings across your software stack. By implementing ${result.recommendations.length} distinct optimization strategies, you can reduce your run-rate to ${formatCurrency(result.optimizedAnnualSpend)} without impacting engineering productivity.`
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    generateSummary();
  }, [result]);

  return (
    <div className="mb-8 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 bg-indigo-50/50 dark:bg-indigo-950/20 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-10">
        <Sparkles className="w-24 h-24 text-indigo-600 dark:text-indigo-400" />
      </div>
      
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-300">
              Executive Summary
            </h3>
          </div>
          {isError && (
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500 text-xs font-medium">
              <AlertTriangle className="w-4 h-4" />
              <span>Standard Summary</span>
              <Button 
                variant="ghost" 
                size="xs" 
                onClick={generateSummary}
                className="ml-1 h-6 px-2 bg-indigo-100 dark:bg-indigo-900/40 hover:bg-indigo-200 dark:hover:bg-indigo-900/60"
              >
                <RefreshCcw className="w-3 h-3 mr-1" /> Retry AI
              </Button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-4 bg-indigo-200/50 dark:bg-indigo-800/30 rounded w-full"></div>
            <div className="h-4 bg-indigo-200/50 dark:bg-indigo-800/30 rounded w-11/12"></div>
            <div className="h-4 bg-indigo-200/50 dark:bg-indigo-800/30 rounded w-4/5"></div>
          </div>
        ) : (
          <motion.p 
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-lg text-indigo-950 dark:text-indigo-100 leading-relaxed font-medium"
          >
            {summary}
          </motion.p>
        )}
      </div>
    </div>
  );
}
