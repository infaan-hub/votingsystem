"use client";

import { useState } from "react";
import { CheckCircle2, RefreshCw, ShieldCheck, Trash2, UserPlus } from "lucide-react";

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
import { Textarea } from "@/src/components/ui/textarea";
import { useToast } from "@/src/components/ui/toast";
import { apiRequest, useResource, useToken, type Resource } from "../_shared";

type UserOption = {
  id: number;
  username: string;
  full_name: string;
  email: string;
  role: string;
};

type ElectionOption = { id: number; title: string; status: string };

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
  assignments: Assignment[];
};

type Mode = "existing" | "new";

const SCOPE_OPTIONS = [
  {
    value: "all",
    label: "All elections",
    description: "The officer can manage every election in the system.",
  },
  {
    value: "election",
    label: "One election",
    description: "The officer only manages the election you choose below.",
  },
  {
    value: "organization",
    label: "One organization",
    description: "Unavailable: this API has no organization list, so an organization id cannot be chosen here.",
    disabled: true,
  },
];

export default function AddElectionOfficerPage() {
  return (
    <>
      <PageHero
        eyebrow="Administration"
        title="Election officers"
        description="Grant officer access, or create a fresh officer account with an invitation-only password. Officers also manage any election they created themselves."
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
  const elections = useResource<ElectionOption[]>(
    (authToken) => apiRequest<ElectionOption[]>(authToken, "/api/admin/elections"),
    [],
  );

  const [mode, setMode] = useState<Mode>("existing");
  const [existingUserId, setExistingUserId] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [scope, setScope] = useState("all");
  const [electionId, setElectionId] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<Assignment | null>(null);

  const userRows = users.data?.users ?? [];
  const electionRows = elections.data ?? [];

  const listLoading = (users.loading && !users.data) || (elections.loading && !elections.data);
  const listError =
    users.error && !users.data
      ? users.error
      : elections.error && !elections.data
        ? elections.error
        : "";

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
    if (scope === "election" && !electionId) {
      next.electionId = "Choose the election this officer will manage.";
    }
    return next;
  }

  function resetForm() {
    setMode("existing");
    setExistingUserId("");
    setUsername("");
    setEmail("");
    setFullName("");
    setScope("all");
    setElectionId("");
    setNote("");
    setErrors({});
    setCreated(null);
  }

  async function submit() {
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length) return;

    const body: Record<string, unknown> = { scope };
    if (note.trim()) body.note = note.trim();
    if (scope === "election") body.election_id = Number(electionId);
    if (mode === "existing") {
      body.user_id = Number(existingUserId);
    } else {
      body.username = username.trim();
      body.email = email.trim();
      if (fullName.trim()) body.full_name = fullName.trim();
    }

    setSubmitting(true);
    try {
      const assignment = await apiRequest<Assignment>(token, "/api/admin/officers", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setCreated(assignment);
      onCreated?.();
      toast({ title: "Officer assignment created", tone: "success" });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The request failed.";
      setErrors({ form: message });
      toast({ title: "Could not add officer", description: message, tone: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  if (listLoading) {
    return (
      <div className="mt-6 space-y-3">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (listError) {
    return (
      <div className="mt-6 space-y-4">
        <ErrorBanner message={listError} onRetry={() => { users.reload(); elections.reload(); }} />
        <EmptyState
          icon={<UserPlus className="h-5 w-5" aria-hidden="true" />}
          title="Form data could not be loaded"
          description="The officer form needs the user and election lists before it can accept a submission."
          action={
            <Button
              size="dense"
              className="w-auto"
              onClick={() => {
                users.reload();
                elections.reload();
              }}
            >
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
        <Section title="Assignment created" description="The officer now has access with this scope.">
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-nv-md border border-success/30 bg-success/15 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
              <div className="min-w-0 space-y-1">
                <p className="text-[14px] font-semibold text-nv-ink">
                  {created.officer.full_name || created.officer.username} is now an officer
                </p>
                <p className="text-[13px] text-nv-text">
                  Scope: {scopeLabel(created.scope)}
                  {created.election ? ` · ${created.election.title}` : ""}
                  {created.organization ? ` · ${created.organization.name}` : ""}
                </p>
                <p className="text-[12.5px] text-nv-muted">
                  Account {created.officer.username} · {created.officer.email} · created{" "}
                  {created.created_at ?? "just now"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="dense" className="w-auto" onClick={resetForm}>
                Add another officer
              </Button>
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
        </div>
      </Section>

      <Section
        title="Scope"
        description="Scope decides which elections the officer can manage."
      >
        <div className="space-y-4">
          <RadioGroup
            label="Assignment scope"
            name="officer-scope"
            variant="card"
            value={scope}
            onChange={(value) => {
              setScope(value);
              setErrors({});
            }}
            options={SCOPE_OPTIONS}
            error={errors.scope}
            hint="Organization scope is disabled because this API exposes no way to list organizations."
          />

          {scope === "election" ? (
            <div className="max-w-md">
              <Select
                label="Election"
                value={electionId}
                onChange={(event) => setElectionId(event.target.value)}
                options={electionRows.map((row) => ({
                  value: String(row.id),
                  label: `${row.title} (${row.status})`,
                }))}
                placeholder="Choose an election"
                error={errors.electionId}
              />
            </div>
          ) : null}

          <div className="max-w-2xl">
            <Textarea
              label="Note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional context stored with the assignment"
              hint="Stored on the assignment and visible to administrators."
            />
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
          {submitting ? "Adding…" : "Add officer"}
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
          description="Every officer account and its scoped assignments. Revoking an assignment removes that scope; the account itself stays active."
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
              description="Officers appear here once an account is granted officer access above."
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
                  <p className="mt-1 text-[12.5px] text-nv-muted">
                    {officer.email}
                    {officer.joined_at ? ` · joined ${officer.joined_at}` : ""}
                  </p>

                  {officer.assignments.length === 0 ? (
                    <p className="mt-3 text-[12.5px] text-nv-muted">
                      No scoped assignments — manages only elections they created themselves.
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
