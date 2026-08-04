import { describe, expect, it } from "vitest";
import {
  AccountDeletionError,
  DELETION_CONFIRMATION_PHRASE,
  describeAccountDeletionError,
  isDeletionConfirmed,
  requestAccountDeletion,
  type AccountDeletionClient,
} from "./delete-account";

type RpcError = { code?: string; message?: string } | null;

function fakeClient(error: RpcError = null) {
  const calls: string[] = [];

  const client: AccountDeletionClient = {
    rpc(fn) {
      calls.push(fn);
      return Promise.resolve({ error });
    },
  };

  return { client, calls };
}

/** The refusal itself, so a test can read the code and the copy the user is shown. */
async function refusalFrom(attempt: Promise<void>): Promise<AccountDeletionError> {
  try {
    await attempt;
  } catch (error) {
    return error as AccountDeletionError;
  }

  throw new Error("Expected the deletion to be refused");
}

describe("isDeletionConfirmed", () => {
  it("accepts the phrase exactly", () => {
    expect(isDeletionConfirmed(DELETION_CONFIRMATION_PHRASE)).toBe(true);
  });

  it("forgives the capital a phone keyboard adds and the space a paste leaves", () => {
    expect(isDeletionConfirmed("Delete My Account")).toBe(true);
    expect(isDeletionConfirmed("  delete my account  ")).toBe(true);
    expect(isDeletionConfirmed("delete  my   account")).toBe(true);
  });

  it("refuses anything that is not the phrase", () => {
    expect(isDeletionConfirmed("")).toBe(false);
    expect(isDeletionConfirmed("delete")).toBe(false);
    expect(isDeletionConfirmed("delete my")).toBe(false);
    expect(isDeletionConfirmed("delete my accounts")).toBe(false);
    expect(isDeletionConfirmed("please delete my account")).toBe(false);
    expect(isDeletionConfirmed("yes")).toBe(false);
  });
});

describe("requestAccountDeletion", () => {
  it("does not call the database until the phrase is typed", async () => {
    // DF-SET-024. The interface also disables the button, but the button is not the
    // guarantee: this is the only place the two cannot disagree.
    const { client, calls } = fakeClient();

    await expect(requestAccountDeletion(client, "delete")).rejects.toMatchObject({
      code: "CONFIRMATION_REQUIRED",
    });
    expect(calls).toEqual([]);
  });

  it("refuses an empty confirmation", async () => {
    const { client, calls } = fakeClient();

    await expect(requestAccountDeletion(client, "")).rejects.toBeInstanceOf(
      AccountDeletionError,
    );
    expect(calls).toEqual([]);
  });

  it("calls delete_account once when the phrase is right", async () => {
    const { client, calls } = fakeClient();

    await expect(
      requestAccountDeletion(client, DELETION_CONFIRMATION_PHRASE),
    ).resolves.toBeUndefined();
    expect(calls).toEqual(["delete_account"]);
  });

  it("reports a missing function as an error, not a deletion", async () => {
    // Migration 0015 is not applied to the live project, so this is today's real
    // behaviour rather than a hypothetical one. Reporting success here would tell a
    // user they had left when every row is still there.
    for (const code of ["PGRST202", "42883"]) {
      const { client } = fakeClient({ code, message: "function does not exist" });

      await expect(
        requestAccountDeletion(client, DELETION_CONFIRMATION_PHRASE),
      ).rejects.toMatchObject({ code: "NOT_AVAILABLE" });
    }
  });

  it("says plainly that a missing function means nothing was deleted", async () => {
    const { client } = fakeClient({ code: "PGRST202" });

    await expect(
      requestAccountDeletion(client, DELETION_CONFIRMATION_PHRASE),
    ).rejects.toThrow(/not been applied[\s\S]*Nothing has been deleted/);
  });

  it("recognises the function's own refusal when there is no session", async () => {
    const { client } = fakeClient({ code: "DF040" });

    await expect(
      requestAccountDeletion(client, DELETION_CONFIRMATION_PHRASE),
    ).rejects.toMatchObject({ code: "NO_SESSION" });
  });

  it("treats any other database error as a rollback", async () => {
    // The function is one transaction, so a database error means the account is
    // intact and the user can be told so without hedging.
    const { client } = fakeClient({ code: "40001", message: "serialization failure" });

    const failure = await refusalFrom(
      requestAccountDeletion(client, DELETION_CONFIRMATION_PHRASE),
    );

    expect(failure.code).toBe("REFUSED");
    expect(failure.message).toContain("Nothing has been deleted");
  });

  it("does not claim an outcome it cannot know after a transport failure", async () => {
    // supabase-js reports a failed request as an error with no code. The statement
    // may have committed before the connection dropped, so the honest answer is that
    // the result is unknown.
    const { client } = fakeClient({ message: "TypeError: Failed to fetch" });

    const failure = await refusalFrom(
      requestAccountDeletion(client, DELETION_CONFIRMATION_PHRASE),
    );

    expect(failure.code).toBe("UNCONFIRMED");
    expect(failure.message).not.toContain("Nothing has been deleted");
    expect(failure.message).toContain("unknown");
  });
});

describe("describeAccountDeletionError", () => {
  it("passes through the message written for the user", () => {
    expect(
      describeAccountDeletionError(new AccountDeletionError("REFUSED", "Try again.")),
    ).toBe("Try again.");
  });

  it("never surfaces a raw failure to the user", () => {
    const message = describeAccountDeletionError(
      new Error('relation "public.delete_account" does not exist'),
    );

    expect(message).not.toContain("relation");
    expect(message).toContain("could not be deleted");
  });
});
