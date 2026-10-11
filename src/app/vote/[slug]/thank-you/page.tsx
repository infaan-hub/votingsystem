import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, Receipt as ReceiptIcon, ShieldCheck } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import tenant from "@/config/tenant";

export const dynamic = "force-dynamic";

export default async function ThankYouPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ code?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const code = (query.code ?? "").trim();

  // A receipt is only meaningful when one was actually issued.
  if (!code) {
    redirect(`/vote/${slug}`);
  }

  return (
    <div className="mx-auto flex min-h-[80dvh] max-w-md flex-col justify-center px-4 pb-nav lg:pb-10">
      <Card className="overflow-hidden">
        <div className="nv-grad-candidate flex flex-col items-center px-6 py-9 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-white/20">
            <CheckCircle2 className="h-9 w-9 text-white" aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-[26px] font-extrabold leading-8 tracking-tight text-white">
            Thank you for voting!
          </h1>
          <p className="mt-2 text-[13px] leading-5 text-white/85">
            Your ballot has been recorded by {tenant.authority.name} and cannot be
            changed.
          </p>
        </div>

        <CardContent className="space-y-4 p-5">
          {/* Receipt — lets the voter verify inclusion without revealing their
              choice, since it is not derived from any ballot content. */}
          <div className="rounded-nv-md border border-nv-line bg-nv-surface p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.4px] text-nv-muted">
              <ReceiptIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Your verification code
            </p>
            <p className="nums-tabular mt-1.5 break-all text-[18px] font-extrabold tracking-tight text-nv-ink">
              {code}
            </p>
            <p className="mt-2 text-[12px] leading-4 text-nv-muted">
              Keep this code. It confirms your ballot was counted without showing
              how you voted.
            </p>
          </div>

          <div className="flex items-start gap-2 rounded-nv-md bg-nv-primary-100/50 p-3 dark:bg-[#3a1030]">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-nv-primary" aria-hidden="true" />
            <p className="text-[12px] leading-4 text-nv-text">
              Your vote is stored separately from your identity. Only aggregate
              totals are published.
            </p>
          </div>

          <div className="space-y-2">
            <Button asChild>
              <Link href="/">Done</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/feed">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                View live results
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}