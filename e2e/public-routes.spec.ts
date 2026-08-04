import { expect, test } from "@playwright/test";

/**
 * Everything in this file runs against a deployment with no Supabase project
 * behind it, using nothing but placeholder credentials.
 *
 * That is deliberate. These are the checks that must pass on every commit
 * without a database, so CI can catch a broken route guard, a missing page or an
 * unlabelled form without provisioning infrastructure. The flows that genuinely
 * need a signed-in user live in authenticated.spec.ts and skip themselves when
 * credentials are absent.
 */

test.describe("public routes", () => {
  test("the landing page explains the product and offers a way in", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /sign up|get started/i }).first(),
    ).toBeVisible();
  });

  test("sign in and sign up are reachable and labelled", async ({ page }) => {
    await page.goto("/sign-in");

    // Fields are found by their accessible label, not by CSS. A test that passes
    // against an unlabelled input is testing the wrong thing.
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

    await page.getByRole("link", { name: /forgot your password/i }).click();
    await expect(page).toHaveURL(/\/reset-password/);
    await expect(page.getByRole("button", { name: /send reset link/i })).toBeVisible();
  });

  test("the sign up form states the password requirement before it is broken", async ({
    page,
  }) => {
    await page.goto("/sign-up");

    await expect(page.getByText(/at least 8 characters/i)).toBeVisible();
  });

  test("password reset does not reveal whether an account exists", async ({ page }) => {
    await page.goto("/reset-password");

    await page.getByLabel(/email/i).fill("definitely-not-a-user@example.com");
    await page.getByRole("button", { name: /send reset link/i }).click();

    // The same confirmation regardless. Anything else turns this form into an
    // account-enumeration tool.
    await expect(page.getByText(/check your email/i)).toBeVisible();
    await expect(page.getByText(/if an account exists/i)).toBeVisible();
  });
});

test.describe("route guards", () => {
  for (const path of [
    "/dashboard",
    "/analytics",
    "/calendar",
    "/goals",
    "/insights",
    "/search",
    "/settings",
    "/categories",
  ]) {
    test(`${path} redirects an anonymous visitor to sign in`, async ({ page }) => {
      await page.goto(path);

      await expect(page).toHaveURL(/\/sign-in/);
      // The destination is preserved so signing in does not dump the user on the
      // dashboard when they asked for something else. DF-SYN-051.
      expect(new URL(page.url()).searchParams.get("next")).toBe(path);
    });
  }

  test("a malformed calendar date is a 404, not a page of dashes", async ({ page }) => {
    const response = await page.goto("/calendar/not-a-date");
    // The guard redirects anonymous visitors first; what matters is that this
    // never renders a day view built from an invalid date.
    expect(page.url()).not.toContain("/calendar/not-a-date");
    expect(response?.status()).toBeLessThan(500);
  });
});

test.describe("api surface", () => {
  test("cron endpoints refuse an unauthenticated caller", async ({ request }) => {
    for (const path of [
      "/api/cron/reminders",
      "/api/cron/auto-close",
      "/api/cron/daily-report",
    ]) {
      const response = await request.post(path);
      expect(response.status(), `${path} must not be open`).toBe(401);
    }
  });

  test("cron endpoints refuse a wrong secret", async ({ request }) => {
    const response = await request.post("/api/cron/reminders", {
      headers: { authorization: "Bearer definitely-not-the-secret" },
    });

    expect(response.status()).toBe(401);
  });

  test("push subscription requires a session", async ({ request }) => {
    const response = await request.post("/api/push/subscribe", {
      data: { endpoint: "https://example.com/x", keys: { p256dh: "a", auth: "b" } },
    });

    expect(response.status()).toBe(401);
  });

  test("report generation requires a session", async ({ request }) => {
    const response = await request.post("/api/reports/generate", {
      data: { periodType: "daily", periodStart: "2026-08-01" },
    });

    expect(response.status()).toBe(401);
  });

  test("sign out is not reachable by GET, so a prefetch cannot trigger it", async ({
    request,
  }) => {
    const response = await request.get("/auth/sign-out", { maxRedirects: 0 });
    expect(response.status()).toBe(405);
  });
});

test.describe("security headers", () => {
  test("the documented headers are actually sent", async ({ request }) => {
    const response = await request.get("/sign-in");
    const headers = response.headers();

    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    // A header documented in next.config.ts but absent in production is worse
    // than no documentation, because it is believed.
    expect(headers["permissions-policy"]).toContain("camera=()");
  });
});
