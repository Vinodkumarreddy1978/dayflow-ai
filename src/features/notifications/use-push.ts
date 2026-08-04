"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { publicEnv } from "@/lib/public-env";

/**
 * Converts the base64url VAPID public key into the Uint8Array the Push API wants.
 *
 * The browser will not do this for you, and passing the string directly fails
 * with an opaque InvalidCharacterError.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalised);

  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export type PushState =
  "unsupported" | "unconfigured" | "default" | "granted" | "denied" | "subscribed";

/**
 * Push notification registration for this device.
 *
 * Deliberately per-device rather than per-account: permission is granted by a
 * browser, not by a user, and presenting it as an account setting would leave
 * someone toggling it on their laptop and wondering why their phone stays quiet.
 */
export function usePush() {
  const toast = useToast();
  const [state, setState] = useState<PushState>("unsupported");
  const [isBusy, setIsBusy] = useState(false);
  const [endpoint, setEndpoint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function detect() {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        setState("unsupported");
        return;
      }

      // Without a VAPID key the subscribe call would fail at the browser, so the
      // UI says the feature is not configured rather than offering a button that
      // cannot work.
      if (!publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
        setState("unconfigured");
        return;
      }

      const registration = await navigator.serviceWorker.getRegistration();
      const existing = await registration?.pushManager.getSubscription();

      if (cancelled) return;

      if (existing) {
        setEndpoint(existing.endpoint);
        setState("subscribed");
        return;
      }

      setState(Notification.permission as "default" | "granted" | "denied");
    }

    void detect();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setIsBusy(true);
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission as "denied" | "default");
        // Denial is permanent until the user changes it in browser settings, so
        // the message points there rather than inviting another attempt.
        toast.error(
          permission === "denied"
            ? "Notifications are blocked for this site. You can re-allow them in your browser's site settings."
            : "Notifications were not enabled.",
        );
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        ) as BufferSource,
      });

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!response.ok) {
        // Roll the browser subscription back. Leaving it in place would make the
        // device look subscribed while the server has no way to reach it.
        await subscription.unsubscribe();
        throw new Error("Server rejected the subscription");
      }

      setEndpoint(subscription.endpoint);
      setState("subscribed");
      toast.success("Notifications on for this device.");
    } catch {
      toast.error("Could not enable notifications on this device.");
    } finally {
      setIsBusy(false);
    }
  }, [toast]);

  const disable = useCallback(async () => {
    setIsBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      const target = subscription?.endpoint ?? endpoint;

      if (subscription) await subscription.unsubscribe();

      if (target) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: target }),
        });
      }

      setEndpoint(null);
      setState(Notification.permission as "default" | "granted" | "denied");
      toast.success("Notifications off for this device.");
    } catch {
      toast.error("Could not turn notifications off.");
    } finally {
      setIsBusy(false);
    }
  }, [endpoint, toast]);

  return { state, isBusy, enable, disable };
}
