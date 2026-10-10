"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/src/components/AppProvider";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";

type Position = {
  id: number;
  name: string;
  candidates: Array<{ id: number; user: { full_name: string; username: string }; slogan: string }>;
};

function VoteForm({ slug }: { slug: string }) {
  const router = useRouter();
  const { user, token } = useApp();
  const [positions, setPositions] = useState<Position[]>([]);
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    fetch(`/api/elections/${slug}/ballot/`, {
      headers: { Authorization: `Token ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.positions) setPositions(data.positions);
      })
      .catch(() => setError("Failed to load ballot."));
  }, [token, slug, router]);

  async function handleVote() {
    setError("");
    setLoading(true);
    try {
      for (const position of positions) {
        const candidateId = selected[position.id];
        if (!candidateId) {
          setError(`Please select a candidate for ${position.name}.`);
          setLoading(false);
          return;
        }
        const res = await fetch("/api/votes/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Token ${token}`,
          },
          body: JSON.stringify({ candidate_id: candidateId }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const msgs = Object.values(data).flat().join(" ");
          setError(msgs || "Vote could not be recorded.");
          setLoading(false);
          return;
        }
      }
      setSuccess(true);
    } catch {
      setError("Vote could not be recorded.");
    } finally {
      setLoading(false);
    }
  }

  if (!user) return null;

  if (success) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl text-success">Vote recorded</CardTitle>
          <CardDescription>Your vote has been successfully cast.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/elections">Back to elections</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}
      {positions.map((position) => (
        <Card key={position.id}>
          <CardHeader>
            <CardTitle>{position.name}</CardTitle>
            <CardDescription>Select one candidate</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {position.candidates.map((candidate) => (
                <label
                  key={candidate.id}
                  className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors ${
                    selected[position.id] === candidate.id
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name={`position-${position.id}`}
                      checked={selected[position.id] === candidate.id}
                      onChange={() => setSelected((prev) => ({ ...prev, [position.id]: candidate.id }))}
                    />
                    <div>
                      <p className="font-medium">{candidate.user.full_name || candidate.user.username}</p>
                      {candidate.slogan && (
                        <p className="text-sm text-muted-foreground">{candidate.slogan}</p>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
      <Button onClick={handleVote} disabled={loading} className="w-full">
        {loading ? "Submitting..." : "Submit vote"}
      </Button>
    </div>
  );
}

export default function VotePage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <VoteFormWrapper params={params} />
    </Suspense>
  );
}

async function VoteFormWrapper({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight">Cast your vote</h1>
      <p className="mt-2 text-muted-foreground">Select a candidate for each position.</p>
      <div className="mt-8">
        <VoteForm slug={slug} />
      </div>
    </div>
  );
}