import type { PushSubscriptionPayload } from "@/src/lib/notifications/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";

const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

export type SessionUser = {
  id: number;
  username: string;
  full_name: string;
  email: string;
  role: string;
  auth_provider: string;
  photo_url: string | null;
};

export type AuthResponse = {
  token: string;
  user: SessionUser;
};

/** Returned by POST /auth/login when a 6-digit code was sent instead. */
export type OtpChallengeResponse = {
  otp_required: true;
  challenge_id: number;
  expires_at: string;
  expires_in: number;
  message?: string;
};

export type LoginResponse = AuthResponse & { otp_required?: false };

export type LoginOutcome = LoginResponse | OtpChallengeResponse;

export type OtpResendResponse = {
  challenge_id: number;
  expires_at: string;
  send_count: number;
  message?: string;
};

export type ApiRequestError = Error & {
  status?: number;
  data?: unknown;
};

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

function getErrorMessage(data: unknown, fallbackMessage: string): string {
  if (!data) {
    return fallbackMessage;
  }
  if (typeof data === "string") {
    return data;
  }
  if (typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (typeof record.detail === "string") {
      return record.detail;
    }
    const firstEntry = Object.values(record).find((value) => value);
    if (typeof firstEntry === "string") {
      return firstEntry;
    }
    if (Array.isArray(firstEntry) && firstEntry.length) {
      return String(firstEntry[0]);
    }
  }
  return fallbackMessage;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, token, headers = {}, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS } = options;
  const finalHeaders = { ...headers };
  let finalBody: BodyInit | undefined;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  if (token) {
    finalHeaders.Authorization = `Token ${token}`;
  }

  if (body && !(body instanceof FormData)) {
    finalHeaders["Content-Type"] = "application/json";
    finalBody = JSON.stringify(body);
  } else if (body instanceof FormData) {
    finalBody = body;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: finalHeaders,
      body: finalBody,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Request failed. Please try again.");
    }
    throw new Error("The server is not reachable right now. Please try again shortly.");
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (response.status === 204) {
    return null as T;
  }

  const rawText = await response.text();
  let data: unknown = null;

  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { detail: rawText };
    }
  }

  if (!response.ok) {
    const error: ApiRequestError = new Error(
      getErrorMessage(
        data,
        response.status >= 500
          ? "The server is having trouble right now. Please try again shortly."
          : "Request failed.",
      ),
    );
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data as T;
}

export const login = (credentials: {
  username: string;
  password: string;
  /**
   * Push subscription this browser created during the sign-in tap. The server
   * binds it when the account has no device yet, so the login code reaches
   * the device that is signing in.
   */
  pushSubscription?: PushSubscriptionPayload | null;
}) =>
  request<LoginOutcome>("/auth/login/", {
    method: "POST",
    body: {
      username: credentials.username,
      password: credentials.password,
      ...(credentials.pushSubscription
        ? { push_subscription: credentials.pushSubscription }
        : {}),
    },
  });
export const loginWithGoogle = (payload: { credential?: string; code?: string }) =>
  request<AuthResponse>("/auth/google/", { method: "POST", body: payload });
export const verifyLoginOtp = (challengeId: number, code: string) =>
  request<AuthResponse>("/auth/otp/verify/", {
    method: "POST",
    body: { challenge_id: challengeId, code },
  });
export const resendLoginOtp = (challengeId: number) =>
  request<OtpResendResponse>("/auth/otp/resend/", {
    method: "POST",
    body: { challenge_id: challengeId },
  });
export const logout = (token: string) => request<null>("/auth/logout/", { method: "POST", token });
export const fetchCurrentUser = (token: string) => request<SessionUser>("/auth/me/", { token });
