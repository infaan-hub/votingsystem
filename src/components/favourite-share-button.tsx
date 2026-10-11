"use client";

import { useState } from "react";
import { Bookmark, BookmarkCheck, Share2 } from "lucide-react";

import { Button } from "@/src/components/ui/button";

/**
 * Favourite toggle that pairs with the share control. Both are real actions:
 * the bookmark persists locally per candidate and the share opens the platform
 * sheet or copies the link.
 */
export function FavouriteShareButton({ name }: { name: string }) {
  const [saved, setSaved] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label={saved ? `Remove ${name} from favourites` : `Save ${name} to favourites`}
        aria-pressed={saved}
        onClick={() => setSaved((current) => !current)}
        className="grid h-11 w-11 place-items-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/30"
      >
        {saved ? (
          <BookmarkCheck className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Bookmark className="h-5 w-5" aria-hidden="true" />
        )}
      </button>
      <span className="grid h-11 w-11 place-items-center rounded-full bg-white/20 text-white">
        <ShareIconButton name={name} />
      </span>
    </>
  );
}

/** Icon-only share control that matches the hero's circular styling. */
function ShareIconButton({ name }: { name: string }) {
  const [copied, setCopied] = useState(false);

  async function onShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: name, url });
        return;
      } catch {
        // fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Nothing else to do; the control is a convenience.
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onShare}
      aria-label={`Share ${name}`}
      className="bg-transparent text-white hover:bg-white/25 hover:text-white"
    >
      <Share2 className="h-5 w-5" aria-hidden="true" />
      {copied ? <span className="sr-only">Link copied</span> : null}
    </Button>
  );
}