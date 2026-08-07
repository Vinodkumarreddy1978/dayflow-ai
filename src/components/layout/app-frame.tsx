"use client";

import { useEffect, type ReactNode } from "react";
import { useSession } from "@/lib/session-context";
import { shouldAdoptBrowserTimeZone } from "@/lib/domain/timezone";
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

  // Correct the stored timezone when the user has genuinely moved, and only
  // where the stored value was itself detected rather than chosen.
  //
  // The condition used to be nothing more than "the browser disagrees", which is
  // also true of someone who deliberately keeps their days in a zone they are
  // not standing in. Their choice was written, this effect saw the disagreement
  // it had just created, and the device's zone went straight back over the top:
  // the timezone could not be changed at all. `shouldAdoptBrowserTimeZone` is
  // where that distinction now lives.
  useEffect(() => {
    if (!settings) return;

    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!shouldAdoptBrowserTimeZone(settings, browserZone)) return;

    // No `timezone_source`, so the row stays marked as detected and a later move
    // is corrected too. Nothing is announced: this is a correction of a value the
    // user never set, and the settings screen is where a change they did make is
    // confirmed instead.
    updateSettings.mutate({ timezone: browserZone });
    // Deliberately keyed on the stored values only: including the mutation object
    // would re-run this on every render and fight itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.timezone, settings?.timezone_source]);

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
