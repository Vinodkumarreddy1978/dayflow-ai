"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Plus } from "lucide-react";
import { useRealtimeSync } from "@/lib/query/use-realtime-sync";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { isActiveRoute, moreNavItems, navItems, primaryNavItems } from "./nav-items";

interface AppShellProps {
  userId: string;
  userEmail: string;
  displayName: string | null;
  onQuickAdd: () => void;
  children: React.ReactNode;
}

/**
 * The authenticated frame: sidebar on desktop, tab bar on mobile.
 *
 * Both are always visible rather than hidden behind a hamburger. A menu that
 * must be opened before it can be read costs a tap on every navigation, and the
 * screen space it saves is space this product does not need. DF-IA-023.
 *
 * The fifth phone tab is More, not Settings: Goals, Insights, Categories,
 * Search and Settings live behind that sheet so the bar stays at five taps and
 * every destination remains reachable below 768px. DF-UX-001.
 */
export function AppShell({
  userId,
  userEmail,
  displayName,
  onQuickAdd,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  useRealtimeSync(userId);

  const moreActive = moreNavItems.some((item) => isActiveRoute(pathname, item.href));

  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface-raised md:flex">
        <div className="px-5 py-5">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-md bg-accent text-sm font-bold text-on-accent">
              D
            </span>
            <span className="text-sm font-semibold text-text">DayFlow AI</span>
          </Link>
        </div>

        <div className="px-3">
          <button
            type="button"
            onClick={onQuickAdd}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-accent text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover"
          >
            <Plus className="size-4" aria-hidden="true" />
            Add activity
          </button>
        </div>

        <nav aria-label="Main" className="mt-4 flex-1 space-y-0.5 px-3">
          {navItems.map((item) => {
            const active = isActiveRoute(pathname, item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors",
                  active
                    ? "bg-accent-subtle font-medium text-accent"
                    : "text-text-muted hover:bg-surface-sunken hover:text-text",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <div className="truncate px-2 py-1">
            <p className="truncate text-sm font-medium text-text">
              {displayName ?? "Your account"}
            </p>
            <p className="truncate text-xs text-text-muted">{userEmail}</p>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main
          id="main"
          className="pb-safe mx-auto w-full max-w-5xl flex-1 px-4 py-5 md:px-8"
        >
          {children}
        </main>
      </div>

      {/*
        Mobile tab bar. Shadow and an opaque surface so it cannot disappear into
        the page behind it — especially in dark mode, where the border token
        matches the raised surface and a hairline alone is invisible.
      */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border-strong bg-surface-raised pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_12px_rgb(15_23_42_/_0.08)] md:hidden dark:shadow-[0_-4px_12px_rgb(0_0_0_/_0.45)]"
      >
        <div className="mx-auto grid max-w-md grid-cols-5">
          {primaryNavItems.slice(0, 2).map((item) => (
            <TabLink key={item.href} item={item} pathname={pathname} />
          ))}

          <div className="grid place-items-center">
            <button
              type="button"
              onClick={onQuickAdd}
              aria-label="Add activity"
              className="-mt-5 grid size-14 place-items-center rounded-full bg-accent text-on-accent shadow-[var(--shadow-raised)] transition-transform active:scale-95"
            >
              <Plus className="size-6" aria-hidden="true" />
            </button>
          </div>

          {primaryNavItems.slice(2, 3).map((item) => (
            <TabLink key={item.href} item={item} pathname={pathname} />
          ))}

          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-current={moreActive ? "page" : undefined}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={cn(
              "flex h-16 flex-col items-center justify-center gap-1 text-[11px] transition-colors",
              moreActive ? "text-accent" : "text-text-muted",
            )}
          >
            <Menu className="size-5" aria-hidden="true" />
            More
          </button>
        </div>
      </nav>

      <Modal
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="More"
        description="Everything else in DayFlow."
        size="sm"
      >
        <nav aria-label="More" className="space-y-1">
          {moreNavItems.map((item) => {
            const active = isActiveRoute(pathname, item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setMoreOpen(false)}
                className={cn(
                  "flex h-12 items-center gap-3 rounded-md px-3 text-sm transition-colors",
                  active
                    ? "bg-accent-subtle font-medium text-accent"
                    : "text-text hover:bg-surface-sunken",
                )}
              >
                <Icon className="size-5 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </Modal>
    </div>
  );
}

function TabLink({
  item,
  pathname,
}: {
  item: (typeof navItems)[number];
  pathname: string;
}) {
  const active = isActiveRoute(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-16 flex-col items-center justify-center gap-1 text-[11px] transition-colors",
        active ? "text-accent" : "text-text-muted",
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
      {item.label}
    </Link>
  );
}
