import Link from "next/link";
import tenant from "@/config/tenant";

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-5 px-6 text-center">
      <p className="text-[56px] font-black leading-none text-nv-primary">404</p>
      <div className="space-y-1">
        <h1 className="text-lg font-bold text-nv-ink">Page not found</h1>
        <p className="max-w-sm text-sm leading-6 text-nv-muted">
          The page you are looking for does not exist, may have been moved, or the
          election is no longer published.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/"
          className="rounded-full bg-nv-primary px-5 py-2.5 text-sm font-semibold text-nv-navy transition hover:bg-nv-primary-600"
        >
          Back to {tenant.shortName}
        </Link>
        <Link
          href="/elections"
          className="rounded-full border border-nv-line px-5 py-2.5 text-sm font-semibold text-nv-ink transition hover:bg-nv-surface"
        >
          Browse elections
        </Link>
      </div>
    </main>
  );
}
