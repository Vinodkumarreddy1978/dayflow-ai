import type { Metadata } from "next";
import { UpdatePasswordForm } from "@/features/auth/update-password-form";

export const metadata: Metadata = { title: "New password" };

export default function UpdatePasswordPage() {
  return (
    <>
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-text">Choose a new password</h1>
        <p className="mt-1 text-sm text-text-muted">
          You will be signed in on this device once it is saved.
        </p>
      </div>

      <UpdatePasswordForm />
    </>
  );
}
