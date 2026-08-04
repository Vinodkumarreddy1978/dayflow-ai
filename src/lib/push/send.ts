import "server-only";

import webpush from "web-push";
import { serverEnv } from "@/lib/env";
import { publicEnv } from "@/lib/public-env";

export interface PushPayload {
  title: string;
  body: string;
  tag: string;
  url: string;
  /** Actions the user can take straight from the notification shade. */
  actions?: { action: string; title: string }[];
  data?: Record<string, unknown>;
}

export interface StoredSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

let configured = false;

/**
 * Configures VAPID once per process.
 *
 * Returns false rather than throwing when keys are absent, because push is
 * optional: the product is fully usable without it, and a missing key should
 * degrade notifications rather than break the cron job that also closes
 * abandoned activities.
 */
function ensureConfigured(): boolean {
  if (configured) return true;

  const env = serverEnv();
  const publicKey = publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  if (!publicKey || !env.VAPID_PRIVATE_KEY) return false;

  webpush.setVapidDetails(env.VAPID_SUBJECT, publicKey, env.VAPID_PRIVATE_KEY);
  configured = true;
  return true;
}

export type SendResult =
  | { status: "sent"; subscriptionId: string }
  | { status: "expired"; subscriptionId: string }
  | { status: "failed"; subscriptionId: string; reason: string }
  | { status: "skipped"; reason: string };

/**
 * Sends one notification to one device.
 *
 * A 404 or 410 from the push service means the browser has discarded the
 * subscription - the user cleared site data, or reinstalled. That is reported as
 * `expired` so the caller can delete the row: retaining dead endpoints means
 * every future send wastes a request per dead device, forever.
 */
export async function sendPush(
  subscription: StoredSubscription,
  payload: PushPayload,
): Promise<SendResult> {
  if (!ensureConfigured()) {
    return { status: "skipped", reason: "VAPID keys not configured" };
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
      { TTL: 3600, urgency: "normal" },
    );

    return { status: "sent", subscriptionId: subscription.id };
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;

    if (statusCode === 404 || statusCode === 410) {
      return { status: "expired", subscriptionId: subscription.id };
    }

    return {
      status: "failed",
      subscriptionId: subscription.id,
      reason: (error as Error).message ?? "unknown",
    };
  }
}

/** Sends to every device a user has registered. */
export async function sendToAllDevices(
  subscriptions: StoredSubscription[],
  payload: PushPayload,
): Promise<SendResult[]> {
  // allSettled rather than all: one dead device must not prevent delivery to the
  // rest of the user's devices.
  const results = await Promise.allSettled(
    subscriptions.map((subscription) => sendPush(subscription, payload)),
  );

  return results.map((result, index) =>
    result.status === "fulfilled"
      ? result.value
      : {
          status: "failed" as const,
          subscriptionId: subscriptions[index]!.id,
          reason: "send threw",
        },
  );
}

/**
 * Constant-time-ish comparison of the cron bearer token.
 *
 * A plain `===` on secrets leaks length and prefix information through timing.
 * The exposure here is small, but the cost of doing it properly is one function.
 */
export function isAuthorisedCronRequest(authorisation: string | null): boolean {
  const expected = `Bearer ${serverEnv().CRON_SECRET}`;
  if (!authorisation || authorisation.length !== expected.length) return false;

  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= authorisation.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}
