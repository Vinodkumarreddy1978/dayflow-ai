import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "@/features/auth/auth-form";

export const metadata: Metadata = { title: "Create an account" };

export default function SignUpPage() {
  return (
    <>
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-text">Create your account</h1>
        <p className="mt-1 text-sm text-text-muted">
          You will start with a set of categories you can rename, replace or delete.
        </p>
      </div>

      <Suspense fallback={<div className="h-72" />}>
        <AuthForm mode="sign-up" />
      </Suspense>
    </>
  );
}
