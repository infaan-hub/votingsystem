import { Vote } from "lucide-react";

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
      <div className="app-shell min-h-dvh w-full bg-white pb-safe">
        <div className="mx-auto w-full max-w-[480px] px-4 pb-10 pt-6 sm:px-6 sm:pb-12 sm:pt-10 max-[360px]:px-3">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell flex min-h-dvh w-full flex-col bg-white pb-safe md:flex-row md:items-stretch">
      <AuthBrandHeader />
      <div className="flex flex-1 items-center justify-center px-4 pb-10 pt-6 sm:px-6 sm:pb-12 sm:pt-10 max-[360px]:px-3">
        <div className="w-full max-w-[480px] min-w-0">{children}</div>
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
