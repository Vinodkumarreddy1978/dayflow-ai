"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { BellOff, BellRing, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, Skeleton } from "@/components/ui/card";
import { Field, Input, Select, Switch } from "@/components/ui/field";
import { useSession } from "@/lib/session-context";
import { usePush } from "@/features/notifications/use-push";
import { useToast } from "@/components/ui/toast";
import { useSettings } from "./use-settings";
import { useUpdateSettings } from "./use-update-settings";
import {
  confirmationFor,
  inverseOf,
  offersUndo,
  PUSH_DEVICE_OFF,
  WEEK_DAY_NAMES,
  type PendingConfirmation,
} from "./change-guard";
import { MIN_REMINDER_INTERVAL_MINUTES } from "@/lib/domain/reminder-rules";
import { formatDuration } from "@/lib/format";
import type { SettingsInput } from "@/lib/schemas";
import type { Settings } from "@/lib/supabase/database.types";

// Below-the-fold privacy controls. Their dialogs were already deferred; the card
// shells join them so the First Load chunk does not pay for icons and copy the
// user has not scrolled to. The settings route has no headroom left.
const DataExportCard = lazy(() =>
  import("./data-export-card").then((module) => ({ default: module.DataExportCard })),
);
const DeleteAccountCard = lazy(() =>
  import("./delete-account-card").then((module) => ({
    default: module.DeleteAccountCard,
  })),
);

// Deferred on the same grounds, and for the same reason the two dialogs above
// are: it carries the modal, and most visits to this screen never open it.
const ConfirmChangeDialog = lazy(() =>
  import("./confirm-change-dialog").then((module) => ({
    default: module.ConfirmChangeDialog,
  })),
);

// The only card that reads the category tree, and the sixth one down. Its own
// file so that the tree query is fetched by the people who scroll to it.
const ProductivityCard = lazy(() =>
  import("./productivity-card").then((module) => ({
    default: module.ProductivityCard,
  })),
);

const TIME_ZONES = (() => {
  // Full IANA list where the browser exposes it, falling back to a short list so
  // the control is never empty on older engines.
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
    .supportedValuesOf;

  if (typeof supported === "function") {
    try {
      return supported("timeZone");
    } catch {
      /* fall through */
    }
  }

  return [
    "UTC",
    "Asia/Kolkata",
    "Europe/London",
    "America/New_York",
    "America/Los_Angeles",
  ];
})();

/** A change held back until the user has answered the question about it. */
interface PendingChange {
  confirmation: PendingConfirmation;
  commit: () => void;
}

export function SettingsView() {
  const { email } = useSession();
  const { data: settings, isLoading } = useSettings();
  const update = useUpdateSettings();
  const toast = useToast();
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [deviceTimeZone, setDeviceTimeZone] = useState<string | null>(null);

  // Read from the device rather than from the session, which carries the zone
  // already stored: comparing that with itself is why the travel notice below
  // never appeared. In an effect because this page is server-rendered, where
  // Intl resolves to the server's own zone and disagreeing with the client is a
  // hydration error.
  useEffect(() => {
    setDeviceTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || null);
  }, []);

  if (isLoading || !settings) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const save = (patch: SettingsInput, withUndo: boolean) => {
    // Read before the write, not in the toast handler: by then the row holds the
    // value being undone. See `inverseOf`.
    const inverse = inverseOf(patch, settings);

    update.mutate(patch, {
      onSuccess: () => {
        if (!withUndo) {
          toast.success("Saved.");
          return;
        }

        toast.success("Saved.", {
          label: "Undo",
          onClick: () =>
            update.mutate(inverse, {
              // A plain confirmation rather than a second Undo. A toast that can
              // bounce a setting back and forth is a puzzle, not a safety net.
              onSuccess: () => toast.success("Reverted."),
            }),
        });
      },
    });
  };

  // There is no Save button on purpose: each control writes immediately
  // (DF-SET-003), so the protection against a mistouch has to sit around the
  // write itself. Most changes go through and the toast offers to take them
  // back; the few in `change-guard.ts` ask first, because an Undo would arrive
  // long after the change had quietly done its work.
  const set: Setter = (patch) => {
    const confirmation = confirmationFor(patch, settings, deviceTimeZone);

    if (confirmation) {
      // Every control on this screen renders from the saved row, so holding the
      // patch back also leaves the control showing its old value. Cancelling
      // needs to undo nothing.
      setPending({ confirmation, commit: () => save(patch, false) });
      return;
    }

    save(patch, offersUndo(patch));
  };

  const confirmFirst = (confirmation: PendingConfirmation, commit: () => void) => {
    setPending({ confirmation, commit });
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-text">Settings</h1>
        <p className="mt-1 text-sm text-text-muted">
          Every default in DayFlow is a suggestion. Changes save as you make them.
        </p>
      </header>

      <QueueAndRemindersCard settings={settings} set={set} />
      <NotificationsCard settings={settings} set={set} confirmFirst={confirmFirst} />
      <ValidationCard settings={settings} set={set} />
      <TimeAndLocaleCard settings={settings} set={set} deviceTimeZone={deviceTimeZone} />
      <AnalyticsCard settings={settings} set={set} />
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <ProductivityCard settings={settings} set={set} />
      </Suspense>
      <AiCard settings={settings} set={set} />
      <AppearanceCard settings={settings} set={set} />
      <AccountCard email={email} />
      <Suspense fallback={null}>
        <DataExportCard />
        <DeleteAccountCard />
      </Suspense>

      {pending && (
        <Suspense fallback={null}>
          <ConfirmChangeDialog
            pending={pending.confirmation}
            onConfirm={() => {
              pending.commit();
              setPending(null);
            }}
            onCancel={() => setPending(null)}
          />
        </Suspense>
      )}
    </div>
  );
}

/**
 * Keyed off the validation schema rather than the row type, so that a control
 * offering a value the schema forbids is a compile error rather than a rejected
 * save the user discovers by trying it.
 *
 * A patch rather than a key and a value, because two columns that have to move
 * together must also be undone together: one patch is one save, one toast and
 * one Undo that leaves the row consistent.
 */
type Setter = (patch: SettingsInput) => void;

interface SectionProps {
  settings: Settings;
  set: Setter;
}

function QueueAndRemindersCard({ settings, set }: SectionProps) {
  return (
    <Card>
      <CardHeader
        title="Queue and reminders"
        description="How many activities can be open at once, and how often DayFlow nudges you about them."
      />

      <div className="space-y-4 p-4 pt-0">
        <Field
          label="Open activities allowed at once"
          hint="Two is the default. More than a handful and the queue stops being a queue."
        >
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={String(settings.queue_limit)}
              onChange={(event) => set({ queue_limit: Number(event.target.value) })}
            >
              {[1, 2, 3, 4, 5].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Switch
          checked={settings.reminders_enabled}
          onChange={(checked) => set({ reminders_enabled: checked })}
          label="Remind me about open activities"
        />

        {settings.reminders_enabled && (
          <Field
            label="Reminder interval"
            hint={`Minimum ${MIN_REMINDER_INTERVAL_MINUTES} minutes. Reminders are never queued up while quiet hours are on - they are skipped.`}
          >
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={String(settings.reminder_interval_minutes)}
                onChange={(event) =>
                  set({ reminder_interval_minutes: Number(event.target.value) })
                }
              >
                {[10, 15, 30, 60, 120, 180, 240, 480].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    Every {formatDuration(minutes)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        <Field
          label="Warn me when something runs longer than"
          hint="A gentle check that you have not left something open by accident."
        >
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={String(settings.long_activity_warning_minutes)}
              onChange={(event) => {
                const warning = Number(event.target.value);
                // The database requires auto_close > warning. Nudging the close
                // threshold along with the warning means the user never has to
                // discover that rule from a rejected save. Both go in one patch
                // so that undoing puts back a pair the database still accepts.
                set({
                  long_activity_warning_minutes: warning,
                  ...(settings.auto_close_minutes <= warning
                    ? { auto_close_minutes: Math.min(1440, warning + 180) }
                    : {}),
                });
              }}
            >
              {[60, 120, 180, 240, 300, 360, 480, 720].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {formatDuration(minutes)}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Switch
          checked={settings.auto_close_enabled}
          onChange={(checked) => set({ auto_close_enabled: checked })}
          label="Close forgotten activities automatically"
          description="Recorded as an estimate, marked as such, and always editable."
        />

        {settings.auto_close_enabled && (
          <Field
            label="Close automatically after"
            error={
              settings.auto_close_minutes <= settings.long_activity_warning_minutes
                ? "Must be longer than the warning threshold."
                : undefined
            }
          >
            {({ id }) => (
              <Select
                id={id}
                value={String(settings.auto_close_minutes)}
                onChange={(event) =>
                  set({ auto_close_minutes: Number(event.target.value) })
                }
              >
                {[120, 240, 360, 480, 600, 720, 960, 1440]
                  .filter((minutes) => minutes > settings.long_activity_warning_minutes)
                  .map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {formatDuration(minutes)}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
        )}
      </div>
    </Card>
  );
}

function NotificationsCard({
  settings,
  set,
  confirmFirst,
}: SectionProps & {
  confirmFirst: (confirmation: PendingConfirmation, commit: () => void) => void;
}) {
  const push = usePush();

  return (
    <Card>
      <CardHeader
        title="Notifications"
        description="Permission is granted per device, so this needs enabling on each phone or computer you use."
      />

      <div className="space-y-4 p-4 pt-0">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface-sunken p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text">This device</p>
            <p className="mt-0.5 text-xs text-text-muted">
              {push.state === "unsupported"
                ? "This browser cannot receive push notifications."
                : push.state === "unconfigured"
                  ? "Push is not configured on this deployment."
                  : push.state === "subscribed"
                    ? "Receiving notifications."
                    : push.state === "denied"
                      ? "Blocked. Re-allow notifications in your browser's site settings."
                      : "Not receiving notifications yet."}
            </p>
          </div>

          {push.state === "subscribed" ? (
            <Button
              variant="secondary"
              size="sm"
              isLoading={push.isBusy}
              // Asked about first: unsubscribing is a round trip the user cannot
              // reverse from the toast, since re-enabling needs the browser's
              // permission prompt again.
              onClick={() => confirmFirst(PUSH_DEVICE_OFF, () => void push.disable())}
            >
              <BellOff className="size-4" aria-hidden="true" />
              Turn off
            </Button>
          ) : (
            <Button
              size="sm"
              isLoading={push.isBusy}
              disabled={
                push.state === "unsupported" ||
                push.state === "unconfigured" ||
                push.state === "denied"
              }
              onClick={() => void push.enable()}
            >
              <BellRing className="size-4" aria-hidden="true" />
              Enable
            </Button>
          )}
        </div>

        <Switch
          checked={settings.notify_queue_reminders}
          onChange={(checked) => set({ notify_queue_reminders: checked })}
          label="Open activity reminders"
        />
        <Switch
          checked={settings.notify_long_activity}
          onChange={(checked) => set({ notify_long_activity: checked })}
          label="Long activity warnings"
        />
        <Switch
          checked={settings.notify_auto_close}
          onChange={(checked) => set({ notify_auto_close: checked })}
          label="Tell me when something was closed automatically"
        />
        <Switch
          checked={settings.notify_daily_review}
          onChange={(checked) => set({ notify_daily_review: checked })}
          label="Daily review"
        />

        {settings.notify_daily_review && (
          <Field label="Daily review at">
            {({ id }) => (
              <Input
                id={id}
                type="time"
                value={settings.daily_review_time.slice(0, 5)}
                onChange={(event) =>
                  set({ daily_review_time: `${event.target.value}:00` })
                }
                className="w-32"
              />
            )}
          </Field>
        )}

        <Switch
          checked={settings.notify_weekly_review}
          onChange={(checked) => set({ notify_weekly_review: checked })}
          label="Weekly review"
        />
        <Switch
          checked={settings.notify_achievements}
          onChange={(checked) => set({ notify_achievements: checked })}
          label="Streaks and achievements"
        />

        <hr className="border-border" />

        <Switch
          checked={settings.quiet_hours_enabled}
          onChange={(checked) => set({ quiet_hours_enabled: checked })}
          label="Quiet hours"
          description="Reminders during this window are skipped, not saved up for later."
        />

        {settings.quiet_hours_enabled && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="From">
              {({ id }) => (
                <Input
                  id={id}
                  type="time"
                  value={settings.quiet_hours_start.slice(0, 5)}
                  onChange={(event) =>
                    set({ quiet_hours_start: `${event.target.value}:00` })
                  }
                />
              )}
            </Field>
            <Field label="Until">
              {({ id }) => (
                <Input
                  id={id}
                  type="time"
                  value={settings.quiet_hours_end.slice(0, 5)}
                  onChange={(event) =>
                    set({ quiet_hours_end: `${event.target.value}:00` })
                  }
                />
              )}
            </Field>
          </div>
        )}
      </div>
    </Card>
  );
}

function ValidationCard({ settings, set }: SectionProps) {
  return (
    <Card>
      <CardHeader
        title="Validation"
        description="DayFlow warns rather than blocks. Overlapping activities are sometimes real."
      />

      <div className="space-y-4 p-4 pt-0">
        <Switch
          checked={settings.overlap_warn_enabled}
          onChange={(checked) => set({ overlap_warn_enabled: checked })}
          label="Warn about overlapping activities"
        />

        {settings.overlap_warn_enabled && (
          <Field label="Warn above this many overlapping at once">
            {({ id }) => (
              <Select
                id={id}
                value={String(settings.overlap_limit)}
                onChange={(event) => set({ overlap_limit: Number(event.target.value) })}
              >
                {[1, 2, 3, 4, 5, 6, 8, 10].map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        <Field
          label="Flag unrecorded gaps longer than"
          hint="Only within your waking hours, so sleep is not reported as a gap."
        >
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={String(settings.gap_warn_hours)}
              onChange={(event) => set({ gap_warn_hours: Number(event.target.value) })}
            >
              {[1, 2, 3, 4, 6, 8, 12].map((hours) => (
                <option key={hours} value={hours}>
                  {hours} hours
                </option>
              ))}
            </Select>
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Waking hours start">
            {({ id }) => (
              <Input
                id={id}
                type="time"
                value={settings.waking_start.slice(0, 5)}
                onChange={(event) => set({ waking_start: `${event.target.value}:00` })}
              />
            )}
          </Field>
          <Field label="Waking hours end">
            {({ id }) => (
              <Input
                id={id}
                type="time"
                value={settings.waking_end.slice(0, 5)}
                onChange={(event) => set({ waking_end: `${event.target.value}:00` })}
              />
            )}
          </Field>
        </div>
      </div>
    </Card>
  );
}

function TimeAndLocaleCard({
  settings,
  set,
  deviceTimeZone,
}: SectionProps & { deviceTimeZone: string | null }) {
  // Null unless the device is somewhere the stored zone does not account for,
  // which also narrows it to a string for the notice below.
  const elsewhere =
    deviceTimeZone !== null && deviceTimeZone !== settings.timezone
      ? deviceTimeZone
      : null;

  return (
    <Card>
      <CardHeader title="Time and locale" />

      <div className="space-y-4 p-4 pt-0">
        <Field
          label="Time zone"
          hint="Days, streaks and analytics are all calculated against this."
        >
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={settings.timezone}
              // Marked as chosen, which is what stops the app frame's detection
              // from writing the device's zone back over it. Migration 0018.
              onChange={(event) =>
                set({ timezone: event.target.value, timezone_source: "user" })
              }
            >
              {TIME_ZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {elsewhere && (
          // Travel is the common cause, and silently rewriting the setting would
          // shuffle the boundaries of days already recorded. So it is offered
          // here and confirmed, rather than applied on the user's behalf.
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 p-3">
            <p className="min-w-0 flex-1 text-xs text-text">
              This device is in <strong>{elsewhere}</strong>. Your days are still being
              counted in {settings.timezone}.
            </p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => set({ timezone: elsewhere, timezone_source: "user" })}
            >
              Use {elsewhere}
            </Button>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Week starts on">
            {({ id }) => (
              <Select
                id={id}
                value={String(settings.week_starts_on)}
                onChange={(event) => set({ week_starts_on: Number(event.target.value) })}
              >
                {WEEK_DAY_NAMES.map((day, index) => (
                  <option key={day} value={index}>
                    {day}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Time format">
            {({ id }) => (
              <Select
                id={id}
                value={settings.time_format}
                onChange={(event) =>
                  set({ time_format: event.target.value as SettingsInput["time_format"] })
                }
              >
                <option value="24h">24 hour</option>
                <option value="12h">12 hour</option>
              </Select>
            )}
          </Field>
        </div>
      </div>
    </Card>
  );
}

function AnalyticsCard({ settings, set }: SectionProps) {
  return (
    <Card>
      <CardHeader
        title="Analytics defaults"
        description="What you see first when you open a chart."
      />

      <div className="space-y-4 p-4 pt-0">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Default range">
            {({ id }) => (
              <Select
                id={id}
                value={settings.default_range}
                onChange={(event) =>
                  set({
                    default_range: event.target.value as SettingsInput["default_range"],
                  })
                }
              >
                <option value="daily">Day</option>
                <option value="weekly">Week</option>
                <option value="monthly">Month</option>
                <option value="yearly">Year</option>
                <option value="lifetime">All time</option>
              </Select>
            )}
          </Field>

          <Field label="Default grouping">
            {({ id }) => (
              <Select
                id={id}
                value={settings.default_grouping}
                onChange={(event) =>
                  set({
                    default_grouping: event.target
                      .value as SettingsInput["default_grouping"],
                  })
                }
              >
                <option value="parent_category">Groups</option>
                <option value="category">Individual categories</option>
              </Select>
            )}
          </Field>
        </div>

        <Field label="Chart style">
          {({ id }) => (
            <Select
              id={id}
              value={settings.chart_style}
              onChange={(event) =>
                set({ chart_style: event.target.value as SettingsInput["chart_style"] })
              }
            >
              <option value="donut">Donut</option>
              <option value="pie">Pie</option>
            </Select>
          )}
        </Field>

        <Switch
          checked={settings.show_distraction_default}
          onChange={(checked) => set({ show_distraction_default: checked })}
          label="Show distracted time by default"
        />
        <Switch
          checked={settings.include_estimated_default}
          onChange={(checked) => set({ include_estimated_default: checked })}
          label="Include estimated time by default"
          description="Estimated time comes from activities closed automatically."
        />
      </div>
    </Card>
  );
}

function AiCard({ settings, set }: SectionProps) {
  return (
    <Card>
      <CardHeader
        title="AI insights"
        description="Off until you say otherwise. Nothing is sent anywhere without this consent."
      />

      <div className="space-y-4 p-4 pt-0">
        <Switch
          checked={settings.ai_consent}
          onChange={(checked) => set({ ai_consent: checked })}
          label="Let DayFlow generate AI insights"
          description="Aggregated totals per category are sent - never your notes, email or category names you have marked private."
        />

        {settings.ai_consent && (
          <>
            <Switch
              checked={settings.ai_daily_reports}
              onChange={(checked) => set({ ai_daily_reports: checked })}
              label="Daily summary"
            />
            <Switch
              checked={settings.ai_weekly_reports}
              onChange={(checked) => set({ ai_weekly_reports: checked })}
              label="Weekly review"
            />
            <Switch
              checked={settings.ai_monthly_reports}
              onChange={(checked) => set({ ai_monthly_reports: checked })}
              label="Monthly review"
            />
            <Switch
              checked={settings.ai_recommendations}
              onChange={(checked) => set({ ai_recommendations: checked })}
              label="Suggestions and recommendations"
            />
          </>
        )}
      </div>
    </Card>
  );
}

function AppearanceCard({ settings, set }: SectionProps) {
  const [accentDraft, setAccentDraft] = useState(settings.accent_color);

  return (
    <Card>
      <CardHeader title="Appearance" />

      <div className="space-y-4 p-4 pt-0">
        <Field label="Theme">
          {({ id }) => (
            <Select
              id={id}
              value={settings.theme}
              onChange={(event) =>
                set({ theme: event.target.value as SettingsInput["theme"] })
              }
            >
              <option value="system">Match my device</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </Select>
          )}
        </Field>

        <Field label="Accent colour">
          {({ id }) => (
            <div className="flex items-center gap-3">
              <input
                id={id}
                type="color"
                value={accentDraft}
                // Committed on blur, not on change: dragging a colour picker
                // fires continuously and would send a write per pixel.
                onChange={(event) => setAccentDraft(event.target.value)}
                onBlur={() => set({ accent_color: accentDraft })}
                className="size-10 cursor-pointer rounded-md border border-border bg-transparent"
              />
              <span className="text-sm tabular-nums text-text-muted">{accentDraft}</span>
            </div>
          )}
        </Field>

        <Switch
          checked={settings.compact_mode}
          onChange={(checked) => set({ compact_mode: checked })}
          label="Compact spacing"
          description="Fits more on screen. Easier on a large monitor, tighter on a phone."
        />
      </div>
    </Card>
  );
}

function AccountCard({ email }: { email: string | null }) {
  return (
    <Card>
      <CardHeader title="Account" />

      <div className="space-y-4 p-4 pt-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm text-text">{email ?? "Signed in"}</p>
            <p className="mt-0.5 text-xs text-text-muted">
              Your data syncs to every device you sign in on.
            </p>
          </div>
          <Badge tone="success">Synced</Badge>
        </div>

        {/* A form POST rather than a link: signing out changes state, and a
            prefetching browser must never be able to do it by accident. */}
        <form action="/auth/sign-out" method="post">
          <Button type="submit" variant="secondary">
            <LogOut className="size-4" aria-hidden="true" />
            Sign out
          </Button>
        </form>
      </div>
    </Card>
  );
}
