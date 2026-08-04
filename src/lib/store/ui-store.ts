import { create } from "zustand";

/**
 * Ephemeral interface state only.
 *
 * Anything that comes from the database belongs in TanStack Query, not here.
 * Mixing the two produces two sources of truth for the same value, and the one
 * that is wrong is always the one being displayed. DF-SYN-002.
 */

export interface MomentModalState {
  mode: "create" | "edit" | "close";
  momentId?: string;
  /** Pre-selected when starting from an empty slot on the timeline. */
  presetStartAt?: string;
}

interface UiState {
  momentModal: MomentModalState | null;
  openCreateMoment: (presetStartAt?: string) => void;
  openEditMoment: (momentId: string) => void;
  openCloseMoment: (momentId: string) => void;
  closeMomentModal: () => void;

  theme: "light" | "dark" | "system";
  setTheme: (theme: "light" | "dark" | "system") => void;
}

export const useUiStore = create<UiState>((set) => ({
  momentModal: null,

  openCreateMoment: (presetStartAt) =>
    set({ momentModal: { mode: "create", presetStartAt } }),
  openEditMoment: (momentId) => set({ momentModal: { mode: "edit", momentId } }),
  openCloseMoment: (momentId) => set({ momentModal: { mode: "close", momentId } }),
  closeMomentModal: () => set({ momentModal: null }),

  theme: "system",
  setTheme: (theme) => {
    set({ theme });
    if (typeof document === "undefined") return;

    localStorage.setItem("dayflow-theme", theme);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const shouldBeDark = theme === "dark" || (theme === "system" && prefersDark);
    document.documentElement.classList.toggle("dark", shouldBeDark);
  },
}));
