"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Hourglass, PieChart, RotateCw } from "lucide-react";

import { BackButton } from "@/src/components/back-button";
import { ResultCard, type ResultCardPayload } from "@/src/components/result-card";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { Skeleton } from "@/src/components/ui/skeleton";

type PageState = "loading" | "ready" | "pending" | "missing" | "error";

/**
 * The result card, addressed by election slug. This is the page the published
 * notification opens; it renders the same {@link ResultCard} the officer
 * previewed before publishing.
 */
export default function ElectionResultCardPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [card, setCard] = useState<ResultCardPayload | null>(null);
  const [state, setState] = useState<PageState>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    setCard(null);
    setErrorMessage("");
    try {
      const response = await fetch(
        `/api/elections/${encodeURIComponent(slug)}/result-card/`,
      );
      if (response.status === 403) {
        setState("pending");
        return;
      }
      if (response.status === 404) {
        setState("missing");
        return;
      }
      if (!response.ok) {
        throw new Error("We could not load these results right now. Please try again.");
      }
      setCard((await response.json()) as ResultCardPayload);
      setState("ready");
    } catch (cause) {
      setErrorMessage(
        cause instanceof Error
          ? cause.message
          : "We could not load these results right now. Please try again.",
      );
      setState("error");
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 pb-6">
      <BackButton label="Back to results" fallback="/results" />

      {state === "loading" ? (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-80 w-full" />
        </div>
      ) : state === "ready" && card ? (
        <ResultCard card={card} />
      ) : state === "pending" ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-nv-primary-100 text-nv-primary">
              <Hourglass className="h-6 w-6" aria-hidden="true" />
            </span>
            <h1 className="text-fluid-lg text-nv-ink">Results are not published yet</h1>
            <p className="max-w-sm text-[13px] text-nv-muted">
              The tally exists, but the election officers have not released the result card
              yet. You will get a notification the moment they do.
            </p>
            <Button asChild variant="outline" size="dense" className="w-auto">
              <Link href="/results">Browse published results</Link>
            </Button>
          </CardContent>
        </Card>
      ) : state === "missing" ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-nv-primary-100 text-nv-primary">
              <PieChart className="h-6 w-6" aria-hidden="true" />
            </span>
            <h1 className="text-fluid-lg text-nv-ink">Election not found</h1>
            <p className="max-w-sm text-[13px] text-nv-muted">
              This result link does not match any election. It may have been removed.
            </p>
            <Button asChild variant="outline" size="dense" className="w-auto">
              <Link href="/results">See all results</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p role="alert" className="max-w-sm text-[13px] text-nv-danger">
              {errorMessage}
            </p>
            <Button variant="outline" size="dense" className="w-auto" onClick={() => void load()}>
              <RotateCw className="h-4 w-4" aria-hidden="true" />
              Try again
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
