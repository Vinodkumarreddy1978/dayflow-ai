import type { Metadata } from "next";
import { ResetPasswordForm } from "@/features/auth/reset-password-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  return (
    <>
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-text">Reset your password</h1>
        <p className="mt-1 text-sm text-text-muted">
          We will email you a link to set a new one.
        </p>
      </div>

      <ResetPasswordForm />
    </>
  );
}
