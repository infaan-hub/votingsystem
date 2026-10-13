"use client";

import { useMemo, useState } from "react";
import { RefreshCw, ScrollText } from "lucide-react";

import { RequireRole } from "@/src/components/require-role";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Dialog } from "@/src/components/ui/dialog";
import { EmptyState } from "@/src/components/ui/empty-state";
import { FilterSelect, FiltersToolbar, SearchInput } from "@/src/components/ui/filters";
import { PageHero } from "@/src/components/page-hero";
import { Pagination } from "@/src/components/ui/pagination";
import { Section } from "@/src/components/ui/section";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { apiRequest, displayDate, useResource } from "../_shared";

type Actor = { id: number; username: string; full_name: string } | null;

type AuditRow = {
  id: number;
  action: string;
  entity_type: string;
  entity_id: number | null;
  summary: string;
  detail?: unknown;
  ip_address: string | null;
  created_at: string | null;
  actor: Actor;
};

type AuditPage = { total: number; count: number; results: AuditRow[] };

const PAGE_SIZE = 25;

const ENTITY_OPTIONS = [
  { value: "Election", label: "Election" },
  { value: "ElectionRequest", label: "Election request" },
  { value: "Campaign", label: "Campaign" },
  { value: "ContactMessage", label: "Contact message" },
  { value: "OfficerAssignment", label: "Officer assignment" },
];

export default function AdminAuditLogsPage() {
  return (
    <>
      <PageHero
        eyebrow="Administration"
        title="Audit logs"
        description="Append-only record of administrative actions. Entries are written by server code alone, so this screen is read-only."
      />
      <RequireRole role="admin">
        <AuditBody />
      </RequireRole>
    </>
  );
}

function AuditBody() {
  const [actionInput, setActionInput] = useState("");
  const [entityType, setEntityType] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AuditRow | null>(null);

  const params = useMemo(() => {
    const next = new URLSearchParams();
    if (actionInput.trim()) next.set("action", actionInput.trim());
    if (entityType) next.set("entity_type", entityType);
    next.set("limit", String(PAGE_SIZE));
    next.set("offset", String((page - 1) * PAGE_SIZE));
    return next.toString();
  }, [actionInput, entityType, page]);

  const { data, error, loading, reload } = useResource<AuditPage>(
    (authToken) => apiRequest<AuditPage>(authToken, `/api/admin/audit-logs?${params}`),
    [params],
  );

  const rows = data?.results ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(actionInput.trim() || entityType);

  function resetFilters() {
    setActionInput("");
    setEntityType("");
    setPage(1);
  }

  if (loading && !data) {
    return (
      <div className="mt-6 space-y-3">
        <Skeleton className="h-11 w-full max-w-md" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mt-6 space-y-4">
        <ErrorBanner message={error} onRetry={reload} />
        <EmptyState
          icon={<ScrollText className="h-5 w-5" aria-hidden="true" />}
          title="Audit logs could not be loaded"
          description="The audit endpoint did not respond. Retry, or confirm your session is still valid."
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
        title="Activity"
        description={`Newest first. ${total.toLocaleString()} entr${total === 1 ? "y" : "ies"} match the current filters.`}
      >
        <div className="space-y-4">
          <FiltersToolbar onReset={resetFilters} hasFilters={hasFilters}>
            <SearchInput
              value={actionInput}
              onChange={(value) => {
                setActionInput(value);
                setPage(1);
              }}
              placeholder="Search action, e.g. admin.campaign"
              label="Filter by action"
            />
            <FilterSelect
              value={entityType}
              onChange={(value) => {
                setEntityType(value);
                setPage(1);
              }}
              options={ENTITY_OPTIONS}
              label="Filter by entity type"
              placeholder="All entity types"
            />
            {loading && data ? (
              <span className="inline-flex h-11 items-center gap-1.5 text-[12.5px] text-nv-muted">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Refreshing
              </span>
            ) : null}
          </FiltersToolbar>

          {rows.length === 0 ? (
            <EmptyState
              icon={<ScrollText className="h-5 w-5" aria-hidden="true" />}
              title={hasFilters ? "No entries match your filters" : "No audit entries yet"}
              description={
                hasFilters
                  ? "Nothing matches the current action and entity filters."
                  : "Administrative actions are recorded here as they happen."
              }
              action={
                hasFilters ? (
                  <Button variant="outline" size="dense" className="w-auto" onClick={resetFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <Button variant="outline" size="dense" className="w-auto" onClick={reload}>
                    Refresh
                  </Button>
                )
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Summary</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead className="text-right">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="nums-tabular whitespace-nowrap text-[12.5px] text-nv-muted">
                          {displayDate(row.created_at)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="muted">{row.action}</Badge>
                        </TableCell>
                        <TableCell className="text-[13px]">
                          {row.entity_type || "—"}
                          {row.entity_id !== null ? (
                            <span className="ml-1 text-[12px] text-nv-muted">#{row.entity_id}</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="max-w-sm text-[13px] text-nv-text">
                          {row.summary}
                        </TableCell>
                        <TableCell className="text-[13px]">
                          {row.actor ? (
                            <span className="space-y-0.5">
                              <span className="block">{row.actor.full_name || row.actor.username}</span>
                              <span className="block text-[12px] text-nv-muted">
                                @{row.actor.username}
                              </span>
                            </span>
                          ) : (
                            <span className="text-nv-muted">System</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            <Button
                              variant="outline"
                              size="dense"
                              className="w-auto"
                              onClick={() => setDetail(row)}
                            >
                              View
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Pagination
                page={page}
                pageCount={pageCount}
                onPageChange={setPage}
                total={total}
                pageSize={PAGE_SIZE}
              />
            </>
          )}
        </div>
      </Section>

      <Dialog
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
        title={detail ? detail.action : "Audit entry"}
        description={detail ? displayDate(detail.created_at) : undefined}
      >
        {detail ? (
          <div className="space-y-5 pb-2">
            <KeyValueList
              items={[
                { label: "Entity", value: `${detail.entity_type || "—"}${detail.entity_id !== null ? ` #${detail.entity_id}` : ""}` },
                { label: "Actor", value: detail.actor ? `${detail.actor.full_name || detail.actor.username} (@${detail.actor.username})` : "System" },
                { label: "IP address", value: detail.ip_address || "—" },
                { label: "Recorded", value: displayDate(detail.created_at) },
              ]}
            />

            <div className="space-y-2">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-nv-muted">
                Summary
              </p>
              <p className="text-[13.5px] leading-relaxed text-nv-text">{detail.summary}</p>
            </div>

            <div className="space-y-2">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-nv-muted">
                Detail payload
              </p>
              {detail.detail && Object.keys(detail.detail as object).length ? (
                <pre className="max-h-64 overflow-auto rounded-nv-md border border-nv-line bg-nv-canvas p-3 text-[12px] leading-relaxed text-nv-text">
                  {JSON.stringify(detail.detail, null, 2)}
                </pre>
              ) : (
                <p className="text-[13.5px] text-nv-muted">No structured detail recorded.</p>
              )}
            </div>
          </div>
        ) : null}
        footer={
          <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
            <Button variant="outline" size="dense" className="w-auto" onClick={() => setDetail(null)}>
              Close
            </Button>
          </div>
        }
      </Dialog>
    </div>
  );
}

function KeyValueList({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0 space-y-1">
          <dt className="text-[12px] font-semibold uppercase tracking-wide text-nv-muted">
            {item.label}
          </dt>
          <dd className="break-words text-[13.5px] text-nv-text">{item.value}</dd>
        </div>
      ))}
    </dl>
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
