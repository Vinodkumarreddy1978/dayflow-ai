/**
 * The tables an export covers, and how to name them to a person.
 *
 * Split out from `account-export.ts` deliberately. That module carries the full
 * column manifest and the serialisers, none of which the browser needs, and the
 * settings route sits within a kilobyte of the 200 kB initial-JavaScript budget in
 * section 9 of docs/03-ux/22-accessibility-and-responsive-standards.md. The
 * controls need the names and the labels; nothing else.
 */

/**
 * Every table in the `public` schema that holds rows belonging to a user, which is
 * the same ten tables row level security is enabled on in
 * supabase/migrations/0007_rls_policies.sql. DF-PRV-020 is a completeness
 * requirement, so this list being short of the schema is the failure mode to guard
 * against - `account-export.ts` fails to compile if a column is missing from a
 * table, and `account-export.test.ts` fails if a table is missing from here.
 */
export const EXPORT_TABLE_NAMES = [
  "profiles",
  "settings",
  "parent_categories",
  "categories",
  "moments",
  "goals",
  "ai_reports",
  "ai_usage",
  "push_subscriptions",
  "feature_flags",
] as const;

export type ExportTableName = (typeof EXPORT_TABLE_NAMES)[number];

/** Interface wording rather than schema wording: the product says activity, not Moment. */
export const EXPORT_TABLE_LABELS: Record<ExportTableName, string> = {
  profiles: "Profile",
  settings: "Settings",
  parent_categories: "Category groups",
  categories: "Categories",
  moments: "Activities",
  goals: "Goals",
  ai_reports: "AI reports",
  ai_usage: "AI usage records",
  push_subscriptions: "Notification devices",
  feature_flags: "Feature flags",
};

export const EXPORT_FORMATS = ["json", "csv"] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export function isExportFormat(value: string): value is ExportFormat {
  return (EXPORT_FORMATS as readonly string[]).includes(value);
}

export function isExportTableName(value: string): value is ExportTableName {
  return (EXPORT_TABLE_NAMES as readonly string[]).includes(value);
}
