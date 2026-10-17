import { useCallback, useEffect, useRef, useState } from "react";

import { useApp } from "@/src/components/AppProvider";
import { formatDateTime } from "@/src/lib/time";

export function authHeaders(token: string): Record<string, string> {
  return token ? { Authorization: `Token ${token}` } : {};
}

export function useToken(): string {
  return useApp().token;
}

export function errorMessage(payload: unknown, status?: number): string {
  if (payload && typeof payload === "object") {
    const body = payload as Record<string, unknown>;
    if (typeof body.detail === "string" && body.detail.trim()) return body.detail;
    for (const value of Object.values(body)) {
      if (typeof value === "string" && value.trim()) return value;
      if (Array.isArray(value)) {
        const first = value.find((entry) => typeof entry === "string" && entry.trim());
        if (typeof first === "string") return first;
      }
    }
  }
  if (status) return `The request failed with status ${status}.`;
  return "The request could not be completed.";
}

export async function apiRequest<T>(
  token: string,
  url: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(authHeaders(token));
  if (init?.body) headers.set("Content-Type", "application/json");
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  const response = await fetch(url, { ...init, headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(payload, response.status));
  return payload as T;
}

export function displayDate(value: string | Date | null | undefined): string {
  if (value instanceof Date) return formatDateTime(value) ?? "—";
  if (!value) return "—";
  return value;
}

export function windowText(start?: string | null, end?: string | null): string {
  if (!start && !end) return "Not scheduled";
  return `${start ?? "—"} → ${end ?? "—"}`;
}

export type Resource<T> = {
  data: T | null;
  error: string;
  loading: boolean;
  reload: () => void;
};

export function useResource<T>(
  fetcher: (token: string) => Promise<T>,
  deps: ReadonlyArray<unknown>,
): Resource<T> {
  const token = useToken();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetcherRef
      .current(token)
      .then((value) => {
        if (cancelled) return;
        setData(value);
        setError("");
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "The request failed.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, nonce, ...deps]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  return { data, error, loading, reload };
}
