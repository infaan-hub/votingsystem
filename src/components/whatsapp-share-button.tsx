"use client";

import { MessageCircle } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { phoneDigits } from "@/src/lib/fields";

/**
 * Opens WhatsApp with the election link pre-filled so the sender (the signed-in
 * officer, from their own WhatsApp account) can pick one or many voter chats.
 * When `senderPhone` is known it is shown as the sending number; when a single
 * `recipientPhone` is supplied the chat targets that voter directly.
 */
export function WhatsAppShareButton({
  title,
  url,
  senderPhone,
  recipientPhone,
  label,
  variant = "outline",
  className,
}: {
  title: string;
  url: string;
  senderPhone?: string | null;
  recipientPhone?: string | null;
  label?: string;
  variant?: "primary" | "outline" | "ghost" | "hero";
  className?: string;
}) {
  function onShare() {
    const absolute = url.startsWith("http")
      ? url
      : `${typeof window !== "undefined" ? window.location.origin : ""}${url}`;
    const text = `${title}\n${absolute}`;
    const recipient = recipientPhone ? phoneDigits(recipientPhone) : "";
    const href = recipient
      ? `https://wa.me/${recipient}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(href, "_blank", "noopener,noreferrer");
  }

  const hint = senderPhone
    ? `Sends from WhatsApp ${senderPhone}`
    : "Opens WhatsApp so you can send this link to voters";

  return (
    <Button
      type="button"
      variant={variant ?? "primary"}
      onClick={onShare}
      className={className}
      aria-label={label ?? "Share on WhatsApp"}
      title={hint}
    >
      <MessageCircle className="h-4 w-4" aria-hidden="true" />
      {label ?? "Share on WhatsApp"}
    </Button>
  );
}
