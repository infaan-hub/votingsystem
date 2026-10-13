import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RefreshCw, Vote } from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
import { LinkButton } from "@/src/components/ui/page-header";
import { Section } from "@/src/components/ui/section";
import { Select } from "@/src/components/ui/select";
import { Skeleton } from "@/src/components/ui/skeleton";

export type ManagedElection = {
  id: number;
  slug: string;
  title: string;
  status: string;
  is_published: boolean;
  visibility: string;
  voting_start_at: string | null;
  voting_end_at: string | null;
  campaign_start_at?: string | null;
  campaign_end_at?: string | null;
  category: { id: number; name: string } | null;
  counts: {
    positions: number;
    candidates: number;
    votes: number;
    published_campaigns: number;
    eligible_voters: number;
  };
};

export function authHeaders(token: string): Record<string, string> {
  return token ? { Authorization: `Token ${token}` } : {};
}

export class ApiCallError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiCallError";
    this.status = status;
    this.body = body;
  }
}

export function humanize(value: string | null | undefined, fallback = "Not set"): string {
  if (!value) return fallback;
  const text = value.replace(/_/g, " ").trim();
  if (!text) return fallback;
  return text
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function displayValue(value: string | null | undefined): string {
  if (!value) return "—";
  const trimmed = value.trim();
  return trimmed || "—";
}

export function windowText(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (!start && !end) return "Not scheduled";
  return `${displayValue(start)} → ${displayValue(end)}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "No video";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function readFieldErrors(body: unknown): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  if (!body || typeof body !== "object" || Array.isArray(body)) return fields;
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim()) {
      fields[key] = [value];
    } else if (Array.isArray(value)) {
      const messages = value.filter(
        (entry): entry is string => typeof entry === "string" && entry.trim() !== "",
      );
      if (messages.length) fields[key] = messages;
    }
  }
  return fields;
}

function messageFromBody(body: unknown, status: number): string {
  const fields = readFieldErrors(body);
  if (fields.detail?.length) return fields.detail[0];
  if (fields.non_field_errors?.length) return fields.non_field_errors[0];
  for (const [key, messages] of Object.entries(fields)) {
    if (messages.length) return `${humanize(key, "Error")}: ${messages[0]}`;
  }
  if (status === 0) {
    return "The request could not be completed. Check your connection and retry.";
  }
  if (status === 401) return "Your session has expired. Sign in again to continue.";
  if (status === 403) return "You do not have permission to complete this action.";
  if (status === 404) return "That record could not be found.";
  if (status >= 500) return "The server could not complete the request. Try again shortly.";
  return `The request failed with status ${status}.`;
}

export function splitError(error: unknown): {
  fields: Record<string, string[]>;
  form: string[];
  message: string;
} {
  const body = error instanceof ApiCallError ? error.body : null;
  const all = readFieldErrors(body);
  const fields: Record<string, string[]> = {};
  const form: string[] = [];
  for (const [key, messages] of Object.entries(all)) {
    if (key === "detail" || key === "non_field_errors") form.push(...messages);
    else fields[key] = messages;
  }
  const message = error instanceof Error ? error.message : "The request could not be completed.";
  return { fields, form, message };
}

export function firstError(
  fields: Record<string, string[]>,
  key: string,
): string | undefined {
  return fields[key]?.[0];
}

export async function apiFetch<T>(
  token: string,
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(authHeaders(token));
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  if (
    init.body !== undefined &&
    init.body !== null &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(url, { ...init, headers });
  } catch {
    throw new ApiCallError(
      "The request could not be completed. Check your connection and retry.",
      0,
      null,
    );
  }

  const raw = await response.text();
  let payload: unknown = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { detail: raw };
    }
  }

  if (!response.ok) {
    throw new ApiCallError(messageFromBody(payload, response.status), response.status, payload);
  }
  return payload as T;
}

export type Resource<T> = {
  data: T | null;
  error: string;
  status: number;
  loading: boolean;
  reload: () => void;
};

export function useResource<T>(
  fetcher: (token: string) => Promise<T>,
  deps: ReadonlyArray<unknown>,
): Resource<T> {
  const token = useApp().token;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(0);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    setError("");
    setStatus(0);
    fetcherRef
      .current(token)
      .then((value) => {
        if (cancelled) return;
        setData(value);
        setError("");
        setStatus(0);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "The request failed.");
        setStatus(cause instanceof ApiCallError ? cause.status : 0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, nonce, ...deps]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  return { data, error, status, loading, reload };
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-nv-md border border-nv-danger/40 bg-nv-danger/10 p-4"
    >
      <p className="min-w-0 flex-1 text-[13.5px] text-nv-danger">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="dense" className="w-auto" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function FormAlert({ messages }: { messages: string[] }) {
  if (!messages.length) return null;
  return (
    <div role="alert" className="rounded-nv-md border border-nv-danger/40 bg-nv-danger/10 p-3">
      <ul className="space-y-1 text-[13px] text-nv-danger">
        {messages.map((message, index) => (
          <li key={`${index}-${message}`}>{message}</li>
        ))}
      </ul>
    </div>
  );
}

export function PickElectionAction() {
  return (
    <Button
      variant="outline"
      size="dense"
      className="w-auto"
      onClick={() => {
        const picker = document.getElementById("officer-election-picker");
        picker?.focus();
        picker?.scrollIntoView({ block: "center" });
      }}
    >
      Choose an election
    </Button>
  );
}

export function NoElectionsState() {
  return (
    <EmptyState
      icon={<Vote className="h-5 w-5" aria-hidden="true" />}
      title="No elections are assigned to you"
      description="Officers are appointed election by election. An administrator assigns officers from Admin → Election officers, or you can ask to be added to an election."
      action={
        <LinkButton href="/contact" variant="outline" className="w-auto">
          Contact an administrator
        </LinkButton>
      }
    />
  );
}

export function useElectionSelection(): {
  selected: string;
  select: (value: string) => void;
} {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const selected = searchParams.get("election") ?? "";

  const select = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set("election", value);
      else params.delete("election");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    },
    [searchParams, router, pathname],
  );

  return { selected, select };
}

export function ElectionPickerSection({
  elections,
  value,
  onChange,
  children,
}: {
  elections: ManagedElection[];
  value: string;
  onChange: (value: string) => void;
  children?: ReactNode;
}) {
  const selected = elections.find((row) => String(row.id) === value) ?? null;

  return (
    <Section
      title="Choose an election"
      description="Everything below applies to the selected election. The choice is kept in the page address so you can bookmark or share this view."
    >
      <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
        <Select
          id="officer-election-picker"
          label="Election"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          options={elections.map((row) => ({
            value: String(row.id),
            label: `${row.title} (${row.status})`,
          }))}
          placeholder="Choose an election"
        />
        {children ? <div className="flex flex-wrap items-center gap-2 pb-2">{children}</div> : null}
      </div>
      {selected ? null : (
        <p className="mt-3 text-[13px] text-nv-muted">
          Pick one of your elections to open its workspace.
        </p>
      )}
    </Section>
  );
}

export function ListSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-11 w-full max-w-sm" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
