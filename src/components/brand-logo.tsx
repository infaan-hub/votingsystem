import { cn } from "@/src/lib/utils";
import tenant from "@/config/tenant";

/**
 * The real NexVote logo (`public/nexvote_logo.jpeg` — a 1254×1254 lock-up:
 * ballot-box badge + wordmark on the brand gradient). Every brand spot
 * renders this artwork: the header lock-up, the auth splash, the home hero,
 * onboarding, the public footer, and the derived PWA icons under `public/`
 * (see `scripts/generate-pwa-icons.mjs`).
 *
 * Plain `<img>`: the file lives in `public/` and is served statically, the
 * same convention the app already uses for its own media. Pass a width via
 * the height class (`h-9 w-auto` keeps the square lock-up's aspect ratio).
 */
export function BrandLogo({
  className,
  alt = "",
}: {
  className?: string;
  /** Defaults to decorative — pair it with a visible name or an aria-label. */
  alt?: string;
}) {
  return (
    <img
      src={tenant.logo}
      alt={alt}
      decoding="async"
      className={cn("select-none", className)}
    />
  );
}
