"use client";

import { useMemo, useState } from "react";
import { RefreshCw, Users } from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { RequireRole } from "@/src/components/require-role";
import { AlertDialog, Dialog } from "@/src/components/ui/dialog";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
import { FilterSelect, FiltersToolbar, SearchInput } from "@/src/components/ui/filters";
import { PageHero } from "@/src/components/page-hero";
import { Section } from "@/src/components/ui/section";
import { Select } from "@/src/components/ui/select";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { Tooltip } from "@/src/components/ui/tooltip";
import { useToast } from "@/src/components/ui/toast";
import { apiRequest, displayDate, useResource, useToken } from "../_shared";

type UserRow = {
  id: number;
  username: string;
  full_name: string;
  email: string;
  role: string;
  department?: { id: number; name: string } | null;
  section?: { id: number; name: string } | null;
  registration_number?: string | null;
  staff_id?: string | null;
  auth_provider?: string;
  is_active?: boolean | null;
  created_at?: string | null;
  joined_at?: string | null;
};

const ROLE_OPTIONS = [
  { value: "voter", label: "Voter" },
  { value: "officer", label: "Election officer" },
];

const ROLE_FILTER_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "officer", label: "Election officer" },
  { value: "voter", label: "Voter" },
];

const OWN_ROLE_API =
  "You are signed in as this account, so its role cannot be changed from this screen.";

const OWN_STATUS_API =
  "You are signed in as this account, so it cannot be deactivated or deleted from this screen.";

export default function AdminUsersPage() {
  return (
    <>
      <PageHero
        eyebrow="Administration"
        title="Users"
        description="Search voter and election officer accounts, change roles, activate or deactivate accounts, and delete them permanently."
      />
      <RequireRole role="admin">
        <UsersBody />
      </RequireRole>
    </>
  );
}

function UsersBody() {
  const token = useToken();
  const { user } = useApp();
  const { toast } = useToast();
  const { data, error, loading, reload } = useResource<{ users: UserRow[] }>(
    (authToken) => apiRequest<{ users: UserRow[] }>(authToken, "/api/admin/users"),
    [],
  );

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [roleTarget, setRoleTarget] = useState<UserRow | null>(null);
  const [nextRole, setNextRole] = useState("");
  const [roleSaving, setRoleSaving] = useState(false);
  const [statusTarget, setStatusTarget] = useState<UserRow | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const users = data?.users ?? [];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users.filter((row) => {
      if (roleFilter && row.role !== roleFilter) return false;
      if (activeFilter === "active" && row.is_active !== true) return false;
      if (activeFilter === "inactive" && row.is_active !== false) return false;
      if (!needle) return true;
      return `${row.username} ${row.full_name} ${row.email}`.toLowerCase().includes(needle);
    });
  }, [users, query, roleFilter, activeFilter]);

  const hasFilters = Boolean(query.trim() || roleFilter || activeFilter);

  function openRoleDialog(row: UserRow) {
    setRoleTarget(row);
    setNextRole(row.role);
  }

  async function saveRole() {
    if (!roleTarget || !nextRole) return;
    setRoleSaving(true);
    try {
      await apiRequest(token, `/api/admin/users/${roleTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role: nextRole }),
      });
      toast({ title: `Role updated to ${nextRole}`, tone: "success" });
      setRoleTarget(null);
      await reload();
    } catch (cause) {
      toast({
        title: "Role change failed",
        description: cause instanceof Error ? cause.message : undefined,
        tone: "error",
      });
    } finally {
      setRoleSaving(false);
    }
  }

  function confirmStatusToggle(row: UserRow) {
    setStatusTarget(row);
  }

  async function saveStatus() {
    if (!statusTarget) return;
    const nextActive = statusTarget.is_active === false;
    setStatusSaving(true);
    try {
      await apiRequest(token, `/api/admin/users/${statusTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: nextActive }),
      });
      toast({
        title: nextActive ? "Account activated" : "Account deactivated",
        description: `@${statusTarget.username} can ${nextActive ? "now" : "no longer"} sign in.`,
        tone: "success",
      });
      setStatusTarget(null);
      await reload();
    } catch (cause) {
      toast({
        title: "Status change failed",
        description: cause instanceof Error ? cause.message : undefined,
        tone: "error",
      });
    } finally {
      setStatusSaving(false);
    }
  }

  async function deleteUser() {
    if (!deleteTarget) return;
    setDeleteSaving(true);
    try {
      await apiRequest(token, `/api/admin/users/${deleteTarget.id}`, {
        method: "DELETE",
      });
      toast({
        title: "Account deleted",
        description: `@${deleteTarget.username} was permanently removed.`,
        tone: "success",
      });
      setDeleteTarget(null);
      await reload();
    } catch (cause) {
      toast({
        title: "Delete failed",
        description: cause instanceof Error ? cause.message : undefined,
        tone: "error",
      });
    } finally {
      setDeleteSaving(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="mt-6 space-y-3">
        <Skeleton className="h-11 w-full max-w-md" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mt-6 space-y-4">
        <ErrorBanner message={error} onRetry={reload} />
        <EmptyState
          icon={<Users className="h-5 w-5" aria-hidden="true" />}
          title="Users could not be loaded"
          description="The admin users endpoint did not respond. Retry, or confirm your session is still valid."
          action={
            <Button size="dense" className="w-auto" onClick={reload}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {error ? <ErrorBanner message={error} onRetry={reload} /> : null}

      <Section
        title="Accounts"
        description="Administrators are managed separately and do not appear in this list."
      >
        <div className="space-y-4">
          <FiltersToolbar
            onReset={() => {
              setQuery("");
              setRoleFilter("");
              setActiveFilter("");
            }}
            hasFilters={hasFilters}
          >
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search username, name or email"
              label="Search users"
            />
            <FilterSelect
              value={roleFilter}
              onChange={setRoleFilter}
              options={ROLE_FILTER_OPTIONS}
              label="Filter by role"
              placeholder="All roles"
            />
            <FilterSelect
              value={activeFilter}
              onChange={setActiveFilter}
              options={[
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
              label="Filter by account status"
              placeholder="Any status"
            />
          </FiltersToolbar>

          {users.length === 0 ? (
            <EmptyState
              icon={<Users className="h-5 w-5" aria-hidden="true" />}
              title="No accounts to show"
              description="The admin API returned no non-administrator accounts. Accounts appear here once people register or are created."
              action={
                <Button variant="outline" size="dense" className="w-auto" onClick={reload}>
                  Refresh
                </Button>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No users match your filters"
              description="Nothing matches the current search and filters."
              action={
                <Button
                  variant="outline"
                  size="dense"
                  className="w-auto"
                  onClick={() => {
                    setQuery("");
                    setRoleFilter("");
                    setActiveFilter("");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Full name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => {
                    const isSelf = user ? row.id === user.id : false;
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="text-[13px] font-semibold text-nv-ink">
                          {row.username}
                        </TableCell>
                        <TableCell className="text-[13px]">{row.full_name || "—"}</TableCell>
                        <TableCell className="text-[13px] text-nv-muted">{row.email}</TableCell>
                        <TableCell>
                          <Badge variant={row.role === "officer" ? "secondary" : "muted"}>
                            {row.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={row.is_active === false ? "muted" : "success"}>
                            {row.is_active === false ? "Inactive" : "Active"}
                          </Badge>
                        </TableCell>
                        <TableCell className="nums-tabular whitespace-nowrap text-[12.5px]">
                          {displayDate(row.created_at ?? row.joined_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {isSelf ? (
                              <Tooltip content={OWN_ROLE_API}>
                                <span tabIndex={0}>
                                  <Button variant="outline" size="dense" className="w-auto" disabled>
                                    Change role
                                  </Button>
                                </span>
                              </Tooltip>
                            ) : (
                              <Button
                                variant="outline"
                                size="dense"
                                className="w-auto"
                                onClick={() => openRoleDialog(row)}
                              >
                                Change role
                              </Button>
                            )}
                            {isSelf ? (
                              <Tooltip content={OWN_STATUS_API}>
                                <span tabIndex={0}>
                                  <Button variant="subtle" size="dense" className="w-auto" disabled>
                                    {row.is_active === false ? "Activate" : "Deactivate"}
                                  </Button>
                                </span>
                              </Tooltip>
                            ) : (
                              <Button
                                variant="subtle"
                                size="dense"
                                className="w-auto"
                                onClick={() => confirmStatusToggle(row)}
                              >
                                {row.is_active === false ? "Activate" : "Deactivate"}
                              </Button>
                            )}
                            {isSelf ? (
                              <Tooltip content={OWN_STATUS_API}>
                                <span tabIndex={0}>
                                  <Button variant="outline" size="dense" className="w-auto" disabled>
                                    Delete
                                  </Button>
                                </span>
                              </Tooltip>
                            ) : (
                              <Button
                                variant="outline"
                                size="dense"
                                className="w-auto border-nv-danger/40 text-nv-danger hover:bg-nv-danger/10"
                                onClick={() => setDeleteTarget(row)}
                              >
                                Delete
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </Section>

      <Dialog
        open={roleTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRoleTarget(null);
        }}
        title={roleTarget ? `Change role for @${roleTarget.username}` : "Change role"}
        description="Set this account to voter or election officer. Promoting an account to administrator is not supported here."
      >
        <div className="space-y-4 pb-2">
          <Select
            label="Role"
            value={nextRole}
            onChange={(event) => setNextRole(event.target.value)}
            options={ROLE_OPTIONS}
            placeholder="Choose a role"
            hint={
              roleTarget && nextRole === roleTarget.role
                ? "This account already has this role."
                : undefined
            }
          />
        </div>
        footer={
          <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
            <Button variant="outline" size="dense" className="w-auto" onClick={() => setRoleTarget(null)}>
              Cancel
            </Button>
            <Button
              size="dense"
              className="w-auto"
              disabled={roleSaving || !nextRole || nextRole === roleTarget?.role}
              onClick={() => void saveRole()}
            >
              {roleSaving ? "Saving…" : "Save role"}
            </Button>
          </div>
        }
      </Dialog>

      <AlertDialog
        open={statusTarget !== null}
        onOpenChange={(open) => {
          if (!open && !statusSaving) setStatusTarget(null);
        }}
        title={
          statusTarget?.is_active === false ? "Activate this account?" : "Deactivate this account?"
        }
        description={
          statusTarget
            ? statusTarget.is_active === false
              ? `@${statusTarget.username} will be able to sign in again immediately.`
              : `@${statusTarget.username} will be signed out and blocked from signing in until reactivated.`
            : undefined
        }
        confirmLabel={statusTarget?.is_active === false ? "Activate" : "Deactivate"}
        cancelLabel="Cancel"
        tone={statusTarget?.is_active === false ? "default" : "destructive"}
        loading={statusSaving}
        onConfirm={() => void saveStatus()}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleteSaving) setDeleteTarget(null);
        }}
        title="Delete this account permanently?"
        description={
          deleteTarget
            ? `@${deleteTarget.username} (${deleteTarget.full_name || deleteTarget.email}) will be removed for good. Ballots already cast stay anonymised — deleting the account cannot undo or link them.`
            : undefined
        }
        confirmLabel="Delete account"
        cancelLabel="Keep account"
        tone="destructive"
        loading={deleteSaving}
        onConfirm={() => void deleteUser()}
      />
    </div>
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
        Retry
      </Button>
    </div>
  );
}
