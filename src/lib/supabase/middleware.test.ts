import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateSession } from "./middleware";

/**
 * The guard's signed-in half cannot be reached from an anonymous HTTP check, and
 * the recovery flow it has to survive - reset link, callback, /update-password -
 * needs a real account and a real inbox to walk through end to end. Substituting
 * the one call that decides everything, `getUser`, exercises the same branches
 * against the same code.
 *
 * The case that matters most is `/update-password` with a session: it is
 * deliberately absent from both the public list and the signed-in redirect list,
 * so a mistake in either would strand a user who has just proved they own the
 * address, on the only screen that can fix their password.
 */
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser } }),
}));

const SIGNED_OUT = { data: { user: null } };
const SIGNED_IN = { data: { user: { id: "00000000-0000-0000-0000-000000000000" } } };

function request(pathname: string) {
  return new NextRequest(`http://localhost:3000${pathname}`);
}

/** The destination of a redirect, or null when the request was let through. */
function redirectedTo(response: Response) {
  const location = response.headers.get("location");
  return location === null ? null : new URL(location).pathname + new URL(location).search;
}

beforeEach(() => {
  getUser.mockReset();
});

describe("signed out", () => {
  beforeEach(() => {
    getUser.mockResolvedValue(SIGNED_OUT);
  });

  it.each(["/", "/sign-in", "/sign-up", "/reset-password"])(
    "lets %s through",
    async (pathname) => {
      const response = await updateSession(request(pathname));

      expect(redirectedTo(response)).toBeNull();
    },
  );

  it("sends an authenticated route to sign-in carrying its own path", async () => {
    // DF-SYN-051. Without the parameter the user signs in and lands on the
    // dashboard having asked for something else.
    const response = await updateSession(request("/dashboard"));

    expect(response.status).toBe(307);
    expect(redirectedTo(response)).toBe("/sign-in?next=%2Fdashboard");
  });

  it("guards /update-password rather than showing a form that cannot save", async () => {
    const response = await updateSession(request("/update-password"));

    expect(redirectedTo(response)).toBe("/sign-in?next=%2Fupdate-password");
  });

  it("does not redirect the callback that creates the session", async () => {
    const response = await updateSession(
      request("/auth/callback?next=/update-password&code=abc"),
    );

    expect(redirectedTo(response)).toBeNull();
  });

  it.each([
    "/api/cron/reminders",
    "/api/cron/auto-close",
    "/api/cron/daily-report",
    "/api/push/subscribe",
    "/api/reports/generate",
  ])("leaves %s to answer for itself", async (pathname) => {
    // pg_net holds no session, and a redirect would replace the endpoint it was
    // scheduled to call with an HTML sign-in page.
    const response = await updateSession(request(pathname));

    expect(redirectedTo(response)).toBeNull();
  });
});

describe("signed in", () => {
  beforeEach(() => {
    getUser.mockResolvedValue(SIGNED_IN);
  });

  it("lets a recovery session reach /update-password", async () => {
    const response = await updateSession(request("/update-password"));

    expect(redirectedTo(response)).toBeNull();
  });

  it.each(["/sign-in", "/sign-up", "/reset-password"])(
    "sends %s to the dashboard",
    async (pathname) => {
      // DF-UX-192.
      const response = await updateSession(request(pathname));

      expect(response.status).toBe(307);
      expect(redirectedTo(response)).toBe("/dashboard");
    },
  );

  it("drops the next parameter when bouncing off an auth screen", async () => {
    // Carrying it over would send the user back to the screen they were just
    // redirected away from.
    const response = await updateSession(request("/sign-in?next=%2Fsign-in"));

    expect(redirectedTo(response)).toBe("/dashboard");
  });

  it("does not redirect the dashboard onto itself", async () => {
    const response = await updateSession(request("/dashboard"));

    expect(redirectedTo(response)).toBeNull();
  });
});
