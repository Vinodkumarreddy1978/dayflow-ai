"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info";

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  toast: (input: Omit<Toast, "id">) => void;
  success: (message: string, action?: Toast["action"]) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Errors persist longer, and a toast with an action needs time to be used. */
function durationFor(toast: Omit<Toast, "id">): number {
  if (toast.tone === "error") return 7000;
  if (toast.action) return 8000;
  return 4000;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (input: Omit<Toast, "id">) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-2), { ...input, id }]);
      window.setTimeout(() => dismiss(id), durationFor(input));
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (message, action) => toast({ tone: "success", message, action }),
      error: (message) => toast({ tone: "error", message }),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/*
        Sits above the mobile tab bar rather than behind it. A confirmation the
        user cannot read is the same as no confirmation.
      */}
      <div
        role="region"
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:right-6 md:left-auto md:items-end md:px-0"
      >
        {toasts.map((item) => (
          <div
            key={item.id}
            // Assertive for errors only: a success confirmation should not
            // interrupt whatever the screen reader is currently announcing.
            role={item.tone === "error" ? "alert" : "status"}
            aria-live={item.tone === "error" ? "assertive" : "polite"}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-[var(--shadow-raised)]",
              "motion-safe:animate-[df-scale-in_180ms_ease-out]",
              item.tone === "success" &&
                "border-transparent bg-success-subtle text-success",
              item.tone === "error" && "border-transparent bg-danger-subtle text-danger",
              item.tone === "info" && "border-border bg-surface-raised text-text",
            )}
          >
            <span className="min-w-0 flex-1">{item.message}</span>

            {item.action && (
              <button
                type="button"
                onClick={() => {
                  item.action?.onClick();
                  dismiss(item.id);
                }}
                className="shrink-0 font-semibold underline underline-offset-2"
              >
                {item.action.label}
              </button>
            )}

            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss"
              className="shrink-0 opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside a ToastProvider");
  }
  return context;
}
