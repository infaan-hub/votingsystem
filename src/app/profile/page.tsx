"use client";

import { useEffect, useRef, useState } from "react";
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
import { Dialog } from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { useToast } from "@/src/components/ui/toast";
import { PageHero } from "@/src/components/page-hero";
import tenant, { t } from "@/config/tenant";

/**
 * Shared profile page for every role (voters, election officers and
 * administrators via "Manage account").
 *
 * A signed-in user can edit their own name, email and photo, but never their
 * role — roles are assigned by an administrator through /admin/users. The
 * WhatsApp number is an officer/administrator sending identity, so voters do
 * not see that section at all.
 */
export default function ProfilePage() {
  const { user, token, handleLogout, refreshUser } = useApp();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [phoneValue, setPhoneValue] = useState("");
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [emailValue, setEmailValue] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordCurrent, setPasswordCurrent] = useState("");
  const [passwordNext, setPasswordNext] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPhoneValue(user?.phone_number ?? "");
  }, [user?.phone_number]);

  useEffect(() => {
    setFirstName(user?.first_name ?? "");
    setLastName(user?.last_name ?? "");
    setEmailValue(user?.email ?? "");
  }, [user?.first_name, user?.last_name, user?.email]);

  function openEditDialog() {
    // Re-sync from the session so a cancelled edit never leaves stale values.
    setFirstName(user?.first_name ?? "");
    setLastName(user?.last_name ?? "");
    setEmailValue(user?.email ?? "");
    setCurrentPassword("");
    setEditOpen(true);
  }

  async function onSaveProfile() {
    if (!token || profileSaving) return;
    setProfileSaving(true);
    try {
      const response = await fetch("/api/users/me/", {
        method: "PATCH",
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: emailValue.trim(),
          // Only sent when the user typed one; the server demands it for an
          // email edit and otherwise never sees the field.
          ...(currentPassword ? { current_password: currentPassword } : {}),
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        email?: string[] | string;
        first_name?: string[] | string;
        last_name?: string[] | string;
        current_password?: string[] | string;
        role?: string[] | string;
        detail?: string;
      } | null;
      if (!response.ok) {
        const fieldError =
          data?.email ??
          data?.current_password ??
          data?.first_name ??
          data?.last_name ??
          data?.role;
        throw new Error(
          (Array.isArray(fieldError) ? fieldError[0] : fieldError) ||
            data?.detail ||
            "Could not save your profile.",
        );
      }
      await refreshUser();
      toast({ title: "Profile updated", tone: "success" });
      setEditOpen(false);
    } catch (error) {
      toast({
        title: "Could not save profile",
        description: error instanceof Error ? error.message : "Please try again.",
        tone: "error",
      });
    } finally {
      setProfileSaving(false);
    }
  }

  async function onSavePassword() {
    if (!token || passwordSaving) return;
    setPasswordError("");
    if (passwordNext !== passwordConfirm) {
      setPasswordError("The new passwords do not match.");
      return;
    }
    if (passwordNext.length < 8) {
      setPasswordError("Use at least 8 characters.");
      return;
    }
    setPasswordSaving(true);
    try {
      const response = await fetch("/api/users/me/", {
        method: "PATCH",
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          current_password: passwordCurrent,
          password: passwordNext,
          confirm_password: passwordConfirm,
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        current_password?: string[] | string;
        password?: string[] | string;
        confirm_password?: string[] | string;
        detail?: string;
      } | null;
      if (!response.ok) {
        const fieldError =
          data?.current_password ?? data?.password ?? data?.confirm_password;
        throw new Error(
          (Array.isArray(fieldError) ? fieldError[0] : fieldError) ||
            data?.detail ||
            "Could not change the password.",
        );
      }
      toast({ title: "Password changed", tone: "success" });
      setPasswordOpen(false);
      setPasswordCurrent("");
      setPasswordNext("");
      setPasswordConfirm("");
    } catch (error) {
      setPasswordError(
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setPasswordSaving(false);
    }
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
          <Button asChild size="default" className="sm:w-52">
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
        accept="image/jpeg,image/png,image/webp"
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
        stats={[
          { label: "Role", value: user.role },
          { label: "Sign-in", value: user.auth_provider },
        ]}
      />
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={openEditDialog}
          aria-label="Edit profile"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-nv-line bg-nv-surface text-nv-muted transition-colors hover:bg-nv-primary-100 hover:text-nv-primary"
        >
          <Pencil className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

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

      {/* ---------------- WhatsApp number ----------------
          Officers share election links through their own number, so this is a
          sending identity rather than a voter setting. */}
      {user.role !== "voter" ? (
        <section aria-labelledby="whatsapp-heading" className="space-y-3">
          <div>
            <h2 id="whatsapp-heading" className="text-fluid-lg text-nv-ink">
              WhatsApp number
            </h2>
            <p className="mt-1 text-[13px] text-nv-muted">
              {user.role === "officer"
                ? "This is the WhatsApp number that sends election links to voters when you share from an election. Save it so voters recognise your messages."
                : "The WhatsApp number the electoral office uses when sharing election links."}
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
      ) : null}

      {/* ---------------- Password ---------------- */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[13.5px] font-semibold text-nv-ink">Password</p>
            <p className="mt-0.5 text-[12.5px] text-nv-muted">
              Change the password you use to sign in. You will need your current
              one to confirm.
            </p>
          </div>
          <Button
            variant="outline"
            className="w-auto"
            onClick={() => setPasswordOpen(true)}
          >
            Change password
          </Button>
        </CardContent>
      </Card>

      {/* ---------------- Notifications ---------------- */}
      <NotificationSettings />

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

      {/* ---------------- Edit profile ---------------- */}
      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          if (!profileSaving) setEditOpen(open);
        }}
        title="Edit profile"
        description="Update your name and email. Your role and registration details are managed by the electoral office."
        footer={
          <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
            <Button
              variant="outline"
              size="dense"
              className="w-auto"
              disabled={profileSaving}
              onClick={() => setEditOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="dense"
              className="w-auto"
              disabled={profileSaving}
              onClick={() => void onSaveProfile()}
            >
              {profileSaving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 pb-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="profile-first-name">First name</Label>
              <Input
                id="profile-first-name"
                autoComplete="given-name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-last-name">Last name</Label>
              <Input
                id="profile-last-name"
                autoComplete="family-name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-email">Email</Label>
            <Input
              id="profile-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={emailValue}
              onChange={(event) => setEmailValue(event.target.value)}
            />
          </div>
          {emailValue.trim().toLowerCase() !== (user.email ?? "").toLowerCase() ? (
            <div className="space-y-1.5">
              <Label htmlFor="profile-current-password">Current password</Label>
              <Input
                id="profile-current-password"
                type="password"
                autoComplete="current-password"
                placeholder="Confirm with your password to change the email"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </div>
          ) : null}
          <div className="rounded-nv-md border border-nv-line bg-white/70 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.4px] text-nv-muted">
              Role
            </p>
            <p className="text-[13.5px] font-semibold capitalize text-nv-ink">{user.role}</p>
            <p className="mt-0.5 text-[12px] text-nv-muted">
              Roles are changed by an administrator only.
            </p>
          </div>
        </div>
      </Dialog>

      {/* ---------------- Change password ---------------- */}
      <Dialog
        open={passwordOpen}
        onOpenChange={(open) => {
          if (!passwordSaving) setPasswordOpen(open);
        }}
        title="Change password"
        description="Choose a new password of at least 8 characters. You will need your current one to confirm."
        footer={
          <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
            <Button
              variant="outline"
              size="dense"
              className="w-auto"
              disabled={passwordSaving}
              onClick={() => setPasswordOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="dense"
              className="w-auto"
              disabled={passwordSaving}
              onClick={() => void onSavePassword()}
            >
              {passwordSaving ? "Saving…" : "Update password"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 pb-2">
          {passwordError ? (
            <p
              role="alert"
              className="rounded-lg border border-nv-danger/40 bg-nv-danger/10 px-3 py-2.5 text-[13px] text-nv-danger"
            >
              {passwordError}
            </p>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="password-current">Current password</Label>
            <Input
              id="password-current"
              type="password"
              autoComplete="current-password"
              value={passwordCurrent}
              onChange={(event) => setPasswordCurrent(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password-next">New password</Label>
            <Input
              id="password-next"
              type="password"
              autoComplete="new-password"
              value={passwordNext}
              onChange={(event) => setPasswordNext(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password-confirm">Confirm new password</Label>
            <Input
              id="password-confirm"
              type="password"
              autoComplete="new-password"
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
