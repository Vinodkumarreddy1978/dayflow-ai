/**
 * Database types.
 *
 * Normally generated with `npm run db:types`, which requires the Supabase CLI
 * linked to a project. This hand-written version mirrors the migrations in
 * supabase/migrations exactly so the project type-checks before the CLI has ever
 * been run. Regenerate it after any schema change rather than editing it -
 * a hand-maintained copy drifts from the schema by the second migration, and the
 * drift is silent. DF-ENG-003.
 *
 * Two details here are easy to get wrong and produce the same baffling symptom -
 * every table resolving to `never`, and every query reporting "not assignable to
 * parameter of type 'never'":
 *
 *  1. Every shape is a `type` alias, never an `interface`. `supabase-js` requires
 *     rows to satisfy `Record<string, unknown>`, and TypeScript only gives
 *     implicit index signatures to type aliases. An interface silently fails the
 *     constraint.
 *
 *  2. `Views` and `CompositeTypes` use `{ [_ in never]: never }` rather than
 *     `Record<string, never>`. The library intersects `Tables & Views` when
 *     resolving a relation, and an index signature returning `never` collapses
 *     every table to `never` through that intersection.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type MomentStatus = "pending" | "completed" | "auto_closed";
export type MomentSource = "manual" | "quick_add" | "auto_close" | "import";
export type GoalPeriod = "daily" | "weekly" | "monthly";
export type GoalDirection = "at_least" | "at_most";
export type GoalTargetType = "category" | "parent_category";
export type ReportPeriod = "daily" | "weekly" | "monthly";

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

export type ProfileRow = {
  id: string;
  display_name: string | null;
  subscription_tier: string;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SettingsRow = {
  user_id: string;
  queue_limit: number;
  reminders_enabled: boolean;
  reminder_interval_minutes: number;
  long_activity_warning_minutes: number;
  auto_close_enabled: boolean;
  auto_close_minutes: number;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  overlap_limit: number;
  overlap_warn_enabled: boolean;
  gap_warn_hours: number;
  timezone: string;
  week_starts_on: number;
  time_format: string;
  date_format: string;
  waking_start: string;
  waking_end: string;
  default_range: string;
  default_grouping: string;
  show_distraction_default: boolean;
  include_estimated_default: boolean;
  chart_style: string;
  productivity_enabled: boolean;
  productivity_weights: Record<string, number>;
  push_enabled: boolean;
  notify_queue_reminders: boolean;
  notify_long_activity: boolean;
  notify_auto_close: boolean;
  notify_goal_reminders: boolean;
  goal_reminder_time: string;
  notify_daily_review: boolean;
  daily_review_time: string;
  notify_weekly_review: boolean;
  notify_achievements: boolean;
  ai_consent: boolean;
  ai_daily_reports: boolean;
  ai_weekly_reports: boolean;
  ai_monthly_reports: boolean;
  ai_recommendations: boolean;
  theme: string;
  accent_color: string;
  compact_mode: boolean;
  dashboard_order: string[];
  created_at: string;
  updated_at: string;
};

export type ParentCategoryRow = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  icon: string | null;
  is_system: boolean;
  is_distraction: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CategoryRow = {
  id: string;
  user_id: string;
  parent_category_id: string;
  name: string;
  color: string | null;
  icon: string | null;
  is_archived: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type MomentRow = {
  id: string;
  user_id: string;
  category_id: string;
  start_at: string;
  end_at: string | null;
  duration_minutes: number | null;
  status: MomentStatus;
  source: MomentSource;
  note: string | null;
  last_reminder_at: string | null;
  warned_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GoalRow = {
  id: string;
  user_id: string;
  target_type: GoalTargetType;
  target_id: string;
  period: GoalPeriod;
  direction: GoalDirection;
  target_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AiReportRow = {
  id: string;
  user_id: string;
  period_type: ReportPeriod;
  period_start: string;
  period_end: string;
  facts: Json;
  content: Json;
  model: string | null;
  generated_by: "ai" | "deterministic";
  created_at: string;
};

export type AiUsageRow = {
  id: string;
  user_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
  succeeded: boolean;
  created_at: string;
};

export type PushSubscriptionRowShape = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  last_used_at: string | null;
  created_at: string;
};

export type FeatureFlagRow = {
  id: string;
  user_id: string | null;
  flag: string;
  enabled: boolean;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Pick<ProfileRow, "id"> &
          Partial<
            Pick<ProfileRow, "display_name" | "subscription_tier" | "onboarded_at">
          >;
        Update: Partial<
          Pick<ProfileRow, "display_name" | "subscription_tier" | "onboarded_at">
        >;
        Relationships: [];
      };
      settings: {
        Row: SettingsRow;
        Insert: Pick<SettingsRow, "user_id"> &
          Partial<Omit<SettingsRow, "user_id" | "created_at" | "updated_at">>;
        Update: Partial<Omit<SettingsRow, "user_id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      parent_categories: {
        Row: ParentCategoryRow;
        Insert: Pick<ParentCategoryRow, "user_id" | "name" | "color"> &
          Partial<
            Pick<ParentCategoryRow, "id" | "icon" | "is_distraction" | "sort_order">
          >;
        Update: Partial<
          Pick<
            ParentCategoryRow,
            "name" | "color" | "icon" | "is_distraction" | "sort_order"
          >
        >;
        Relationships: [];
      };
      categories: {
        Row: CategoryRow;
        Insert: Pick<CategoryRow, "user_id" | "parent_category_id" | "name"> &
          Partial<
            Pick<CategoryRow, "id" | "color" | "icon" | "is_archived" | "sort_order">
          >;
        Update: Partial<
          Pick<
            CategoryRow,
            | "parent_category_id"
            | "name"
            | "color"
            | "icon"
            | "is_archived"
            | "sort_order"
          >
        >;
        Relationships: [];
      };
      moments: {
        Row: MomentRow;
        Insert: Pick<MomentRow, "user_id" | "category_id" | "start_at"> &
          Partial<Pick<MomentRow, "id" | "end_at" | "source" | "note">>;
        Update: Partial<
          Pick<
            MomentRow,
            | "category_id"
            | "start_at"
            | "end_at"
            | "source"
            | "note"
            | "last_reminder_at"
            | "warned_at"
          >
        >;
        Relationships: [];
      };
      goals: {
        Row: GoalRow;
        Insert: Pick<
          GoalRow,
          "user_id" | "target_type" | "target_id" | "period" | "target_minutes"
        > &
          Partial<Pick<GoalRow, "id" | "direction" | "is_active">>;
        Update: Partial<
          Pick<
            GoalRow,
            | "target_type"
            | "target_id"
            | "period"
            | "direction"
            | "target_minutes"
            | "is_active"
          >
        >;
        Relationships: [];
      };
      ai_reports: {
        Row: AiReportRow;
        Insert: Pick<
          AiReportRow,
          "user_id" | "period_type" | "period_start" | "period_end" | "facts" | "content"
        > &
          Partial<Pick<AiReportRow, "id" | "model" | "generated_by">>;
        Update: Partial<Pick<AiReportRow, "facts" | "content" | "model">>;
        Relationships: [];
      };
      ai_usage: {
        Row: AiUsageRow;
        Insert: Pick<AiUsageRow, "user_id" | "model"> &
          Partial<
            Pick<
              AiUsageRow,
              "input_tokens" | "output_tokens" | "estimated_cost" | "succeeded"
            >
          >;
        // Append-only ledger: rows are written once and never revised, because a
        // mutable cost record is not a cost record.
        Update: Record<string, never>;
        Relationships: [];
      };
      push_subscriptions: {
        Row: PushSubscriptionRowShape;
        Insert: Pick<
          PushSubscriptionRowShape,
          "user_id" | "endpoint" | "p256dh" | "auth"
        > &
          Partial<Pick<PushSubscriptionRowShape, "id" | "user_agent" | "last_used_at">>;
        Update: Partial<Pick<PushSubscriptionRowShape, "last_used_at">>;
        Relationships: [];
      };
      feature_flags: {
        Row: FeatureFlagRow;
        Insert: Pick<FeatureFlagRow, "flag"> &
          Partial<Pick<FeatureFlagRow, "id" | "user_id" | "enabled">>;
        Update: Partial<Pick<FeatureFlagRow, "enabled">>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_time_by_category: {
        Args: {
          p_start: string;
          p_end: string;
          p_grouping?: string;
          p_include_estimated?: boolean;
          p_include_distraction?: boolean;
        };
        Returns: {
          group_id: string;
          group_name: string;
          group_color: string;
          parent_name: string;
          is_distraction: boolean;
          minutes: number;
          moment_count: number;
        }[];
      };
      get_daily_totals: {
        Args: { p_start: string; p_end: string; p_include_estimated?: boolean };
        Returns: {
          day: string;
          minutes: number;
          distracted_minutes: number;
          moment_count: number;
        }[];
      };
      get_day_breakdown: {
        Args: { p_date: string };
        Returns: {
          moment_id: string;
          category_id: string;
          category_name: string;
          parent_id: string;
          parent_name: string;
          color: string;
          is_distraction: boolean;
          start_at: string;
          end_at: string | null;
          status: MomentStatus;
          minutes_in_day: number;
          note: string | null;
        }[];
      };
      get_goal_achieved: {
        Args: { p_goal_id: string; p_start: string; p_end: string };
        Returns: number;
      };
      get_streak: {
        Args: { p_goal_id: string };
        Returns: { current_streak: number; longest_streak: number }[];
      };
      get_productivity_score: {
        Args: { p_date: string };
        Returns: number;
      };
      get_period_facts: {
        Args: { p_start: string; p_end: string };
        Returns: Json;
      };
      /** Service role only. See migration 0014. */
      get_period_facts_for_user: {
        Args: { p_user_id: string; p_start: string; p_end: string };
        Returns: Json;
      };
      local_date_for_timezone: {
        Args: { p_timezone: string; p_offset_days?: number };
        Returns: string;
      };
      current_user_timezone: {
        Args: Record<string, never>;
        Returns: string;
      };
      /**
       * Irreversible, and takes no arguments deliberately: the account it destroys
       * is the caller's own, derived from `auth.uid()` inside the function, so no
       * caller can aim it elsewhere. ADR-014, migration 0015.
       */
      delete_account: {
        Args: Record<string, never>;
        Returns: undefined;
      };
    };
    Enums: {
      moment_status: MomentStatus;
      moment_source: MomentSource;
      goal_period: GoalPeriod;
      goal_direction: GoalDirection;
      goal_target_type: GoalTargetType;
      report_period: ReportPeriod;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type Profile = ProfileRow;
export type Settings = SettingsRow;
export type ParentCategory = ParentCategoryRow;
export type Category = CategoryRow;
export type Moment = MomentRow;
export type Goal = GoalRow;
export type AiReport = AiReportRow;
export type PushSubscriptionRow = PushSubscriptionRowShape;
