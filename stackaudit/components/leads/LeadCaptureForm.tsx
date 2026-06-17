"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

const formSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  company_name: z.string().optional(),
  website_url: z.string().optional(), // Honeypot field
});

type FormValues = z.infer<typeof formSchema>;

export function LeadCaptureForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      company_name: "",
      website_url: "",
    },
  });

  const onSubmit = async (data: FormValues) => {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error("Failed to subscribe");
      }

      toast.success("Successfully subscribed!");
      setIsSuccess(true);
    } catch (error) {
      toast.error("Failed to subscribe. Please try again later.");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md mx-auto mt-12 p-8 bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-center"
      >
        <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">
          You're on the list!
        </h3>
        <p className="text-zinc-600 dark:text-zinc-400">
          We'll keep you updated with the latest AI optimization strategies.
        </p>
      </motion.div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto mt-16 mb-8 p-6 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
      <div className="text-center mb-6">
        <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
          <Mail className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h3 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">
          Get Optimization Insights
        </h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Enter your email to receive weekly tips on reducing your AI spend.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 text-left">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            Email address <span className="text-red-500">*</span>
          </label>
          <input
            id="email"
            type="email"
            {...register("email")}
            placeholder="you@company.com"
            className="flex h-10 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-900 dark:text-white"
          />
          {errors.email && (
            <p className="mt-1 text-sm text-red-500">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="company_name" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            Company (optional)
          </label>
          <input
            id="company_name"
            type="text"
            {...register("company_name")}
            placeholder="Acme Inc."
            className="flex h-10 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-900 dark:text-white"
          />
        </div>

        {/* Honeypot field - Bots will fill this out, humans won't see it */}
        <div aria-hidden="true" className="opacity-0 absolute -z-10 w-0 h-0 pointer-events-none">
          <label htmlFor="website_url">Website URL (leave blank if human)</label>
          <input
            id="website_url"
            type="text"
            {...register("website_url")}
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        <Button 
          type="submit" 
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Subscribing...
            </>
          ) : (
            "Subscribe Now"
          )}
        </Button>
      </form>
    </div>
  );
}
