import { Vote } from "lucide-react";

import { cn } from "@/src/lib/utils";
import tenant, { t } from "@/config/tenant";

/**
 * Compact brand header shared by Login, Register and the OTP step.
 * Fixed, balanced height (~190px phone / ~240px from the `sm` breakpoint) on
 * a subtle white-to-pale-red gradient — the height never depends on the form.
 */
export function AuthBrandHeader() {
  return (
    <header
      className="flex min-h-[190px] w-full flex-col items-center justify-center px-5 py-8 text-center sm:min-h-[240px] sm:py-10"
      style={{
        background: "linear-gradient(135deg, #FFFFFF 0%, #FCF1F3 55%, #F8E3E7 100%)",
      }}
    >
      <span
        aria-hidden="true"
        className="grid h-16 w-16 shrink-0 place-items-center rounded-[17px] bg-nv-primary text-white shadow-[0_10px_28px_rgba(187,24,46,0.25)] sm:h-[76px] sm:w-[76px] sm:rounded-[20px]"
      >
        <Vote className="h-8 w-8 sm:h-9 sm:w-9" />
      </span>
      <h1 className="mt-4 text-[clamp(28px,3vw,40px)] font-extrabold leading-[1.15] tracking-tight text-nv-ink">
        {t.name}
      </h1>
      <p className="mt-1.5 max-w-[22rem] text-[15px] leading-relaxed text-nv-muted sm:text-base">
        {tenant.tagline}
      </p>
    </header>
  );
}

/**
 * Page shell for every authentication screen: the brand header plus a
 * centred column capped at 480px so Login and Register share one width system.
 */
export function AuthShell({
  children,
  showBrand = true,
}: {
  children: React.ReactNode;
  /** The OTP verification step renders without the brand header. */
  showBrand?: boolean;
}) {
  return (
    <div className="app-shell min-h-dvh w-full bg-white pb-safe">
      {showBrand ? <AuthBrandHeader /> : null}
      <div className="mx-auto w-full max-w-[480px] px-4 pb-10 pt-6 sm:px-6 sm:pb-12 sm:pt-10 max-[360px]:px-3">
        {children}
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
