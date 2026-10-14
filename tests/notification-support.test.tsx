// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { getNotificationSupport } from "@/src/lib/notifications/client";

/**
 * Capability detection for every browser family that matters. The critical
 * case is the first one: iOS Safari outside an installed Home Screen web app
 * does NOT expose PushManager, and the user must be told to install — not
 * told the browser is unsupported.
 */
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD_UA = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1";
const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

type Env = {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  permission?: NotificationPermission;
  standby?: boolean;
  secure?: boolean;
  serviceWorker?: boolean;
  pushManager?: boolean;
};

const ORIGINALS = {
  userAgent: navigator.userAgent,
  platform: navigator.platform,
  maxTouchPoints: navigator.maxTouchPoints,
};

function installEnv({
  userAgent = CHROME_UA,
  platform = "Win32",
  maxTouchPoints = 0,
  permission = "default",
  standby = false,
  secure = true,
  serviceWorker = true,
  pushManager = true,
}: Env) {
  Object.defineProperty(navigator, "userAgent", { value: userAgent, configurable: true });
  Object.defineProperty(navigator, "platform", { value: platform, configurable: true });
  Object.defineProperty(navigator, "maxTouchPoints", { value: maxTouchPoints, configurable: true });
  vi.stubGlobal("isSecureContext", secure);
  vi.stubGlobal(
    "Notification",
    class MockNotification {
      static permission = permission;
      static requestPermission = vi.fn();
    },
  );
  if (pushManager) vi.stubGlobal("PushManager", class MockPushManager {});
  else delete (globalThis as { PushManager?: unknown }).PushManager;
  if (serviceWorker) {
    Object.defineProperty(navigator, "serviceWorker", {
      value: { getRegistration: vi.fn(), register: vi.fn() },
      configurable: true,
    });
  } else {
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  }
  if (standby) {
    Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
  } else {
    delete (navigator as { standalone?: unknown }).standalone;
    vi.stubGlobal("matchMedia", undefined);
  }
}

describe("getNotificationSupport", () => {
  afterEach(() => {
    Object.defineProperty(navigator, "userAgent", { value: ORIGINALS.userAgent, configurable: true });
    Object.defineProperty(navigator, "platform", { value: ORIGINALS.platform, configurable: true });
    Object.defineProperty(navigator, "maxTouchPoints", {
      value: ORIGINALS.maxTouchPoints,
      configurable: true,
    });
    delete (navigator as { standalone?: unknown }).standalone;
    vi.unstubAllGlobals();
  });

  it("sends iPhone users to the Home Screen install instead of claiming unsupported", () => {
    // The real iOS Safari situation: no PushManager outside the installed app.
    installEnv({ userAgent: IPHONE_UA, platform: "iPhone", pushManager: false });

    const support = getNotificationSupport();

    expect(support.isIos).toBe(true);
    expect(support.isStandalone).toBe(false);
    expect(support.status).toBe("requires-home-screen-install");
    expect(support.detail).toMatch(/Add to Home Screen/);
  });

  it("still shows install guidance when iOS exposes PushManager outside standalone", () => {
    installEnv({ userAgent: IPHONE_UA, platform: "iPhone", pushManager: true });

    expect(getNotificationSupport().status).toBe("requires-home-screen-install");
  });

  it("treats iPadOS desktop-mode UA as an Apple tablet needing install", () => {
    // iPadOS 13+ reports MacIntel but exposes touch points.
    installEnv({ userAgent: CHROME_UA, platform: "MacIntel", maxTouchPoints: 2, pushManager: false });

    const support = getNotificationSupport();

    expect(support.isIos).toBe(true);
    expect(support.isStandalone).toBe(false);
    expect(support.status).toBe("requires-home-screen-install");
  });

  it("treats iPad with its own UA the same way", () => {
    installEnv({ userAgent: IPAD_UA, platform: "iPad", pushManager: false });

    expect(getNotificationSupport().status).toBe("requires-home-screen-install");
  });

  it("offers Enable inside the installed iPhone web app (standalone)", () => {
    installEnv({
      userAgent: IPHONE_UA,
      platform: "iPhone",
      standby: true,
      pushManager: true,
      permission: "default",
    });

    const support = getNotificationSupport();

    expect(support.isStandalone).toBe(true);
    expect(support.status).toBe("permission-required");
  });

  it("reports supported when the installed web app is already granted", () => {
    installEnv({
      userAgent: IPHONE_UA,
      platform: "iPhone",
      standby: true,
      pushManager: true,
      permission: "granted",
    });

    expect(getNotificationSupport().status).toBe("supported");
  });

  it("gives iOS-specific settings guidance when permission is blocked", () => {
    installEnv({
      userAgent: IPHONE_UA,
      platform: "iPhone",
      standby: true,
      pushManager: true,
      permission: "denied",
    });

    const support = getNotificationSupport();

    expect(support.status).toBe("permission-denied");
    expect(support.detail).toMatch(/Settings > Notifications/);
  });

  it("treats desktop Chrome (and other full Web Push browsers) normally", () => {
    installEnv({ permission: "default" });

    const support = getNotificationSupport();

    expect(support.isIos).toBe(false);
    expect(support.status).toBe("permission-required");
  });

  it("gives non-iOS settings guidance when permission is blocked", () => {
    installEnv({ permission: "denied" });

    const support = getNotificationSupport();

    expect(support.status).toBe("permission-denied");
    expect(support.detail).toMatch(/browser or system settings/);
    expect(support.detail).not.toMatch(/Settings > Notifications/);
  });

  it("reports browsers genuinely missing the APIs as unsupported", () => {
    installEnv({ serviceWorker: false, pushManager: false });

    expect(getNotificationSupport().status).toBe("unsupported");
  });

  it("requires a secure context (Vercel/Safari both serve HTTPS)", () => {
    installEnv({ secure: false });

    const support = getNotificationSupport();

    expect(support.status).toBe("unsupported");
    expect(support.detail).toMatch(/HTTPS/);
  });
});
