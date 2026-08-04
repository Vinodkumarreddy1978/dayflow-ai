"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import {
  authErrorMessage,
  isTransportError,
  OPERATIONS_UNAVAILABLE,
} from "./auth-messages";

export function ResetPasswordForm() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Warmed once the form is on screen, so that the download is over before the
  // user has finished typing. See auth-operations for why it is not a static
  // import, and auth-form for why a failed warm-up is ignored.
  useEffect(() => {
    void import("./auth-operations").catch(() => undefined);
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const operations = await import("./auth-operations").catch(() => null);

      if (operations === null) {
        setError(OPERATIONS_UNAVAILABLE);
        return;
      }

      const { error: resetError } = await operations.requestPasswordReset(email.trim());

      // Only a failure to reach Supabase at all is reported. Every answer the
      // API itself gives is treated as success, because telling a stranger "no
      // account with that email" turns this form into a way of discovering who
      // has an account here. DF-UX-191.
      if (isTransportError(resetError)) {
        setError(authErrorMessage(resetError));
        return;
      }

      setSent(true);
    } catch (caught) {
      // Supabase reports its refusals in the result rather than by throwing, so
      // anything arriving here is a fault in the client. Reporting it discloses
      // nothing about the address, which is what DF-UX-191 constrains; saying
      // nothing would leave a form that visibly did nothing at all.
      setError(authErrorMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4 text-center" role="status">
        <MailCheck className="mx-auto size-8 text-success" aria-hidden="true" />
        <p className="text-sm text-text-muted">
          If an account exists for {email.trim()}, a reset link is on its way. The link
          works once and expires after an hour.
        </p>
        <Link href="/sign-in" className="text-sm font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      </div>
    );
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

      {error && (
        <p
          role="alert"
          className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" isLoading={isSubmitting}>
        Send reset link
      </Button>

      <p className="text-center text-sm text-text-muted">
        <Link href="/sign-in" className="font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
