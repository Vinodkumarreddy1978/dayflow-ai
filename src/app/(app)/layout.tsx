import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SessionProvider } from "@/lib/session-context";
import { AppFrame } from "@/components/layout/app-frame";

/**
 * The authenticated boundary.
 *
 * Middleware already redirects unauthenticated requests, but this check is not
 * redundant: middleware can be skipped by matcher changes or route rewrites, and
 * an authorisation gate that exists in exactly one place is a gate waiting to be
 * bypassed. DF-SEC-021.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const [profileResult, settingsResult] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    supabase.from("settings").select("timezone").eq("user_id", user.id).maybeSingle(),
  ]);

  return (
    <SessionProvider
      value={{
        userId: user.id,
        email: user.email ?? "",
        displayName: profileResult.data?.display_name ?? null,
        // Falls back to UTC only if seeding failed; the client corrects this
        // from the browser's own timezone as soon as settings load.
        timeZone: settingsResult.data?.timezone ?? "UTC",
      }}
    >
      <AppFrame>{children}</AppFrame>
    </SessionProvider>
  );
}
