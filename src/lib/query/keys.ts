/**
 * Query keys.
 *
 * Defined centrally and hierarchically so that invalidation can be broad
 * without being indiscriminate: closing a Moment invalidates `moments` and
 * `analytics` wholesale, because a new duration changes every chart, but leaves
 * categories and settings untouched. DF-SYN-012.
 */
export const queryKeys = {
  settings: ["settings"] as const,
  profile: ["profile"] as const,

  categories: {
    all: ["categories"] as const,
    tree: () => [...queryKeys.categories.all, "tree"] as const,
  },

  moments: {
    all: ["moments"] as const,
    pending: () => [...queryKeys.moments.all, "pending"] as const,
    day: (date: string) => [...queryKeys.moments.all, "day", date] as const,
    range: (start: string, end: string) =>
      [...queryKeys.moments.all, "range", start, end] as const,
    search: (params: Record<string, unknown>) =>
      [...queryKeys.moments.all, "search", params] as const,
  },

  analytics: {
    all: ["analytics"] as const,
    byCategory: (params: Record<string, unknown>) =>
      [...queryKeys.analytics.all, "byCategory", params] as const,
    daily: (start: string, end: string) =>
      [...queryKeys.analytics.all, "daily", start, end] as const,
    score: (date: string) => [...queryKeys.analytics.all, "score", date] as const,
  },

  goals: {
    all: ["goals"] as const,
    progress: (date: string) => [...queryKeys.goals.all, "progress", date] as const,
    streak: (goalId: string) => [...queryKeys.goals.all, "streak", goalId] as const,
  },

  insights: {
    all: ["insights"] as const,
    report: (periodType: string, periodStart: string) =>
      [...queryKeys.insights.all, periodType, periodStart] as const,
  },

  reports: {
    all: ["reports"] as const,
    list: (periodType: string) => [...queryKeys.reports.all, "list", periodType] as const,
  },
} as const;
