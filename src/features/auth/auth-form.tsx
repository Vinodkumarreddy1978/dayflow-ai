"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import {
  authErrorMessage,
  callbackNotice,
  OPERATIONS_UNAVAILABLE,
} from "./auth-messages";
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_HINT,
  PASSWORD_TOO_SHORT,
} from "./password-policy";
import { safeNextPath } from "./redirect-guard";

type Mode = "sign-in" | "sign-up";

/**
 * Sign in and sign up share one component because the forms are identical apart
 * from the copy and which Supabase call they make. Two near-identical files
 * would drift the first time one of them was fixed.
 */
export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Seeded from the query string so a broken link explains itself, then cleared
  // on the next submit like any other notice.
  const [notice, setNotice] = useState<string | null>(() =>
    callbackNotice(searchParams.get("error")),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSignUp = mode === "sign-up";

  // Warmed once the form is on screen, so that the download is over long before
  // anyone has finished typing a password. Without this the lazy import would
  // move the cost from first load to the submit, where it is felt.
  //
  // A warm-up that fails is deliberately ignored. The submit imports the same
  // module again and reports the failure there, where someone is waiting on it.
  useEffect(() => {
    void import("./auth-operations").catch(() => undefined);
  }, []);

  // The form is noValidate, so minLength on the input never fires and this is
  // the only thing standing between a two-character password and the account.
  // Checked on sign-up only: an existing password that predates the rule still
  // has to be usable to sign in with.
  const tooShort =
    isSignUp && password.length > 0 && password.length < MIN_PASSWORD_LENGTH;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (tooShort) return;

    setError(null);
    setNotice(null);
    setIsSubmitting(true);

    try {
      const operations = await import("./auth-operations").catch(() => null);

      if (operations === null) {
        setError(OPERATIONS_UNAVAILABLE);
        return;
      }

      if (isSignUp) {
        const { data, error: signUpError } = await operations.signUpWithPassword(
          email,
          password,
        );

        if (signUpError) throw signUpError;

        // With email confirmation on, there is no session yet. Saying so is
        // better than a redirect to a screen that bounces straight back.
        if (data.session === null) {
          setNotice(
            "Check your email for a confirmation link, then come back and sign in.",
          );
          return;
        }
      } else {
        const { error: signInError } = await operations.signInWithPassword(
          email,
          password,
        );
        if (signInError) throw signInError;
      }

      router.push(safeNextPath(searchParams.get("next")));
      // The server layout reads the session, so the tree must be refetched or
      // the app renders with the previous (signed-out) state.
      router.refresh();
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Field label="Email" required>
        {({ id, describedBy }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        )}
      </Field>

      <Field
        label="Password"
        required
        hint={isSignUp ? PASSWORD_HINT : undefined}
        error={tooShort ? PASSWORD_TOO_SHORT : undefined}
      >
        {({ id, describedBy }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            type="password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            required
            minLength={isSignUp ? MIN_PASSWORD_LENGTH : undefined}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        )}
      </Field>

      {!isSignUp && (
        <p className="text-right text-sm">
          <Link
            href="/reset-password"
            className="font-medium text-accent hover:underline"
          >
            Forgot your password?
          </Link>
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}

      {notice && (
        <p
          role="status"
          className="rounded-md bg-info-subtle px-3 py-2 text-sm text-info"
        >
          {notice}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        isLoading={isSubmitting}
        disabled={tooShort}
      >
        {isSignUp ? "Create account" : "Sign in"}
      </Button>

      <p className="text-center text-sm text-text-muted">
        {isSignUp ? "Already have an account? " : "New here? "}
        <Link
          href={isSignUp ? "/sign-in" : "/sign-up"}
          className="font-medium text-accent hover:underline"
        >
          {isSignUp ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
