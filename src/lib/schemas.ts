import { z } from "zod";
import { MAX_QUEUE_LIMIT, MIN_QUEUE_LIMIT } from "@/lib/domain/queue-rules";
import { MIN_REMINDER_INTERVAL_MINUTES } from "@/lib/domain/reminder-rules";

/**
 * Shared validation schemas.
 *
 * Defined once and used by both the form and the server action, so a rule can
 * never be enforced on one side and forgotten on the other. DF-ENG-042.
 * The database constraints in supabase/migrations are the third and final line;
 * these exist for the error message, not for the guarantee.
 */

const uuid = z.string().uuid();
const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex colour such as #4f46e5");
const clockTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use a 24-hour time such as 22:00");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD");

// ---------------------------------------------------------------------------
// Moments
// ---------------------------------------------------------------------------

export const momentFormSchema = z
  .object({
    categoryId: uuid,
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }).nullable().optional(),
    note: z
      .string()
      .trim()
      .max(500, "Notes are limited to 500 characters")
      .optional()
      .transform((value) => (value ? value : null)),
  })
  .refine((data) => !data.endAt || new Date(data.endAt) > new Date(data.startAt), {
    message: "End time must be after the start time.",
    path: ["endAt"],
  });

export type MomentFormInput = z.infer<typeof momentFormSchema>;

export const closeMomentSchema = z.object({
  id: uuid,
  endAt: z.string().datetime({ offset: true }),
});

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const categorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the category a name")
    .max(50, "Names are limited to 50 characters"),
  parentCategoryId: uuid,
  color: hexColor.nullable().optional(),
  icon: z.string().max(40).nullable().optional(),
});

export const parentCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the group a name")
    .max(50, "Names are limited to 50 characters"),
  color: hexColor,
  icon: z.string().max(40).nullable().optional(),
  isDistraction: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export const goalSchema = z.object({
  targetType: z.enum(["category", "parent_category"]),
  targetId: uuid,
  period: z.enum(["daily", "weekly", "monthly"]),
  direction: z.enum(["at_least", "at_most"]),
  targetMinutes: z
    .number()
    .int()
    .min(1, "Set a target of at least one minute")
    .max(1440, "A daily target cannot exceed 24 hours"),
});

// ---------------------------------------------------------------------------
// Settings
//
// Every field optional, because the settings screen saves individual controls
// rather than the whole form. DF-SET-002.
// ---------------------------------------------------------------------------

export const settingsSchema = z
  .object({
    queue_limit: z.number().int().min(MIN_QUEUE_LIMIT).max(MAX_QUEUE_LIMIT),
    reminders_enabled: z.boolean(),
    reminder_interval_minutes: z
      .number()
      .int()
      .min(
        MIN_REMINDER_INTERVAL_MINUTES,
        `Reminders cannot be more frequent than every ${MIN_REMINDER_INTERVAL_MINUTES} minutes`,
      )
      .max(480),
    // Bounds mirror the check constraints in migration 0002 exactly. A value this
    // layer accepts and the database then rejects produces a failed save with a
    // Postgres error string, which is the worst of both validations.
    long_activity_warning_minutes: z.number().int().min(60).max(720),
    auto_close_enabled: z.boolean(),
    auto_close_minutes: z.number().int().min(120).max(1440),
    quiet_hours_enabled: z.boolean(),
    quiet_hours_start: clockTime,
    quiet_hours_end: clockTime,
    overlap_limit: z.number().int().min(1).max(10),
    overlap_warn_enabled: z.boolean(),
    gap_warn_hours: z.number().int().min(1).max(12),
    timezone: z.string().min(1),
    week_starts_on: z.number().int().min(0).max(6),
    time_format: z.enum(["12h", "24h"]),
    date_format: z.enum(["iso", "dmy", "mdy"]),
    waking_start: clockTime,
    waking_end: clockTime,
    default_range: z.enum(["daily", "weekly", "monthly", "yearly", "lifetime"]),
    default_grouping: z.enum(["category", "parent_category"]),
    show_distraction_default: z.boolean(),
    include_estimated_default: z.boolean(),
    // Bars are offered in the analytics screen but not stored, because the saved
    // preference is also used by the narrow dashboard card where a horizontal bar
    // chart does not fit. Keeping the stored set to what every surface can render
    // avoids a setting that silently does nothing in half the app.
    chart_style: z.enum(["donut", "pie"]),
    productivity_enabled: z.boolean(),
    productivity_weights: z.record(z.string(), z.number().min(-1).max(1)),
    push_enabled: z.boolean(),
    notify_queue_reminders: z.boolean(),
    notify_long_activity: z.boolean(),
    notify_auto_close: z.boolean(),
    notify_goal_reminders: z.boolean(),
    goal_reminder_time: clockTime,
    notify_daily_review: z.boolean(),
    daily_review_time: clockTime,
    notify_weekly_review: z.boolean(),
    notify_achievements: z.boolean(),
    ai_consent: z.boolean(),
    ai_daily_reports: z.boolean(),
    ai_weekly_reports: z.boolean(),
    ai_monthly_reports: z.boolean(),
    ai_recommendations: z.boolean(),
    theme: z.enum(["light", "dark", "system"]),
    accent_color: hexColor,
    compact_mode: z.boolean(),
    dashboard_order: z.array(z.string()),
  })
  .partial()
  .refine(
    (data) =>
      data.auto_close_minutes === undefined ||
      data.long_activity_warning_minutes === undefined ||
      data.auto_close_minutes > data.long_activity_warning_minutes,
    {
      message: "Auto-close must come after the long activity warning.",
      path: ["auto_close_minutes"],
    },
  );

export type SettingsInput = z.infer<typeof settingsSchema>;

// ---------------------------------------------------------------------------
// Analytics and API
// ---------------------------------------------------------------------------

export const analyticsRangeSchema = z.object({
  start: isoDate,
  end: isoDate,
  grouping: z.enum(["category", "parent_category"]).default("parent_category"),
  includeEstimated: z.boolean().default(true),
  includeDistraction: z.boolean().default(true),
});

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().min(1),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const generateReportSchema = z.object({
  periodType: z.enum(["daily", "weekly", "monthly"]),
  periodStart: isoDate,
});
