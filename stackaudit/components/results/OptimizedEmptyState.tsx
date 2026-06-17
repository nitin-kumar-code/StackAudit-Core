import { motion } from "framer-motion";
import { CheckCircle2, TrendingUp } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function OptimizedEmptyState() {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-2xl mx-auto mt-16 p-12 text-center border border-zinc-200 dark:border-zinc-800 rounded-3xl bg-white/50 dark:bg-black/50 backdrop-blur-sm"
    >
      <div className="flex justify-center mb-6">
        <div className="size-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <CheckCircle2 className="size-10 text-green-600 dark:text-green-500" />
        </div>
      </div>
      <h2 className="text-3xl font-bold tracking-tight mb-4">Your Stack is Perfectly Optimized</h2>
      <p className="text-lg text-zinc-600 dark:text-zinc-400 mb-8">
        We didn't detect any unused seats, redundant tools, or overpriced tiers. Your engineering team is operating at peak financial efficiency.
      </p>
      <div className="flex items-center justify-center gap-4">
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "h-12 px-8 rounded-full")}>
          Return Home
        </Link>
        <Link href="/audit" className={cn(buttonVariants(), "h-12 px-8 rounded-full bg-blue-600 hover:bg-blue-700 text-white")}>
          <TrendingUp className="mr-2 size-4" /> Run New Audit
        </Link>
      </div>
    </motion.div>
  );
}
