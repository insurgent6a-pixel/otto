"use client";

import { sb } from "./supabase";

export type PushSupport = "ok" | "needs_install" | "unsupported";

export async function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (err) {
    console.warn("Service worker failed to register", err);
  }
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  // iOS only allows web push once Otto is on the home screen (iOS 16.4+).
  if (isIos() && !isStandalone()) return "needs_install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  return "ok";
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function saveSubscription(sub: PushSubscription) {
  const json = sub.toJSON();
  const { error } = await sb()
    .from("push_subscriptions")
    .upsert(
      { endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "", user_agent: navigator.userAgent.slice(0, 200), failures: 0 },
      { onConflict: "endpoint" },
    );
  if (error) throw new Error(error.message);
}

async function subscribe(): Promise<PushSubscription> {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) throw new Error("Push isn't set up on the server yet. Add the VAPID keys and redeploy.");
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
}

/** Only call from a tap: the permission prompt must come from a user gesture. */
export async function enablePush(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Reminders are blocked. Allow notifications for Otto in your settings, then try again.");
  await saveSubscription(await subscribe());
}

/** Runs on every app open so a rotated subscription never goes stale. */
export async function resubscribe(): Promise<boolean> {
  if (pushSupport() !== "ok" || Notification.permission !== "granted") return false;
  try {
    await saveSubscription(await subscribe());
    return true;
  } catch {
    return false;
  }
}

export async function sendTestPush(): Promise<string> {
  const { data } = await sb().auth.getSession();
  const res = await fetch("/api/push/test", {
    method: "POST",
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
  });
  const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) throw new Error(body.error ?? `Test failed with status ${res.status}.`);
  return body.message ?? "Sent.";
}

export function setBadge(count: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  if (!nav.setAppBadge) return;
  void (count > 0 ? nav.setAppBadge(count) : nav.clearAppBadge?.())?.catch(() => {});
}
