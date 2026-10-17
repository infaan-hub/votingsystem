"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Download, Monitor, Share2, Smartphone, TriangleAlert } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Dialog } from "@/src/components/ui/dialog";
import { useToast } from "@/src/components/ui/toast";
import { cn } from "@/src/lib/utils";
import { t } from "@/config/tenant";

/**
 * "Download app" install call-to-action for the web app.
 *
 *  - A small badge tab pinned to the right edge (vertically centred) while
 *    the app is not installed and the badge has not been dismissed.
 *  - Tapping it opens a compact how-to dialog that adapts to the device:
 *    iOS gets Share-sheet steps only; Android and desktop also get a
 *    "Download app" button that triggers the browser's install prompt
 *    (Chromium's `beforeinstallprompt`).
 *  - "Got it" dismisses the badge for good (localStorage) — the sidebar's
 *    "Download app" row stays as the permanent entry point.
 *  - Once the app runs installed (standalone display mode), every install
 *    affordance disappears.
 */

/** Set to "1" by "Got it"; the badge then never comes back on this device. */
export const INSTALL_BADGE_DISMISSAL_KEY = "nexvote-install-badge-dismissed";

type InstallDevice = "ios" | "android" | "desktop";

function readInstallBadgeDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(INSTALL_BADGE_DISMISSAL_KEY) === "1";
  } catch {
    return false;
  }
}

function writeInstallBadgeDismissed(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(INSTALL_BADGE_DISMISSAL_KEY, "1");
  } catch {
    /* private mode / storage disabled: the badge simply reappears later */
  }
}

/** Device bucket used to pick the installation copy. */
function detectInstallDevice(): InstallDevice {
  if (typeof window === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  // iPadOS 13+ reports as Macintosh but exposes touch points.
  const ipad = /iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (/iPhone|iPod/.test(ua) || ipad) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

/** True while the page runs as an installed app (any standalone-ish mode). */
function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  if ((navigator as unknown as { standalone?: boolean }).standalone === true) return true;
  const matches = (query: string) => window.matchMedia?.(query)?.matches === true;
  return (
    matches("(display-mode: standalone)") ||
    matches("(display-mode: fullscreen)") ||
    matches("(display-mode: minimal-ui)")
  );
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type PromptInstallResult = "accepted" | "dismissed" | "unavailable";

type InstallAppContextValue = {
  /** The app already runs installed: hide every install affordance. */
  installed: boolean;
  /** The floating badge was dismissed with "Got it". */
  badgeDismissed: boolean;
  device: InstallDevice;
  dialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
  /** "Got it": hide the badge permanently, keep the sidebar entry. */
  dismissBadge: () => void;
  /** Show the browser's install prompt, when one was offered. */
  promptInstall: () => Promise<PromptInstallResult>;
};

const InstallAppContext = createContext<InstallAppContextValue | null>(null);

function useInstallApp(): InstallAppContextValue | null {
  return useContext(InstallAppContext);
}

export function InstallAppProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  // Render browser-dependent UI only after mount: the server cannot know the
  // display mode or stored dismissal, and guessing would break hydration.
  const [ready, setReady] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [badgeDismissed, setBadgeDismissed] = useState(false);
  const [device, setDevice] = useState<InstallDevice>("desktop");
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    setInstalled(isStandaloneDisplay());
    setBadgeDismissed(readInstallBadgeDismissed());
    setDevice(detectInstallDevice());
    setReady(true);

    const onBeforeInstall = (event: Event) => {
      // Swallow Chromium's automatic mini-infobar; the badge/dialog own the
      // install call-to-action.
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      setDialogOpen(false);
      toast({
        title: "App installed",
        description: `Open ${t.name} any time from your home screen or app list.`,
        tone: "success",
      });
    };
    // The display mode can flip mid-session (install from another tab).
    const media = window.matchMedia?.("(display-mode: standalone)");
    const onDisplayMode = () => setInstalled(isStandaloneDisplay());

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    media?.addEventListener?.("change", onDisplayMode);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      media?.removeEventListener?.("change", onDisplayMode);
    };
  }, [toast]);

  const dismissBadge = useCallback(() => {
    writeInstallBadgeDismissed();
    setBadgeDismissed(true);
  }, []);

  const promptInstall = useCallback(async (): Promise<PromptInstallResult> => {
    const event = promptEvent;
    if (!event) return "unavailable";
    // A captured event can be prompted only once.
    setPromptEvent(null);
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice?.outcome === "accepted") {
        setInstalled(true);
        setDialogOpen(false);
        return "accepted";
      }
      return "dismissed";
    } catch {
      return "dismissed";
    }
  }, [promptEvent]);

  const value = useMemo<InstallAppContextValue>(
    () => ({
      installed,
      badgeDismissed,
      device,
      dialogOpen,
      openDialog: () => setDialogOpen(true),
      closeDialog: () => setDialogOpen(false),
      dismissBadge,
      promptInstall,
    }),
    [installed, badgeDismissed, device, dialogOpen, dismissBadge, promptInstall],
  );

  return (
    <InstallAppContext.Provider value={value}>
      {children}
      {ready && !installed && !badgeDismissed ? <InstallAppBadge /> : null}
      <InstallAppDialog />
    </InstallAppContext.Provider>
  );
}

/** Small tab on the right edge of the viewport; tap to open the how-to. */
function InstallAppBadge() {
  const context = useInstallApp();
  if (!context) return null;
  return (
    <button
      type="button"
      onClick={context.openDialog}
      title="Download app"
      aria-label="Download app"
      data-testid="install-app-badge"
      className={cn(
        "fixed right-0 top-1/2 z-40 -translate-y-1/2",
        "inline-flex items-center gap-1.5 rounded-l-full border border-r-0 border-nv-primary/40 bg-nv-primary py-2 pl-3 pr-2.5",
        "text-[11.5px] font-bold text-white shadow-nv-card",
        "transition-[padding] duration-200 hover:pr-3.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-primary focus-visible:ring-offset-2",
      )}
    >
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
      Download app
    </button>
  );
}

/**
 * Sidebar / drawer row. Rendered below the nav while the app is not
 * installed — it is the permanent entry point once the badge is dismissed.
 */
export function InstallAppSidebarItem({
  collapsed = false,
  className,
}: {
  collapsed?: boolean;
  className?: string;
}) {
  const context = useInstallApp();
  if (!context || context.installed) return null;
  return (
    <button
      type="button"
      onClick={context.openDialog}
      title="Download app"
      data-testid="install-app-sidebar-item"
      className={cn(
        "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sidebar-foreground transition-colors duration-200",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-primary",
        className,
      )}
    >
      <span className="shrink-0" aria-hidden="true">
        <Download className="h-[18px] w-[18px]" />
      </span>
      <span
        className={cn("truncate text-[13px] font-semibold", collapsed ? "hidden" : "inline")}
      >
        Download app
      </span>
    </button>
  );
}

type DeviceCopy = {
  icon: React.ReactNode;
  description: string;
  steps: string[];
  note?: string;
};

function deviceCopy(device: InstallDevice): DeviceCopy {
  switch (device) {
    case "ios":
      return {
        icon: <Share2 className="h-4.5 w-4.5" aria-hidden="true" />,
        description: `Install ${t.name} on your iPhone or iPad.`,
        steps: [
          "Open this page in Safari, then tap the Share button (the square with an arrow pointing up).",
          "Scroll the menu and tap “Add to Home Screen”.",
          `Tap “Add” — ${t.name} appears on your Home Screen like any other app.`,
        ],
        note: "iPhone and iPad only install web apps from Safari's Share menu, so there is no download button here.",
      };
    case "android":
      return {
        icon: <Smartphone className="h-4.5 w-4.5" aria-hidden="true" />,
        description: `Install ${t.name} on your Android device.`,
        steps: [
          "Tap Download app below, or open the browser menu and choose “Install app” (some phones: “Add to Home screen”).",
          "Confirm “Install”.",
          `Open ${t.name} from your home screen — it runs full screen like a native app.`,
        ],
      };
    default:
      return {
        icon: <Monitor className="h-4.5 w-4.5" aria-hidden="true" />,
        description: `Install ${t.name} as a desktop app.`,
        steps: [
          "Click Download app below, or look for the install icon at the right end of the address bar.",
          "In Chrome or Edge you can also open the menu and choose “Install app”; in Safari choose File → “Add to Dock”.",
          `Confirm — ${t.name} gets its own window and a shortcut in your apps.`,
        ],
      };
  }
}

const UNAVAILABLE_HINT =
  "This browser has not offered an install prompt. Open the browser menu and choose “Install app” or “Add to Home screen”.";
const DISMISSED_HINT =
  "Install was dismissed. You can install any time from the browser menu — the Download app row in the sidebar stays here.";

function InstallAppDialog() {
  const context = useInstallApp();
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const dialogOpen = context?.dialogOpen ?? false;

  // A fresh open always starts without a stale hint.
  useEffect(() => {
    if (!dialogOpen) setHint(null);
  }, [dialogOpen]);

  if (!context) return null;
  const { device, dialogOpen: isOpen, closeDialog, dismissBadge, promptInstall } = context;
  const copy = deviceCopy(device);

  async function onDownload() {
    setBusy(true);
    setHint(null);
    try {
      const result = await promptInstall();
      if (result === "unavailable") setHint(UNAVAILABLE_HINT);
      if (result === "dismissed") setHint(DISMISSED_HINT);
      // "accepted": the provider hides everything and closes the dialog.
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) closeDialog();
      }}
      title="Download the app"
      description={copy.description}
      footer={
        <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
          <Button
            type="button"
            variant="outline"
            size="dense"
            className="w-auto"
            onClick={() => {
              dismissBadge();
              closeDialog();
            }}
          >
            Got it
          </Button>
          {device === "ios" ? null : (
            <Button
              type="button"
              size="dense"
              className="w-auto"
              disabled={busy}
              onClick={() => void onDownload()}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {busy ? "Opening…" : "Download app"}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4 pb-2">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-nv-primary-100 text-nv-primary"
          >
            {copy.icon}
          </span>
          <ol className="min-w-0 flex-1 space-y-2.5">
            {copy.steps.map((step, index) => (
              <li
                key={step}
                className="flex items-start gap-2.5 text-[13px] leading-relaxed text-nv-text"
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-nv-primary-100 text-[11px] font-bold text-nv-primary"
                >
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {copy.note ? (
          <p className="rounded-nv-md border border-nv-line bg-nv-bg p-3 text-[12.5px] text-nv-muted">
            {copy.note}
          </p>
        ) : null}

        {hint ? (
          <p
            role="status"
            className="flex items-start gap-1.5 rounded-nv-md border border-nv-line bg-nv-bg p-3 text-[12.5px] text-nv-muted"
          >
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-nv-primary" aria-hidden="true" />
            {hint}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
