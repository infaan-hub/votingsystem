"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/src/components/AppProvider";
import { RequireRole } from "@/src/components/require-role";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { PageHero } from "@/src/components/page-hero";
import { Textarea } from "@/src/components/ui/textarea";
import { useToast } from "@/src/components/ui/toast";
import { apiFetch } from "@/src/app/officer/_shared";

type CandidateMe = {
  id: number;
  manifesto: string;
  slogan: string;
  has_photo: boolean;
  has_video: boolean;
  position: { id: number; name: string };
  election: { id: number; slug: string; title: string; status: string; resultPublishedAt?: string | null };
  result_published: boolean;
  vote_total: number | null;
};

export default function CandidateWorkspacePage() {
  const { token } = useApp();
  const { toast } = useToast();
  const [data, setData] = useState<CandidateMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manifesto, setManifesto] = useState("");
  const [slogan, setSlogan] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<CandidateMe>(token, "/api/candidates/me");
      setData(payload);
      setManifesto(payload.manifesto ?? "");
      setSlogan(payload.slogan ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your candidacy.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token]);

  async function save() {
    if (!token || saving) return;
    setSaving(true);
    try {
      const form = new FormData();
      form.append("manifesto", manifesto);
      form.append("slogan", slogan);
      if (photo) form.append("photo", photo);
      if (video) form.append("video", video);
      await apiFetch(token, "/api/candidates/me", { method: "PATCH", body: form });
      toast({ title: "Candidacy updated", tone: "success" });
      setPhoto(null);
      setVideo(null);
      await load();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Could not save", tone: "warning" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <RequireRole role="candidate">
      <PageHero
        eyebrow="Candidate workspace"
        title="My candidacy"
        description="Update your manifesto, slogan and media. Campaign dates are set by the election officer."
      />
      {loading ? <p className="mt-6 text-sm text-nv-muted">Loading…</p> : null}
      {error ? <p className="mt-6 text-sm text-nv-danger">{error}</p> : null}
      {data ? (
        <div className="mt-6 space-y-6 max-w-2xl">
          <div className="rounded-nv-md border border-nv-line bg-nv-surface p-4">
            <p className="text-sm text-nv-muted">Election</p>
            <p className="text-lg font-semibold text-nv-ink">{data.election.title}</p>
            <p className="text-sm text-nv-muted">
              Position: {data.position.name} · Status: {data.election.status}
            </p>
            {data.result_published ? (
              <p className="mt-2 text-sm font-medium text-nv-primary">
                Your votes: {data.vote_total ?? 0}
              </p>
            ) : (
              <p className="mt-2 text-sm text-nv-muted">Vote totals appear after results are published.</p>
            )}
          </div>
          <Input
            label="Slogan"
            value={slogan}
            onChange={(e) => setSlogan(e.target.value)}
            maxLength={200}
          />
          <Textarea
            label="Manifesto / description"
            value={manifesto}
            onChange={(e) => setManifesto(e.target.value)}
            maxLength={4000}
          />
          <div className="space-y-2">
            <label className="text-sm font-medium text-nv-ink">Photo</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-nv-muted"
            />
            {data.has_photo ? <p className="text-xs text-nv-muted">A photo is currently set.</p> : null}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-nv-ink">Campaign video</label>
            <input
              type="file"
              accept="video/*"
              onChange={(e) => setVideo(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-nv-muted"
            />
            {data.has_video ? <p className="text-xs text-nv-muted">A video is currently set.</p> : null}
          </div>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      ) : null}
    </RequireRole>
  );
}
