import { expect, test } from "@playwright/test";

/**
 * The flows that need a real signed-in user against a real Supabase project.
 *
 * These skip rather than fail when credentials are absent. A suite that goes red
 * on every developer machine and every fork's CI teaches people to ignore red,
 * which costs more than the coverage is worth.
 *
 * To run them, set in .env.local (or the CI secret store):
 *   E2E_EMAIL     an existing account in the linked Supabase project
 *   E2E_PASSWORD  its password
 *
 * Use a throwaway account. These tests create and delete Moments.
 */
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.skip(
  !email || !password,
  "Set E2E_EMAIL and E2E_PASSWORD to run the authenticated suite.",
);

test.beforeEach(async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel(/email/i).fill(email!);
  await page.getByLabel(/password/i).fill(password!);
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
});

test("the dashboard shows the queue and today's timeline", async ({ page }) => {
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: /timeline/i })).toBeVisible();
});

test("a Moment can be started with only a category and a start time", async ({
  page,
}) => {
  // The queue is the product's distinguishing mechanic, so this is the single
  // most important path in the application.
  await page
    .getByRole("button", { name: /add|new activity/i })
    .first()
    .click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByLabel(/category/i).selectOption({ index: 1 });
  await dialog.getByRole("button", { name: /save|start/i }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText(/still open|open now|pending/i).first()).toBeVisible();
});

test("the queue refuses a third pending activity", async ({ page }) => {
  // With the default limit of two, the third attempt must be refused outright
  // rather than warned about. ADR-009.
  const openCount = await page.getByTestId("pending-moment").count();

  for (let i = openCount; i < 2; i += 1) {
    await page
      .getByRole("button", { name: /add|new activity/i })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/category/i).selectOption({ index: i + 1 });
    await dialog.getByRole("button", { name: /save|start/i }).click();
    await expect(dialog).toBeHidden();
  }

  await page
    .getByRole("button", { name: /add|new activity/i })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/category/i).selectOption({ index: 3 });

  await expect(dialog.getByText(/close one|already have/i)).toBeVisible();
});

test("navigation reaches every screen without a client error", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  for (const name of [/analytics/i, /calendar/i, /goals/i, /insights/i, /settings/i]) {
    await page.getByRole("link", { name }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }

  expect(errors).toEqual([]);
});

test("settings changes persist across a reload", async ({ page }) => {
  await page.goto("/settings");

  const queueLimit = page.getByLabel(/open activities allowed/i);
  await queueLimit.selectOption("3");

  await page.reload();
  await expect(page.getByLabel(/open activities allowed/i)).toHaveValue("3");

  await page.getByLabel(/open activities allowed/i).selectOption("2");
});

test("a report can be generated without AI switched on", async ({ page }) => {
  await page.goto("/insights");

  await page.getByRole("button", { name: /generate|regenerate/i }).click();

  // The deterministic path is a real report, not a placeholder, so this must
  // succeed with no provider configured.
  await expect(page.getByText(/no ai|ai wording/i).first()).toBeVisible({
    timeout: 30_000,
  });
});
