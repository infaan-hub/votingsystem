"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useApp } from "@/src/components/AppProvider";
import { useToast } from "@/src/components/ui/toast";
import { cn } from "@/src/lib/utils";

/** Google Identity Services bundle, loaded once on first use. */
const GIS_SCRIPT_ID = "google-identity-service";
const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

/** Errors Google reports when the person simply dismissed the popup. */
const BENIGN_POPUP_ERRORS = new Set(["popup_closed_by_user", "access_denied"]);

type GoogleCodeClient = { requestCode: () => void };

type GoogleGisWindow = Window & {
  google?: {
    accounts?: {
      oauth2?: {
        initCodeClient: (config: {
          client_id: string;
          scope: string;
          ux_mode: "popup";
          callback: (response: { code?: string; error?: string }) => void;
        }) => GoogleCodeClient;
      };
    };
  };
};

/** Signed-in user shape returned by `handleGoogleLogin`. */
export type GoogleSignedInUser = {
  id: number;
  username: string;
  full_name: string;
  role: string;
};

let gisScriptPromise: Promise<void> | null = null;

/**
 * Injects the GIS script exactly once (or waits on a copy an earlier mount
 * already added). Resolves when `window.google.accounts.oauth2` is usable.
 */
function loadGoogleIdentity(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as GoogleGisWindow).google?.accounts?.oauth2) return Promise.resolve();

  if (!gisScriptPromise) {
    gisScriptPromise = new Promise<void>((resolve, reject) => {
      const fail = () => {
        gisScriptPromise = null; // let the next click retry the download
        reject(new Error("Google Identity Services could not be loaded."));
      };

      const existing = document.getElementById(GIS_SCRIPT_ID);
      const script =
        existing instanceof HTMLScriptElement ? existing : document.createElement("script");
      script.addEventListener("load", () => resolve(), { once: true });
      script.addEventListener("error", fail, { once: true });

      if (!existing) {
        script.id = GIS_SCRIPT_ID;
        script.src = GIS_SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
    });
  }

  return gisScriptPromise;
}

/** The four-colour Google "G" mark, per Google's brand guidelines. */
function GoogleGIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}


/**
 * "Sign in with Google" button. Opens the Google consent popup, sends the
 * one-time authorization code to `POST /api/auth/google/`, and hands the
 * signed-in user back through `onSuccess` so the host screen can navigate.
 *
 * Google sign-in is optional per deployment: when `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
 * is empty the button still renders, and tapping it explains which env vars
 * turn the flow on (see README § Google OAuth).
 */
export function GoogleSignInButton({
  onSuccess,
  className,
  disabled = false,
}: {
  /** Called once the server accepted the Google token and signed the user in. */
  onSuccess?: (user: GoogleSignedInUser) => void;
  className?: string;
  disabled?: boolean;
}) {
  const { handleGoogleLogin } = useApp();
  const { toast } = useToast();
  const codeClientRef = useRef<GoogleCodeClient | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || "";

  const signIn = useCallback(
    async (code: string) => {
      setSubmitting(true);
      try {
        const user = await handleGoogleLogin({ code });
        toast({ title: `Welcome back, ${user.full_name || user.username}`, tone: "success" });
        onSuccess?.(user);
      } catch (error) {
        const detail =
          error instanceof Error && error.message
            ? error.message
            : "Google sign-in failed. Please try again.";
        toast({ title: "Google sign-in failed", description: detail, tone: "error" });
      } finally {
        setSubmitting(false);
      }
    },
    [handleGoogleLogin, onSuccess, toast],
  );

  const initCodeClient = useCallback((): GoogleCodeClient | null => {
    const gisWindow = window as GoogleGisWindow;
    return (
      gisWindow.google?.accounts?.oauth2?.initCodeClient({
        client_id: clientId,
        scope: "openid email profile",
        ux_mode: "popup",
        callback: (response) => {
          if (response.code) {
            void signIn(response.code);
            return;
          }
          // Dismissing the popup is not an error the user needs to read about.
          if (response.error && !BENIGN_POPUP_ERRORS.has(response.error)) {
            toast({ title: "Google sign-in failed", description: response.error, tone: "error" });
          }
        },
      }) ?? null
    );
  }, [clientId, signIn, toast]);

  // Warm up the GIS popup client as soon as the button mounts so the tap
  // opens the consent window synchronously (popup blockers allow that).
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    loadGoogleIdentity()
      .then(() => {
        if (cancelled) return;
        codeClientRef.current = initCodeClient();
      })
      .catch(() => {
        // Script blocked or offline; the click handler retries and reports.
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, initCodeClient]);

  async function onClick() {
    if (disabled || submitting) return;

    if (!clientId) {
      toast({
        title: "Google sign-in isn’t enabled",
        description:
          "Set NEXT_PUBLIC_GOOGLE_CLIENT_ID (and the server GOOGLE_OAUTH_* values) to turn it on.",
        tone: "warning",
      });
      return;
    }

    if (!codeClientRef.current) {
      try {
        await loadGoogleIdentity();
      } catch {
        toast({
          title: "Google sign-in unavailable",
          description: "The Google sign-in library could not be loaded. Please try again.",
          tone: "error",
        });
        return;
      }
      codeClientRef.current = initCodeClient();
    }

    if (!codeClientRef.current) {
      toast({
        title: "Google sign-in unavailable",
        description: "Google sign-in could not start. Please refresh and try again.",
        tone: "error",
      });
      return;
    }

    codeClientRef.current.requestCode();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || submitting}
      className={cn(
        "inline-flex h-12 w-full select-none items-center justify-center gap-3 rounded-lg border border-nv-primary/25 bg-white px-5",
        "text-[13px] font-bold normal-case tracking-normal text-nv-ink",
        "transition-[background-color,opacity] duration-200 ease-out",
        "hover:bg-nv-primary-100 active:bg-nv-primary-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-primary focus-visible:ring-offset-2 focus-visible:ring-offset-nv-bg",
        "disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
    >
      <GoogleGIcon className="h-[18px] w-[18px] shrink-0" />
      {submitting ? "Signing in…" : "Sign in with Google"}
    </button>
  );
}
