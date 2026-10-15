"use client";

import { useState } from "react";
import { CheckCircle2, MessageCircle, RefreshCw, ShieldCheck, Trash2, UserPlus } from "lucide-react";

import { RequireRole } from "@/src/components/require-role";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { AlertDialog } from "@/src/components/ui/dialog";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Input } from "@/src/components/ui/input";
import { LinkButton } from "@/src/components/ui/page-header";
import { PageHero } from "@/src/components/page-hero";
import { RadioGroup } from "@/src/components/ui/radio-group";
import { Section } from "@/src/components/ui/section";
import { Select } from "@/src/components/ui/select";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useToast } from "@/src/components/ui/toast";
import { apiRequest, useResource, useToken, type Resource } from "../_shared";

type UserOption = {
  id: number;
  username: string;
  full_name: string;
  email: string;
  role: string;
};

type Assignment = {
  id: number;
  scope: string;
  note: string;
  is_active: boolean;
  created_at: string | null;
  officer: {
    id: number;
    username: string;
    full_name: string;
    email: string;
    role: string;
    is_active: boolean;
    phone_number?: string | null;
  };
  election: { id: number; title: string; slug: string } | null;
  organization: { id: number; name: string } | null;
};

type OfficerRow = {
  id: number;
  username: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  joined_at: string | null;
  phone_number?: string | null;
  assignments: Assignment[];
};

type Mode = "existing" | "new";

/** The registration response: an officer ACCOUNT — scope comes later, at
 * election establishment, when the operator is selected. */
type RegisteredOfficer = {
  id: number;
  username: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  phone_number: string | null;
};

export default function AddElectionOfficerPage() {
  return (
    <>
      <PageHero
        eyebrow="Administration"
        title="Election officers"
        description="Register an officer account here — no election is chosen at registration. An officer operates exactly one election: one they establish themselves, or one you assign while establishing or editing an election. Officers never see every election."
        actions={
          <LinkButton href="/admin/users" variant="heroGhost" className="w-auto">
            View users
          </LinkButton>
        }
      />
      <RequireRole role="admin">
        <OfficerManager />
      </RequireRole>
    </>
  );
}

function OfficerManager() {
  const officers = useResource<OfficerRow[]>(
    (authToken) => apiRequest<OfficerRow[]>(authToken, "/api/admin/officers"),
    [],
  );

  return (
    <>
      <OfficerForm onCreated={officers.reload} />
      <OfficersSection officers={officers} />
    </>
  );
}

function OfficerForm({ onCreated }: { onCreated?: () => void }) {
  const token = useToken();
  const { toast } = useToast();
  const users = useResource<{ users: UserOption[] }>(
    (authToken) => apiRequest<{ users: UserOption[] }>(authToken, "/api/admin/users"),
    [],
  );
  const [mode, setMode] = useState<Mode>("existing");
  const [existingUserId, setExistingUserId] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<RegisteredOfficer | null>(null);

  const userRows = users.data?.users ?? [];

  const listLoading = users.loading && !users.data;
  const listError = users.error && !users.data ? users.error : "";

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (mode === "existing" && !existingUserId) {
      next.existingUserId = "Choose the account to promote to officer.";
    }
    if (mode === "new") {
      if (!username.trim()) next.username = "A username is required.";
      if (!email.trim()) next.email = "An email address is required.";
      else if (!email.includes("@") || !email.includes("."))
        next.email = "Enter a valid email address.";
    }
    return next;
  }

  function resetForm() {
    setMode("existing");
    setExistingUserId("");
    setUsername("");
    setEmail("");
    setFullName("");
    setWhatsappPhone("");
    setErrors({});
    setCreated(null);
  }

  async function submit() {
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length) return;

    // Registration creates the account only — no election scope. The officer
    // is scoped to exactly one election later, when an election is
    // established (or edited) and its operator is selected there.
    const body: Record<string, unknown> = {};
    if (whatsappPhone.trim()) body.whatsapp_phone = whatsappPhone.trim();
    if (mode === "existing") {
      body.user_id = Number(existingUserId);
    } else {
      body.username = username.trim();
      body.email = email.trim();
      if (fullName.trim()) body.full_name = fullName.trim();
    }

    setSubmitting(true);
    try {
      const officer = await apiRequest<RegisteredOfficer>(token, "/api/admin/officers", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setCreated(officer);
      onCreated?.();
      toast({ title: "Officer account registered", tone: "success" });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The request failed.";
      setErrors({ form: message });
      toast({ title: "Could not register officer", description: message, tone: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  if (listLoading) {
    return (
      <div className="mt-6 space-y-3">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (listError) {
    return (
      <div className="mt-6 space-y-4">
        <ErrorBanner message={listError} onRetry={() => users.reload()} />
        <EmptyState
          icon={<UserPlus className="h-5 w-5" aria-hidden="true" />}
          title="Form data could not be loaded"
          description="The officer form needs the user list before it can accept a submission."
          action={
            <Button size="dense" className="w-auto" onClick={() => users.reload()}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  if (created) {
    return (
      <div className="mt-6">
        <Section
          title="Officer registered"
          description="The account is ready. Its election scope comes next — establish an election and select this officer as its operator."
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-nv-md border border-success/30 bg-success/15 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
              <div className="min-w-0 space-y-1">
                <p className="text-[14px] font-semibold text-nv-ink">
                  {created.full_name || created.username} is now an officer
                </p>
                <p className="text-[13px] text-nv-text">
                  Role: {created.role} · no election scope yet
                </p>
                <p className="text-[12.5px] text-nv-muted">
                  Account {created.username} · {created.email}
                  {created.phone_number ? ` · ${created.phone_number}` : ""}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="dense" className="w-auto" onClick={resetForm}>
                Register another officer
              </Button>
              <LinkButton href="/admin/elections" variant="outline" className="w-auto h-9 px-3">
                Establish an election
              </LinkButton>
              <LinkButton href="/admin/users" variant="outline" className="w-auto h-9 px-3">
                View users
              </LinkButton>
            </div>
          </div>
        </Section>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {errors.form ? <ErrorBanner message={errors.form} onRetry={() => setErrors({})} /> : null}

      <Section
        title="Officer account"
        description="Existing accounts keep their password and are promoted to the officer role; new accounts are created with an unusable password that only an invitation or reset can set."
      >
        <div className="max-w-2xl space-y-4">
          <RadioGroup
            label="Account source"
            name="officer-source"
            variant="card"
            value={mode}
            onChange={(value) => {
              setMode(value as Mode);
              setErrors({});
            }}
            options={[
              {
                value: "existing",
                label: "Existing account",
                description: "Promote someone who already has a login.",
              },
              {
                value: "new",
                label: "New officer account",
                description: "Create the account now and invite the officer separately.",
              },
            ]}
          />

          {mode === "existing" ? (
            <div className="max-w-md">
              <Select
                label="Account"
                value={existingUserId}
                onChange={(event) => setExistingUserId(event.target.value)}
                options={userRows.map((row) => ({
                  value: String(row.id),
                  label: `${row.full_name || row.username} (@${row.username}) · ${row.role}`,
                }))}
                placeholder="Choose a user"
                error={errors.existingUserId}
                hint="Administrators stay administrators; every other role is promoted to officer."
              />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="e.g. j.adhiambo"
                error={errors.username}
                autoComplete="off"
              />
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="officer@example.edu"
                error={errors.email}
                autoComplete="off"
              />
              <Input
                label="Full name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Optional, e.g. Jane Adhiambo"
              />
            </div>
          )}

          <div className="max-w-md space-y-1.5">
            <Input
              label="WhatsApp number"
              type="tel"
              inputMode="tel"
              value={whatsappPhone}
              onChange={(event) => setWhatsappPhone(event.target.value)}
              placeholder="e.g. +255 712 345 678"
              error={errors.whatsapp_phone}
              autoComplete="off"
            />
            <p className="text-[12px] text-nv-muted">
              The WhatsApp number this officer uses to send election links to voters.
            </p>
          </div>
        </div>
      </Section>

      <div className="flex flex-wrap gap-2">
        <Button
          size="dense"
          className="w-auto"
          disabled={submitting}
          onClick={() => void submit()}
        >
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          {submitting ? "Registering…" : "Register officer"}
        </Button>
        <Button variant="outline" size="dense" className="w-auto" disabled={submitting} onClick={resetForm}>
          Reset
        </Button>
      </div>
    </div>
  );
}

function scopeLabel(scope: string): string {
  if (scope === "all") return "All elections";
  if (scope === "election") return "One election";
  if (scope === "organization") return "One organization";
  return scope;
}

function OfficersSection({ officers }: { officers: Resource<OfficerRow[]> }) {
  const token = useToken();
  const { toast } = useToast();
  const [pendingRevoke, setPendingRevoke] = useState<Assignment | null>(null);
  const [revoking, setRevoking] = useState(false);

  const rows = officers.data ?? [];

  async function revoke() {
    if (!pendingRevoke) return;
    setRevoking(true);
    try {
      await apiRequest(token, `/api/admin/officers/${pendingRevoke.id}`, {
        method: "DELETE",
      });
      toast({
        title: "Assignment revoked",
        description: `${pendingRevoke.officer.full_name || pendingRevoke.officer.username} lost this scope. Their account still exists.`,
        tone: "success",
      });
      setPendingRevoke(null);
      officers.reload();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The request failed.";
      toast({ title: "Could not revoke assignment", description: message, tone: "error" });
    } finally {
      setRevoking(false);
    }
  }

  if (officers.loading && !officers.data) {
    return (
      <div className="mt-6">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (officers.error && !officers.data) {
    return (
      <div className="mt-6 space-y-4">
        <ErrorBanner message={officers.error} onRetry={() => officers.reload()} />
      </div>
    );
  }

  return (
    <>
      <div className="mt-6">
        <Section
          title="Current officers"
          description="Every officer account and the election each one operates. Officers are scoped to exactly one election — revoke an assignment to take away access without deleting the account."
          actions={
            <Button variant="outline" size="dense" className="w-auto" onClick={() => officers.reload()}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Refresh
            </Button>
          }
        >
          {rows.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />}
              title="No officer accounts yet"
              description="Register an officer above; they appear here with the election they operate once one is established or assigned."
            />
          ) : (
            <ul className="space-y-3">
              {rows.map((officer) => (
                <li
                  key={officer.id}
                  className="rounded-nv-md border border-nv-line bg-nv-surface p-4 shadow-nv-card"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 truncate text-[14px] font-bold text-nv-ink">
                      {officer.full_name || officer.username}
                    </p>
                    <span className="text-[12.5px] text-nv-muted">@{officer.username}</span>
                    <Badge variant={officer.role === "admin" ? "default" : "secondary"} className="text-[11px]">
                      {officer.role}
                    </Badge>
                    <Badge variant={officer.is_active ? "success" : "muted"} className="text-[11px]">
                      {officer.is_active ? "Active" : "Disabled"}
                    </Badge>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[12.5px] text-nv-muted">
                    <span>{officer.email}</span>
                    {officer.joined_at ? <span>· joined {officer.joined_at}</span> : null}
                    {officer.phone_number ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-nv-ink">
                        <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        {officer.phone_number}
                      </span>
                    ) : null}
                  </p>

                  {officer.assignments.length === 0 ? (
                    <p className="mt-3 text-[12.5px] text-nv-muted">
                      No election yet — they will manage the first election they establish, or one assigned on the election&apos;s Edit screen.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {officer.assignments.map((assignment) => (
                        <li
                          key={assignment.id}
                          className="flex flex-wrap items-center gap-2 rounded-lg border border-nv-line/70 bg-nv-bg/50 px-3 py-2"
                        >
                          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-nv-ink">
                            {scopeLabel(assignment.scope)}
                            {assignment.election ? ` · ${assignment.election.title}` : ""}
                            {assignment.organization ? ` · ${assignment.organization.name}` : ""}
                          </span>
                          <Badge variant={assignment.is_active ? "success" : "muted"} className="text-[11px]">
                            {assignment.is_active ? "Active" : "Revoked"}
                          </Badge>
                          {assignment.is_active ? (
                            <Button
                              variant="outline"
                              size="dense"
                              className="w-auto border-nv-danger/40 text-nv-danger hover:bg-nv-danger/10"
                              onClick={() => setPendingRevoke(assignment)}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                              Revoke
                            </Button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <AlertDialog
        open={pendingRevoke !== null}
        onOpenChange={(open) => {
          if (!open && !revoking) setPendingRevoke(null);
        }}
        title="Revoke officer assignment?"
        description={
          pendingRevoke
            ? `${pendingRevoke.officer.full_name || pendingRevoke.officer.username} will immediately lose this scope. Their account stays active.`
            : undefined
        }
        confirmLabel="Revoke assignment"
        cancelLabel="Keep it"
        tone="destructive"
        loading={revoking}
        onConfirm={() => void revoke()}
      />
    </>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-nv-md border border-nv-danger/40 bg-nv-danger/10 p-4"
    >
      <p className="min-w-0 flex-1 text-[13.5px] text-nv-danger">{message}</p>
      <Button variant="outline" size="dense" className="w-auto" onClick={onRetry}>
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Dismiss
      </Button>
    </div>
  );
}
