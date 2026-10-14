"use client";

import Link from "next/link";
import { ArrowRight, LogOut, Mail, Phone, ShieldCheck, UserRound } from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { RequireRole } from "@/src/components/require-role";
import { Avatar } from "@/src/components/ui/avatar";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { PageHero } from "@/src/components/page-hero";
import { PushTestPanel } from "@/src/components/admin/push-test-panel";

/**
 * Administrator profile: identity at a glance plus the Push Notification
 * Testing panel. Account editing (name, photo, password) stays in the shared
 * /profile page so no existing functionality is duplicated or replaced.
 */
export default function AdminProfilePage() {
  return (
    <RequireRole role="admin">
      <AdminProfileBody />
    </RequireRole>
  );
}

function AdminProfileBody() {
  const { user, handleLogout } = useApp();
  if (!user) return null; // RequireRole renders the loading skeleton.

  return (
    <div className="space-y-5">
      <PageHero
        avatar={
          <Avatar
            src={user.photo_url ?? undefined}
            name={user.full_name || user.username}
            size={64}
            className="bg-white/20 text-white ring-2 ring-white/40"
          />
        }
        title={user.full_name || user.username}
        meta={`@${user.username}`}
        badges={
          <>
            <Badge variant="hero">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Administrator
            </Badge>
            <Badge variant="hero">{user.auth_provider === "google" ? "Google sign-in" : "Password sign-in"}</Badge>
          </>
        }
        actions={
          <>
            <Button asChild variant="hero" size="dense">
              <Link href="/profile">
                <UserRound className="h-4 w-4" aria-hidden="true" />
                Manage account
              </Link>
            </Button>
            <Button type="button" variant="heroGhost" size="dense" onClick={() => void handleLogout()}>
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </Button>
          </>
        }
      />

      {/* ---------------- Account summary ---------------- */}
      <Card aria-labelledby="admin-account-heading">
        <CardContent className="p-4 sm:p-5">
          <h2 id="admin-account-heading" className="text-[15px] font-bold text-nv-ink">
            Account
          </h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-2.5 rounded-nv-md border border-nv-line bg-white/70 px-3 py-2.5">
              <Mail className="h-4 w-4 shrink-0 text-nv-muted" aria-hidden="true" />
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.4px] text-nv-muted">Email</dt>
                <dd className="truncate text-[13.5px] font-semibold text-nv-ink">{user.email || "—"}</dd>
              </div>
            </div>
            <div className="flex items-center gap-2.5 rounded-nv-md border border-nv-line bg-white/70 px-3 py-2.5">
              <Phone className="h-4 w-4 shrink-0 text-nv-muted" aria-hidden="true" />
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.4px] text-nv-muted">Phone</dt>
                <dd className="truncate text-[13.5px] font-semibold text-nv-ink">
                  {user.phone_number || "—"}
                </dd>
              </div>
            </div>
          </dl>
          <Button asChild variant="ghost" size="dense" className="mt-3">
            <Link href="/profile">
              Edit profile details
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* ---------------- Push notification testing ---------------- */}
      <PushTestPanel />
    </div>
  );
}
