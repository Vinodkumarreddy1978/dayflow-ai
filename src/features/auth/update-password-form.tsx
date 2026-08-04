"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import {
  authErrorMessage,
  isRecoveryLinkError,
  OPERATIONS_UNAVAILABLE,
} from "./auth-messages";
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_HINT,
  PASSWORD_TOO_SHORT,
} from "./password-policy";

/**
 * A spent or missing recovery session is reported from the save rather than
 * from a check on mount. A check cannot tell "there is no session" apart from
 * "the question could not be asked", so a dropped request would present itself
 * as a dead link to someone whose link is perfectly good. The save distinguishes
 * the two, and it is the point at which the answer actually matters.
 */
export function UpdatePasswordForm() {
  const router = useRouter();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkSpent, setLinkSpent] = useState(false);

  const mismatch = confirmation.length > 0 && password !== confirmation;
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;

  // Warmed once the form is on screen, so that the download is over before the
  // user has finished typing. See auth-operations for why it is not a static
  // import, and auth-form for why a failed warm-up is ignored.
  useEffect(() => {
    void import("./auth-operations").catch(() => undefined);
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (mismatch || tooShort || password.length === 0) return;

    setIsSubmitting(true);
    setError(null);

    const operations = await import("./auth-operations").catch(() => null);

    if (operations === null) {
      // Cleared on each failing path rather than in a finally, because the
      // success path navigates away and the button has to keep its loading state
      // until the new screen replaces it.
      setError(OPERATIONS_UNAVAILABLE);
      setIsSubmitting(false);
      return;
    }

    const { error: updateError } = await operations.updatePassword(password);

    if (updateError) {
      setError(authErrorMessage(updateError));
      setLinkSpent(isRecoveryLinkError(updateError));
      setIsSubmitting(false);
      return;
    }

    // The dashboard looks identical whether or not the password changed, so
    // without this the user has no way to know the save took effect.
    toast.success("Your password has been changed.");
    router.replace("/dashboard");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Field
        label="New password"
        required
        hint={PASSWORD_HINT}
        error={tooShort ? PASSWORD_TOO_SHORT : undefined}
      >
        {({ id, describedBy }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        )}
      </Field>

      <Field
        label="Confirm new password"
        required
        error={mismatch ? "These do not match." : undefined}
      >
        {({ id, describedBy }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            type="password"
            autoComplete="new-password"
            required
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
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

      {linkSpent ? (
        // Nothing typed into this form can succeed once the link is spent, so
        // the way out replaces the action rather than sitting beside it.
        <Link href="/reset-password" className="block">
          <Button type="button" size="lg" className="w-full">
            Request a new link
          </Button>
        </Link>
      ) : (
        <Button
          type="submit"
          size="lg"
          className="w-full"
          isLoading={isSubmitting}
          disabled={mismatch || tooShort || password.length === 0}
        >
          Save new password
        </Button>
      )}
    </form>
  );
}
