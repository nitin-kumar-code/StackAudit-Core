"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Share2, Check, Copy } from "lucide-react";

export function ShareButton() {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = window.location.href;
    
    // Use Web Share API if available (mobile/modern browsers)
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'AI Spend Audit Report',
          text: 'Check out this AI spend optimization report.',
          url: url,
        });
        return;
      } catch (err) {
        // Fallback to clipboard if share gets aborted or fails
        console.log("Share failed or aborted", err);
      }
    }
    
    // Fallback: Copy to clipboard
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={handleShare}
      className="flex items-center gap-2 rounded-full border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-950/50 backdrop-blur-sm"
    >
      {copied ? (
        <>
          <Check className="size-4 text-green-500" />
          <span>Copied Link</span>
        </>
      ) : (
        <>
          <Share2 className="size-4" />
          <span>Share Report</span>
        </>
      )}
    </Button>
  );
}
