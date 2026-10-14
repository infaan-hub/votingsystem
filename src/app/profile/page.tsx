"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Camera,
  ChevronRight,
  LogOut,
  MessageCircle,
  Pencil,
  Shield,
  Vote,
  X,
} from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { NotificationSettings } from "@/src/components/notification-settings";
import { Avatar } from "@/src/components/ui/avatar";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useToast } from "@/src/components/ui/toast";
import { PageHero } from "@/src/components/page-hero";
import tenant, { t } from "@/config/tenant";

export default function ProfilePage() {
  const { user, token, handleLogout, refreshUser } = useApp();
  const { toast } = useToast();
  const [votesCast, setVotesCast] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [phoneValue, setPhoneValue] = useState("");
  const [phoneSaving, setPhoneSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPhoneValue(user?.phone_number ?? "");
  }, [user?.phone_number]);

  const loadActivity = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch("/api/elections/", {
        headers: { Authorization: `Token ${token}` },
      });
      if (!response.ok) return;
      const elections = (await response.json()) as Array<{
        positions?: Array<{ candidates?: Array<{ vote_total?: number }> }>;
      }>;
      // The public list endpoint does not expose a voter's own ballot, so this
      // reports the platform-wide total that is actually observable.
      const total = elections.reduce((sum, entry) => {
        const positions = entry.positions ?? [];
        return (
          sum +
          positions.reduce((inner, position) => {
            const candidates = position.candidates ?? [];
            return (
              inner +
              candidates.reduce((deep, candidate) => deep + (candidate.vote_total ?? 0), 0)
            );
          }, 0)
        );
      }, 0);
      setVotesCast(total);
    } catch {
      setVotesCast(null);
    }
  }, [token]);

  useEffect(() => {
    void loadActivity();
  }, [loadActivity]);

  /** Profile edits go through the electoral office; the button says so rather
   *  than navigating to a page that does not exist. */
  function onEditRequest() {
    toast({
      title: "Contact the electoral office",
      description: `Profile changes are handled by ${tenant.authority.name} at ${tenant.authority.contactEmail}.`,
      tone: "info",
    });
  }

  async function onPhotoSelected(file: File) {
    if (!token) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("photo", file);
      const response = await fetch("/api/users/me/photo/", {
        method: "PUT",
        headers: { Authorization: `Token ${token}` },
        body: form,
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          photo?: string[];
          detail?: string;
        } | null;
        throw new Error(data?.photo?.[0] ?? data?.detail ?? "Upload failed.");
      }
      await refreshUser();
      toast({ title: "Profile photo updated", tone: "success" });
    } catch (error) {
      toast({
        title: "Could not upload photo",
        description: error instanceof Error ? error.message : "Please try again.",
        tone: "error",
      });
    } finally {
      setUploading(false);
    }
  }

  async function onRemovePhoto() {
    if (!token || uploading) return;
    setUploading(true);
    try {
      const response = await fetch("/api/users/me/photo/", {
        method: "DELETE",
        headers: { Authorization: `Token ${token}` },
      });
      if (!response.ok) throw new Error("Remove failed.");
      await refreshUser();
      toast({ title: "Profile photo removed", tone: "success" });
    } catch {
      toast({
        title: "Could not remove photo",
        description: "Please try again.",
        tone: "error",
      });
    } finally {
      setUploading(false);
    }
  }

  async function onSavePhone() {
    if (!token || phoneSaving) return;
    setPhoneSaving(true);
    try {
      const response = await fetch("/api/users/me/", {
        method: "PATCH",
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone_number: phoneValue.trim() }),
      });
      const data = (await response.json().catch(() => null)) as {
        phone_number?: string[] | string | null;
        detail?: string;
      } | null;
      if (!response.ok) {
        const fieldError = data?.phone_number;
        throw new Error(
          (Array.isArray(fieldError) ? fieldError[0] : fieldError) ||
            data?.detail ||
            "Could not save the number.",
        );
      }
      await refreshUser();
      toast({ title: "WhatsApp number saved", tone: "success" });
    } catch (error) {
      toast({
        title: "Could not save number",
        description: error instanceof Error ? error.message : "Please try again.",
        tone: "error",
      });
    } finally {
      setPhoneSaving(false);
    }
  }

  if (!user) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
          <span className="nv-grad-profile grid h-14 w-14 place-items-center rounded-full text-white">
            <Shield className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="text-[18px] font-bold text-nv-ink">Sign in to continue</h1>
          <p className="max-w-sm text-[13px] text-nv-muted">
            Your profile and voting history live behind
            authentication.
          </p>
          <Button asChild className="sm:w-52">
            <Link href="/login">Sign in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void onPhotoSelected(file);
        }}
      />
      {/* ---------------- Profile hero ---------------- */}
      <PageHero
        avatar={
          <span className="relative shrink-0">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              aria-label={
                user.photo_url ? "Change profile photo" : "Upload a profile photo"
              }
              className="relative block rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:opacity-60"
            >
              <Avatar
                src={user.photo_url ?? undefined}
                name={user.full_name || user.username}
                size={64}
                className="bg-white/20 text-white ring-2 ring-white/40"
              />
              <span className="absolute -bottom-0.5 -right-0.5 grid h-7 w-7 place-items-center rounded-full bg-white text-nv-primary shadow-float">
                <Camera className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </button>
            {user.photo_url ? (
              <button
                type="button"
                onClick={() => void onRemovePhoto()}
                disabled={uploading}
                aria-label="Remove profile photo"
                className="absolute -left-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-white/90 text-nv-muted shadow transition-colors hover:text-nv-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:opacity-60"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </span>
        }
        title={user.full_name || user.username}
        meta={`${t.idLabel}: ${user.username}`}
        actions={
          <button
            type="button"
            onClick={onEditRequest}
            aria-label="Edit profile"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/30"
          >
            <Pencil className="h-5 w-5" aria-hidden="true" />
          </button>
        }
        stats={[
          { label: "Role", value: user.role },
          { label: "Sign-in", value: user.auth_provider },
        ]}
      />

      {/* ---------------- Constituency card ---------------- */}
      <Card>
        <CardContent className="flex items-center gap-3.5 p-4">
          <span
            aria-hidden="true"
            className="nv-grad-candidate grid h-11 w-11 shrink-0 place-items-center rounded-full text-nv-navy"
          >
            <Vote className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-nv-ink">
              {t.constituency} &amp; {t.region}
            </p>
            <p className="text-[12px] text-nv-muted">
              Set where you are registered to vote.
            </p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-nv-muted" aria-hidden="true" />
        </CardContent>
      </Card>

      {/* ---------------- WhatsApp number ---------------- */}
      <section aria-labelledby="whatsapp-heading" className="space-y-3">
        <div>
          <h2 id="whatsapp-heading" className="text-fluid-lg text-nv-ink">
            WhatsApp number
          </h2>
          <p className="mt-1 text-[13px] text-nv-muted">
            {user.role === "officer"
              ? "This is the WhatsApp number that sends election links to voters when you share from an election. Save it so voters recognise your messages."
              : "Your WhatsApp number, if you want organizers to reach you on WhatsApp."}
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-1.5">
              <label
                htmlFor="whatsapp-phone"
                className="block text-[12px] font-bold uppercase tracking-[0.6px] text-nv-muted"
              >
                Phone number
              </label>
              <Input
                id="whatsapp-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="e.g. +255 712 345 678"
                value={phoneValue}
                onChange={(event) => setPhoneValue(event.target.value)}
              />
            </div>
            <Button
              type="button"
              onClick={() => void onSavePhone()}
              disabled={phoneSaving || phoneValue.trim() === (user.phone_number ?? "")}
              className="shrink-0 sm:w-auto"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              {phoneSaving ? "Saving…" : "Save number"}
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* ---------------- Notifications ---------------- */}
      <NotificationSettings />

      {/* ---------------- Activity ---------------- */}
      <section aria-labelledby="activity-heading" className="space-y-3">
        <h2 id="activity-heading" className="text-[15px] font-bold text-nv-ink">
          Your activity
        </h2>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.4px] text-nv-muted">
                Platform votes counted
              </p>
              {votesCast === null ? (
                <Skeleton className="mt-2 h-8 w-16" />
              ) : (
                <p className="nums-tabular mt-1 text-[26px] font-extrabold leading-8 text-nv-ink">
                  {votesCast.toLocaleString()}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ---------------- Session ---------------- */}

      {/* ---------------- Session ---------------- */}
      <section className="space-y-2 border-t border-nv-line pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">
            {tenant.authority.name}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="ghost" className="w-auto px-4">
            <Link href="/privacy">Privacy</Link>
          </Button>
          <Button asChild variant="ghost" className="w-auto px-4">
            <Link href="/terms">Terms</Link>
          </Button>
        </div>
        <Button variant="subtle" onClick={handleLogout}>
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </Button>
      </section>
    </div>
  );
}