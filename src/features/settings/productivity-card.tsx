"use client";

import { useMemo } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/field";
import { useCategories } from "@/features/categories/use-categories";
import type { SettingsInput } from "@/lib/schemas";
import type { Settings } from "@/lib/supabase/database.types";

/**
 * Productivity weights - DF-SET-005 counts these among the settings that change
 * how existing data reads.
 *
 * Split out and deferred for the reason `data-export-card.tsx` gives: it is the
 * only card on this screen that needs the category tree, it sits six cards down,
 * and the route has no headroom. A skeleton rather than nothing while it
 * arrives, because this one has cards below it that would otherwise jump.
 */
export function ProductivityCard({
  settings,
  set,
}: {
  settings: Settings;
  set: (patch: SettingsInput) => void;
}) {
  const { tree } = useCategories();
  const weights = useMemo(
    () => (settings.productivity_weights ?? {}) as Record<string, number>,
    [settings.productivity_weights],
  );

  return (
    <Card>
      <CardHeader
        title="Productivity score"
        description="You decide what counts. A weight of zero means a group is neither good nor bad for the score."
      />

      <div className="space-y-4 p-4 pt-0">
        <Switch
          checked={settings.productivity_enabled}
          onChange={(checked) => set({ productivity_enabled: checked })}
          label="Show a productivity score"
        />

        {settings.productivity_enabled && (
          <div className="space-y-3">
            {tree.parents.map((parent) => {
              const weight = weights[parent.id] ?? 0;
              // The reserved group. Its weight is shown but not offered: see
              // `assertNoLockedWeightChange`, which refuses the write as well.
              const locked = parent.is_system;

              return (
                <div key={parent.id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <label
                      htmlFor={`weight-${parent.id}`}
                      className="flex min-w-0 items-center gap-2 text-sm text-text"
                    >
                      <span
                        aria-hidden="true"
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: parent.color }}
                      />
                      <span className="truncate">{parent.name}</span>
                    </label>
                    <span className="shrink-0 text-sm tabular-nums text-text-muted">
                      {weight > 0 ? `+${weight.toFixed(1)}` : weight.toFixed(1)}
                    </span>
                  </div>

                  {/*
                    The slider works in tenths and the stored weight is -1 to 1,
                    matching get_productivity_score. Storing the slider's own
                    integers would silently make every weight a hundred times too
                    large, and the score would peg at 100 for everyone.
                  */}
                  <input
                    id={`weight-${parent.id}`}
                    type="range"
                    min={-10}
                    max={10}
                    step={1}
                    value={Math.round(weight * 10)}
                    disabled={locked}
                    aria-describedby={locked ? `weight-${parent.id}-locked` : undefined}
                    onChange={(event) =>
                      set({
                        productivity_weights: {
                          ...weights,
                          [parent.id]: Number(event.target.value) / 10,
                        },
                      })
                    }
                    className="w-full accent-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
                  />

                  {locked && (
                    <p
                      id={`weight-${parent.id}-locked`}
                      className="text-xs text-text-subtle"
                    >
                      This weight is fixed, because the distraction share and the
                      productivity score have to agree on what counts as distraction.
                    </p>
                  )}
                </div>
              );
            })}

            <p className="text-xs text-text-subtle">
              Negative weights pull the score down, positive push it up, and zero means
              neutral. The result is normalised to 0-100 against the time you actually
              recorded, so a short day is not punished for being short.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
