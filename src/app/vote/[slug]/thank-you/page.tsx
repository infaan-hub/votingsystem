"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Loader2, Receipt as ReceiptIcon, ShieldCheck } from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import tenant from "@/config/tenant";

type ReceiptEntry = {
  receipt_code: string;
  position: string;
  cast_at: string;
  choices: string[];
};

type LoadState = "loading" | "ready" | "empty" | "signed_out" | "error";

/**
 * Receipt page for the voter's own ballot. The code is loaded from the
 * authenticated receipt endpoint — never taken from the query string, which
 * anyone can type.
 */
export default function ThankYouPage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const { token } = useApp();
  const [state, setState] = useState<LoadState>("loading");
  const [receipts, setReceipts] = useState<ReceiptEntry[]>([]);

  const load = useCallback(async () => {
    if (!slug) {
      setState("error");
      return;
    }
    if (!token) {
      setState("signed_out");
      return;
    }
    setState("loading");
    try {
      const response = await fetch(`/api/elections/${slug}/receipt/`, {
        headers: { Authorization: `Token ${token}` },
      });
      if (response.status === 401) {
        setState("signed_out");
        return;
      }
      if (!response.ok) {
        setState("error");
        return;
      }
      const data = (await response.json()) as { receipts?: ReceiptEntry[] };
      const rows = data.receipts ?? [];
      setReceipts(rows);
      setState(rows.length > 0 ? "ready" : "empty");
    } catch {
      setState("error");
    }
  }, [slug, token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") {
    return (
      <div className="mx-auto flex min-h-[60dvh] max-w-md items-center justify-center px-4 pb-nav lg:pb-10">
        <Card className="w-full">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-nv-primary" aria-hidden="true" />
            <p className="text-[13px] text-nv-muted">Loading your receipt…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state === "signed_out") {
    return (
      <div className="mx-auto flex min-h-[60dvh] max-w-md items-center justify-center px-4 pb-nav lg:pb-10">
        <Card className="w-full">
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <ReceiptIcon className="h-7 w-7 text-nv-muted" aria-hidden="true" />
            <h1 className="text-fluid-lg text-nv-ink">Sign in to view your receipt</h1>
            <Button asChild className="sm:w-52">
              <Link href={`/login?next=${encodeURIComponent(`/vote/${slug}/thank-you`)}`}>
                Sign in
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state === "empty" || state === "error") {
    return (
      <div className="mx-auto flex min-h-[60dvh] max-w-md items-center justify-center px-4 pb-nav lg:pb-10">
        <Card className="w-full">
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <ReceiptIcon className="h-7 w-7 text-nv-muted" aria-hidden="true" />
            <h1 className="text-fluid-lg text-nv-ink">
              {state === "empty" ? "No vote recorded yet" : "Could not load your receipt"}
            </h1>
            <p className="max-w-sm text-[13px] text-nv-muted">
              {state === "empty"
                ? "Your account has no recorded ballot in this election."
                : "Check your connection and try again."}
            </p>
            <div className="flex w-full flex-col gap-2 sm:w-52">
              {state === "error" ? (
                <Button onClick={load}>Try again</Button>
              ) : null}
              <Button asChild variant={state === "empty" ? "primary" : "outline"}>
                <Link href={`/vote/${slug}`}>Go to the ballot</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[80dvh] max-w-md flex-col justify-center px-4 pb-nav lg:pb-10">
      <Card className="overflow-hidden">
        <div className="nv-grad-candidate flex flex-col items-center px-6 py-9 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-nv-navy/20">
            <CheckCircle2 className="h-9 w-9 text-nv-navy" aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-[26px] font-extrabold leading-8 tracking-tight text-nv-navy">
            Thank you for voting!
          </h1>
          <p className="mt-2 text-[13px] leading-5 text-nv-navy/85">
            Your ballot has been recorded by {tenant.authority.name} and cannot be
            changed.
          </p>
        </div>

        <CardContent className="space-y-4 p-5">
          {receipts.map((receipt) => (
            <div
              key={`${receipt.receipt_code}-${receipt.position}`}
              className="rounded-nv-md border border-nv-line bg-nv-surface p-4"
            >
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.4px] text-nv-muted">
                <ReceiptIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {receipt.position} — verification code
              </p>
              <p className="nums-tabular mt-1.5 break-all text-[18px] font-extrabold tracking-tight text-nv-ink">
                {receipt.receipt_code}
              </p>
              {receipt.choices.length > 0 ? (
                <p className="mt-1.5 text-[13px] font-semibold text-nv-ink">
                  {receipt.choices.join(", ")}
                </p>
              ) : null}
              <p className="mt-1 text-[12px] text-nv-muted">
                Recorded {new Date(receipt.cast_at).toLocaleString()}
              </p>
            </div>
          ))}

          <p className="text-[12px] leading-4 text-nv-muted">
            Keep this code. It confirms your ballot was counted without showing
            how you voted.
          </p>

          <div className="flex items-start gap-2 rounded-nv-md bg-nv-primary-100 p-3">
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
              <Link href={`/elections/${slug}`}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to election
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
