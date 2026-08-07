"use client";

import { useEffect, type ReactNode } from "react";
import { useSession } from "@/lib/session-context";
import { useUiStore } from "@/lib/store/ui-store";
import { useSettings } from "@/features/settings/use-settings";
import { useUpdateSettings } from "@/features/settings/use-update-settings";
import { MomentModal } from "@/features/moments/moment-modal";
import { AppShell } from "./app-shell";

/**
 * Client half of the authenticated layout: navigation, the theme, and the single
 * shared Moment dialog.
 *
 * The dialog lives here rather than inside each screen so that "add activity"
 * behaves identically from the sidebar, the mobile tab bar, an empty timeline
 * slot or a keyboard shortcut, with one implementation behind all of them.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  const session = useSession();
  const openCreateMoment = useUiStore((state) => state.openCreateMoment);

  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();

  // Apply the stored theme. The inline script in the root layout has already
  // prevented the flash; this keeps the class correct after a preference change
  // on another device arrives over realtime.
  useEffect(() => {
    if (!settings?.theme) return;

    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const shouldBeDark =
      settings.theme === "dark" || (settings.theme === "system" && prefersDark);

    document.documentElement.classList.toggle("dark", shouldBeDark);
    localStorage.setItem("dayflow-theme", settings.theme);
  }, [settings?.theme]);

  // Correct the stored timezone when the user has genuinely moved.
  //
  // Runs once settings are loaded and only when the browser disagrees. Without
  // this, someone who relocates keeps seeing their days boundaried by their old
  // timezone, which shifts every chart by hours with no visible cause.
  useEffect(() => {
    if (!settings) return;

    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!browserZone || browserZone === settings.timezone) return;

    updateSettings.mutate({ timezone: browserZone });
    // Deliberately keyed on the stored value only: including the mutation object
    // would re-run this on every render and fight itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.timezone]);

  // Global shortcut. Ignored while typing, or it would swallow the letter.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;

      if (isTyping || event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key.toLowerCase() === "a") {
        event.preventDefault();
        openCreateMoment();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openCreateMoment]);

  return (
    <>
      <AppShell
        userId={session.userId}
        userEmail={session.email}
        displayName={session.displayName}
        onQuickAdd={() => openCreateMoment()}
      >
        {children}
      </AppShell>

      <MomentModal />
    </>
  );
}
