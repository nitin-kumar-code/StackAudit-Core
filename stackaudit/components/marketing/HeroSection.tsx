"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-24 pb-32 lg:pt-36 lg:pb-40">
      {/* Background glow effects */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.3),rgba(255,255,255,0))] dark:bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(56,189,248,0.15),rgba(255,255,255,0))]" />
      
      <div className="container mx-auto px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm text-zinc-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400 mb-8"
        >
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-blue-500 animate-pulse" />
            Introducing Automatic Seat Discovery
          </span>
          <ChevronRight className="ml-1 size-4" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mx-auto max-w-4xl text-5xl font-bold tracking-tight sm:text-7xl mb-8"
        >
          Stop wasting money on <br className="hidden sm:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-violet-500 dark:from-blue-400 dark:to-violet-400">
            unused AI tools.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mx-auto max-w-2xl text-lg text-zinc-600 dark:text-zinc-400 mb-10 leading-relaxed"
        >
          Connect your identity provider in minutes. StackAudit automatically maps your organization's AI subscriptions, tracks actual usage, and reclaims inactive licenses without slowing down engineering.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Button size="lg" className="h-12 px-8 rounded-full text-base w-full sm:w-auto">
            <Link href="/dashboard">Start Auditing Free</Link>
          </Button>
          <Button  size="lg" variant="outline" className="h-12 px-8 rounded-full text-base w-full sm:w-auto dark:border-zinc-800 dark:bg-black dark:hover:bg-zinc-900">
            <Link href="#demo">Book a Demo</Link>
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
