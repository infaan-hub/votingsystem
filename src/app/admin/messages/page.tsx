"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Mail, MailOpen, RefreshCw, Send } from "lucide-react";

import { RequireRole } from "@/src/components/require-role";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Dialog } from "@/src/components/ui/dialog";
import { EmptyState } from "@/src/components/ui/empty-state";
import { FilterSelect, FiltersToolbar, SearchInput } from "@/src/components/ui/filters";
import { Input } from "@/src/components/ui/input";
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
import { Textarea } from "@/src/components/ui/textarea";
import { useToast } from "@/src/components/ui/toast";
import { apiRequest, displayDate, useResource, useToken } from "../_shared";

type SenderInfo = {
  id: number;
  username: string;
  role: string;
  full_name: string;
};

type MessageRow = {
  id: number;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: string;
  created_at: string | null;
  updated_at: string | null;
  sender: SenderInfo | null;
  reply: string | null;
  replied_at: string | null;
};

type ComposeUser = {
  id: number;
  username: string;
  full_name: string;
  email: string;
  role: string;
  is_active?: boolean | null;
};

const STATUS_FILTER_OPTIONS = [
  { value: "NEW", label: "New" },
  { value: "OPEN", label: "Open" },
  { value: "RESOLVED", label: "Resolved" },
];

const SENDER_FILTER_OPTIONS = [
  { value: "voter", label: "Voters" },
  { value: "officer", label: "Election officers" },
  { value: "guest", label: "Guests (no account)" },
];

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "success" }> = {
  NEW: { label: "New", variant: "default" },
  OPEN: { label: "Open", variant: "secondary" },
  RESOLVED: { label: "Resolved", variant: "success" },
};

const AUDIENCE_OPTIONS = [
  { value: "everyone", label: "All voters and officers" },
  { value: "voter", label: "All voters" },
  { value: "officer", label: "All election officers" },
  { value: "specific", label: "Choose people…" },
];

const MAX_RECIPIENTS = 500;
const MAX_VISIBLE_PEOPLE = 30;
const REPLY_LIMIT = 4000;
const TITLE_LIMIT = 180;
const BODY_LIMIT = 1000;

export default function AdminMessagesPage() {
  return (
    <>
      <PageHero
        eyebrow="Administration"
        title="Messages"
        description="Messages voters, election officers and visitors send to the election office — reply from here, or send a notice to voters and officers."
      />
      <RequireRole role="admin">
        <MessagesBody />
      </RequireRole>
    </>
  );
}

function MessagesBody() {
  const token = useToken();
  const { toast } = useToast();
  const { data, error, loading, reload } = useResource<MessageRow[]>(
    (authToken) => apiRequest<MessageRow[]>(authToken, "/api/admin/contacts"),
    [],
  );

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [senderFilter, setSenderFilter] = useState("");
  const [detail, setDetail] = useState<MessageRow | null>(null);
  const [replyText, setReplyText] = useState("");
  const [savingAction, setSavingAction] = useState<"" | "reply" | "status">("");

  const [composeOpen, setComposeOpen] = useState(false);
  const [audience, setAudience] = useState("everyone");
  const [peopleQuery, setPeopleQuery] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [composeTitle, setComposeTitle] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [sending, setSending] = useState(false);
  const [people, setPeople] = useState<ComposeUser[] | null>(null);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const peopleRequested = useRef(false);

  const messages = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return messages.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (senderFilter === "guest" && row.sender) return false;
      if (
        (senderFilter === "voter" || senderFilter === "officer") &&
        row.sender?.role !== senderFilter
      ) {
        return false;
      }
      if (!needle) return true;
      return `${row.name} ${row.email} ${row.subject} ${row.message} ${
        row.sender?.username ?? ""
      }`
        .toLowerCase()
        .includes(needle);
    });
  }, [messages, query, statusFilter, senderFilter]);

  const hasFilters = Boolean(query.trim() || statusFilter || senderFilter);
  const newCount = messages.filter((row) => row.status === "NEW").length;

  // The address book is only needed when composing; load it on first open.
  useEffect(() => {
    if (!composeOpen || peopleRequested.current) return;
    peopleRequested.current = true;
    setPeopleLoading(true);
    apiRequest<{ users: ComposeUser[] }>(token, "/api/admin/users")
      .then((payload) => setPeople(payload.users))
      .catch((cause: unknown) => {
        toast({
          title: "Could not load users",
          description: cause instanceof Error ? cause.message : undefined,
          tone: "error",
        });
      })
      .finally(() => setPeopleLoading(false));
  }, [composeOpen, token, toast]);

  const recipients = useMemo(() => {
    const list = people ?? [];
    if (audience === "everyone") return list;
    if (audience === "voter" || audience === "officer") {
      return list.filter((person) => person.role === audience);
    }
    return list.filter((person) => selected.includes(person.id));
  }, [people, audience, selected]);

  const peopleMatches = useMemo(() => {
    const needle = peopleQuery.trim().toLowerCase();
    const list = [...(people ?? [])].sort((a, b) => a.username.localeCompare(b.username));
    if (!needle) return list;
    return list.filter((person) =>
      `${person.username} ${person.full_name} ${person.email}`.toLowerCase().includes(needle),
    );
  }, [people, peopleQuery]);

  function resetFilters() {
    setQuery("");
    setStatusFilter("");
    setSenderFilter("");
  }

  function openDetail(row: MessageRow) {
    setDetail(row);
    setReplyText("");
  }

  function openCompose() {
    setAudience("everyone");
    setPeopleQuery("");
    setSelected([]);
    setComposeTitle("");
    setComposeBody("");
    setComposeOpen(true);
  }

  async function updateStatus(nextStatus: string) {
    if (!detail) return;
    setSavingAction("status");
    try {
      const updated = await apiRequest<MessageRow>(
        token,
        `/api/admin/contacts/${detail.id}`,
        { method: "PATCH", body: JSON.stringify({ status: nextStatus }) },
      );
      setDetail(updated);
      reload();
      toast({ title: `Marked ${nextStatus.toLowerCase()}`, tone: "success" });
    } catch (cause) {
      toast({
        title: "Status change failed",
        description: cause instanceof Error ? cause.message : undefined,
        tone: "error",
      });
    } finally {
      setSavingAction("");
    }
  }

  async function sendReply() {
    if (!detail) return;
    const reply = replyText.trim();
    if (!reply) return;
    setSavingAction("reply");
    try {
      const updated = await apiRequest<MessageRow>(
        token,
        `/api/admin/contacts/${detail.id}`,
        { method: "PATCH", body: JSON.stringify({ reply }) },
      );
      setDetail(updated);
      setReplyText("");
      reload();
      toast({
        title: "Reply sent",
        description: updated.sender
          ? `@${updated.sender.username} received it in their notifications.`
          : "This sender has no account — deliver the reply by email.",
        tone: "success",
      });
    } catch (cause) {
      toast({
        title: "Reply failed",
        description: cause instanceof Error ? cause.message : undefined,
        tone: "error",
      });
    } finally {
      setSavingAction("");
    }
  }

  async function sendMessage() {
    const ids = recipients.map((person) => person.id);
    if (!ids.length) {
      toast({ title: "Choose at least one recipient", tone: "error" });
      return;
    }
    if (ids.length > MAX_RECIPIENTS) {
      toast({
        title: `At most ${MAX_RECIPIENTS} recipients per message`,
        description: "Narrow the audience and try again.",
        tone: "error",
      });
      return;
    }
    setSending(true);
    try {
      const result = await apiRequest<{ recipients?: number }>(token, "/api/notifications", {
        method: "POST",
        body: JSON.stringify({
          recipient_ids: ids,
          title: composeTitle.trim(),
          body: composeBody.trim(),
          category: "admin-message",
          tag: "admin-message",
          target_url: "/contact",
        }),
      });
      const count = result.recipients ?? ids.length;
      toast({
        title: count === 1 ? "Message sent" : `Message sent to ${count} people`,
        tone: "success",
      });
      setComposeOpen(false);
    } catch (cause) {
      toast({
        title: "Message could not be sent",
        description: cause instanceof Error ? cause.message : undefined,
        tone: "error",
      });
    } finally {
      setSending(false);
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
          icon={<Mail className="h-5 w-5" aria-hidden="true" />}
          title="Messages could not be loaded"
          description="The contact-message endpoint did not respond. Retry, or confirm your session is still valid."
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
        title="Inbox"
        description={
          messages.length
            ? `${messages.length} message${messages.length === 1 ? "" : "s"} \u00b7 ${newCount} new`
            : "Messages from the public contact form land here."
        }
        actions={
          <>
            <Button variant="outline" size="dense" className="w-auto" onClick={reload}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Refresh
            </Button>
            <Button size="dense" className="w-auto" onClick={openCompose}>
              <Send className="h-4 w-4" aria-hidden="true" />
              New message
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FiltersToolbar onReset={resetFilters} hasFilters={hasFilters}>
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search sender, subject or text"
              label="Search messages"
            />
            <FilterSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={STATUS_FILTER_OPTIONS}
              label="Filter by status"
              placeholder="Any status"
            />
            <FilterSelect
              value={senderFilter}
              onChange={setSenderFilter}
              options={SENDER_FILTER_OPTIONS}
              label="Filter by sender"
              placeholder="Anyone"
            />
          </FiltersToolbar>

          {messages.length === 0 ? (
            <EmptyState
              icon={<Mail className="h-5 w-5" aria-hidden="true" />}
              title="No messages yet"
              description="When a voter, officer or visitor writes through the contact page, the message appears here."
              action={
                <Button size="dense" className="w-auto" onClick={reload}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Refresh
                </Button>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No messages match your filters"
              description="Nothing matches the current search and filters."
              action={
                <Button variant="outline" size="dense" className="w-auto" onClick={resetFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>From</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => {
                    const badge = STATUS_BADGE[row.status] ?? {
                      label: row.status,
                      variant: "secondary" as const,
                    };
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="max-w-[220px]">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-[13px] font-semibold text-nv-ink">
                              {row.name}
                            </span>
                            {row.sender ? (
                              <Badge variant={row.sender.role === "officer" ? "secondary" : "muted"}>
                                {row.sender.role === "officer" ? "Officer" : "Voter"}
                              </Badge>
                            ) : (
                              <Badge variant="muted">Guest</Badge>
                            )}
                          </div>
                          <p className="truncate text-[12.5px] text-nv-muted">{row.email}</p>
                        </TableCell>
                        <TableCell className="max-w-[320px]">
                          <p className="truncate text-[13px] font-semibold text-nv-ink">
                            {row.subject}
                          </p>
                          <p className="truncate text-[12.5px] text-nv-muted">{row.message}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                          {row.reply ? (
                            <p className="mt-1 text-[12px] text-nv-muted">Replied</p>
                          ) : null}
                        </TableCell>
                        <TableCell className="nums-tabular whitespace-nowrap text-[12.5px]">
                          {displayDate(row.created_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="dense"
                              className="w-auto"
                              onClick={() => openDetail(row)}
                            >
                              <MailOpen className="h-4 w-4" aria-hidden="true" />
                              Open
                            </Button>
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
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open && savingAction === "") setDetail(null);
        }}
        title={detail?.subject ?? "Message"}
        description={detail ? `From ${detail.name} \u00b7 ${displayDate(detail.created_at)}` : undefined}
      >
        {detail ? (
          <div className="space-y-4 pb-2">
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="font-semibold text-nv-ink">{detail.name}</span>
              <a
                href={`mailto:${detail.email}`}
                className="text-nv-primary underline-offset-2 hover:underline"
              >
                {detail.email}
              </a>
              {detail.sender ? (
                <Badge variant={detail.sender.role === "officer" ? "secondary" : "muted"}>
                  {detail.sender.role === "officer" ? "Officer" : "Voter"} @{detail.sender.username}
                </Badge>
              ) : (
                <Badge variant="muted">Guest — no account</Badge>
              )}
            </div>

            <p className="whitespace-pre-line rounded-nv-md border border-nv-line bg-nv-bg p-3.5 text-[13.5px] leading-relaxed text-nv-ink">
              {detail.message}
            </p>

            {detail.reply ? (
              <div className="rounded-nv-md border border-nv-line p-3.5">
                <p className="text-[12px] font-semibold uppercase tracking-[0.6px] text-nv-muted">
                  Reply sent {displayDate(detail.replied_at)}
                </p>
                <p className="mt-1.5 whitespace-pre-line text-[13.5px] leading-relaxed text-nv-ink">
                  {detail.reply}
                </p>
              </div>
            ) : null}

            {detail.sender ? null : (
              <p className="rounded-nv-md border border-nv-line bg-nv-bg p-3 text-[12.5px] text-nv-muted">
                This sender wrote in without signing in, so in-app delivery is not possible. The
                reply is stored here — deliver it by email.
              </p>
            )}

            <Textarea
              label={detail.reply ? "Send another reply" : "Reply"}
              value={replyText}
              onChange={(event) => setReplyText(event.target.value)}
              placeholder="Write your reply…"
              maxLength={REPLY_LIMIT}
              hint="Replies reach the sender's notification bell (and push) when they have an account."
            />
          </div>
        ) : null}
        footer={
          detail ? (
            <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
              {detail.status !== "OPEN" ? (
                <Button
                  variant="outline"
                  size="dense"
                  className="w-auto"
                  disabled={savingAction !== ""}
                  onClick={() => void updateStatus("OPEN")}
                >
                  Mark open
                </Button>
              ) : null}
              {detail.status !== "RESOLVED" ? (
                <Button
                  variant="outline"
                  size="dense"
                  className="w-auto"
                  disabled={savingAction !== ""}
                  onClick={() => void updateStatus("RESOLVED")}
                >
                  Mark resolved
                </Button>
              ) : null}
              <Button
                size="dense"
                className="w-auto"
                disabled={savingAction !== "" || !replyText.trim()}
                onClick={() => void sendReply()}
              >
                {savingAction === "reply" ? "Sending…" : "Send reply"}
              </Button>
            </div>
          ) : null
        }
      </Dialog>

      <Dialog
        open={composeOpen}
        onOpenChange={(open) => {
          if (!open && !sending) setComposeOpen(false);
        }}
        title="Send a message"
        description="Each recipient gets it in their notification bell, and by push when they have it enabled."
      >
        <div className="space-y-4 pb-2">
          <Select
            label="Recipients"
            value={audience}
            onChange={(event) => setAudience(event.target.value)}
            options={AUDIENCE_OPTIONS}
          />

          {audience === "specific" ? (
            <div className="space-y-2">
              <Input
                label="Search people"
                value={peopleQuery}
                onChange={(event) => setPeopleQuery(event.target.value)}
                placeholder="Name, username or email"
              />
              {peopleLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                <>
                  <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-nv-line p-2">
                    {peopleMatches.length === 0 ? (
                      <p className="p-2 text-[13px] text-nv-muted">No accounts match.</p>
                    ) : (
                      peopleMatches.slice(0, MAX_VISIBLE_PEOPLE).map((person) => (
                        <label
                          key={person.id}
                          className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] hover:bg-nv-bg"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[color:var(--nv-primary)]"
                            checked={selected.includes(person.id)}
                            onChange={() =>
                              setSelected((prev) =>
                                prev.includes(person.id)
                                  ? prev.filter((id) => id !== person.id)
                                  : [...prev, person.id],
                              )
                            }
                          />
                          <span className="min-w-0 flex-1 truncate">
                            <span className="font-semibold text-nv-ink">
                              {person.full_name || person.username}
                            </span>{" "}
                            <span className="text-nv-muted">@{person.username}</span>
                          </span>
                          <Badge variant={person.role === "officer" ? "secondary" : "muted"}>
                            {person.role === "officer" ? "Officer" : "Voter"}
                          </Badge>
                        </label>
                      ))
                    )}
                  </div>
                  {peopleMatches.length > MAX_VISIBLE_PEOPLE ? (
                    <p className="text-[12px] text-nv-muted">
                      Showing the first {MAX_VISIBLE_PEOPLE} of {peopleMatches.length} matches —
                      type to narrow the list.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          <Input
            label="Title"
            required
            value={composeTitle}
            onChange={(event) => setComposeTitle(event.target.value)}
            maxLength={TITLE_LIMIT}
            placeholder="e.g. Voting closes tomorrow"
          />
          <Textarea
            label="Message"
            required
            value={composeBody}
            onChange={(event) => setComposeBody(event.target.value)}
            maxLength={BODY_LIMIT}
            placeholder="Write the message…"
          />
          <p className="text-[12.5px] text-nv-muted">
            {recipients.length} recipient{recipients.length === 1 ? "" : "s"} selected.
          </p>
        </div>
        footer={
          <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
            <Button
              variant="outline"
              size="dense"
              className="w-auto"
              onClick={() => setComposeOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="dense"
              className="w-auto"
              disabled={
                sending ||
                !composeTitle.trim() ||
                !composeBody.trim() ||
                recipients.length === 0 ||
                recipients.length > MAX_RECIPIENTS
              }
              onClick={() => void sendMessage()}
            >
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>
        }
      </Dialog>
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
