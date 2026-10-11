"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { useToast } from "@/src/components/ui/toast";

/**
 * Share control that uses the platform share sheet when available and falls
 * back to copying the link. Always performs a real action so no advertised
 * button is a dead end.
 */
export function ShareButton({
  title,
  url,
}: {
  title: string;
  url?: string;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  async function onShare() {
    const target = url ?? (typeof window !== "undefined" ? window.location.href : "");

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url: target });
        return;
      } catch {
        // User dismissed the sheet, or the API was blocked; fall through to copy.
      }
    }

    try {
      await navigator.clipboard.writeText(target);
      setCopied(true);
      toast({ title: "Link copied to clipboard", tone: "success" });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Could not share this link", tone: "error" });
    }
  }

  return (
    <Button variant="ghost" type="button" onClick={onShare}>
      {copied ? (
        <Check className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Share2 className="h-4 w-4" aria-hidden="true" />
      )}
      {copied ? "Copied" : "Share"}
    </Button>
  );
}