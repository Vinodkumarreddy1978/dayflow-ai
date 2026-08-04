import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "@/features/auth/auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <>
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-text">Welcome back</h1>
        <p className="mt-1 text-sm text-text-muted">
          Sign in to pick up where your day left off.
        </p>
      </div>

      {/* useSearchParams requires a Suspense boundary during static rendering. */}
      <Suspense fallback={<div className="h-72" />}>
        <AuthForm mode="sign-in" />
      </Suspense>
    </>
  );
}
