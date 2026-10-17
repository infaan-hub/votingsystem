import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/src/components/brand-logo";
import { cn } from "@/src/lib/utils";
import tenant, { t } from "@/config/tenant";

/**
 * Brand panel shared by Login and Register. On phones it is a compact
 * header above the form; from the `md` breakpoint it becomes a full-height
 * left column so the form sits centred on the right.
 */
export function AuthBrandHeader() {
  return (
    <header
      className="flex min-h-[190px] w-full flex-col items-center justify-center px-5 py-8 text-center sm:py-10 md:min-h-0 md:w-[42%] md:max-w-[520px] md:shrink-0 md:px-10 md:py-16"
      style={{
        background: "linear-gradient(135deg, #FFFFFF 0%, #FCF1F3 55%, #F8E3E7 100%)",
      }}
    >
      {/* The real logo artwork already carries the wordmark, so the heading
          stays available to screen readers instead of repeating the name. */}
      <h1 className="shrink-0">
        <BrandLogo className="h-36 w-36 rounded-3xl shadow-[0_10px_28px_rgba(187,24,46,0.25)] sm:h-44 sm:w-44" />
        <span className="sr-only">{t.name}</span>
      </h1>
      <p className="mt-5 max-w-[22rem] text-[15px] leading-relaxed text-nv-muted sm:text-base">
        {tenant.tagline}
      </p>
    </header>
  );
}

/**
 * Page shell for every authentication screen. Login/Register: brand panel
 * on the left on desktop (top on phone) plus a centred form column capped
 * at 480px. The OTP step renders without the brand, centred alone.
 */
export function AuthShell({
  children,
  showBrand = true,
}: {
  children: React.ReactNode;
  /** The OTP verification step renders without the brand panel. */
  showBrand?: boolean;
}) {
  if (!showBrand) {
    return (
      <div className="app-shell flex min-h-dvh w-full flex-col bg-white pb-safe">
        <div className="px-4 pt-4 sm:px-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm font-medium text-nv-muted transition-colors hover:text-nv-primary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </Link>
        </div>
        {/* flex-1 + justify-center keeps the card vertically centred on a
            phone (Android and iOS) while the page still scrolls from the top
            when the content is taller than the viewport. */}
        <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col justify-center px-4 pb-10 pt-6 sm:px-6 sm:pb-12 sm:pt-10 max-[360px]:px-3">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell flex min-h-dvh w-full flex-col bg-white pb-safe md:flex-row md:items-stretch">
      <AuthBrandHeader />
      <div className="flex flex-1 items-center justify-center px-4 pb-10 pt-6 sm:px-6 sm:pb-12 sm:pt-10 max-[360px]:px-3">
        <div className="w-full max-w-[480px] min-w-0">
          <div className="mb-4">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm font-medium text-nv-muted transition-colors hover:text-nv-primary"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </Link>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Glass form card used by every auth form: full width up to the column cap,
 * comfortable padding, no fixed pixel widths that could overflow a phone.
 */
export function AuthCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "w-full min-w-0 rounded-[20px] border border-nv-primary/10 bg-white/92 px-5 py-6",
        "shadow-[0_12px_40px_rgba(36,33,36,0.07),0_3px_12px_rgba(187,24,46,0.035)] backdrop-blur-xl",
        "sm:rounded-3xl sm:p-8 max-[360px]:px-4 max-[360px]:py-5",
        className,
      )}
    >
      {children}
    </section>
  );
}
