import Link from "next/link";
import { Button } from "@/components/ui/button";

export function CtaSection() {
  return (
    <section className="py-24 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,rgba(56,189,248,0.1),rgba(255,255,255,0))] dark:bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,rgba(56,189,248,0.15),rgba(255,255,255,0))]" />
      
      <div className="container mx-auto px-4 text-center max-w-3xl">
        <h2 className="text-4xl font-bold tracking-tight mb-6">Ready to stop burning cash?</h2>
        <p className="text-xl text-zinc-600 dark:text-zinc-400 mb-10">
          Join engineering leaders who use StackAudit to optimize their AI tool stack and reclaim their budget.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/dashboard">
            <Button size="lg" className="h-14 px-10 rounded-full text-lg w-full sm:w-auto">
             Run Free AI Spend Audit
            </Button>
          </Link>
        </div>
        <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-500">
          No credit card required. Setup takes 5 minutes.
        </p>
      </div>
    </section>
  );
}
