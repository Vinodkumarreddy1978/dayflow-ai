"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import { useSession } from "@/lib/session-context";
import { useToast } from "@/components/ui/toast";
import { describeDatabaseError } from "@/features/moments/use-moments";
import { resolveRange } from "@/features/analytics/use-analytics";
import { goalProgress, type GoalProgress } from "@/lib/domain/goal-rules";
import { todayInTimeZone } from "@/lib/domain/timezone";
import type { Goal } from "@/lib/supabase/database.types";

export interface GoalWithProgress {
  goal: Goal;
  progress: GoalProgress;
  currentStreak: number;
  longestStreak: number;
  periodLabel: string;
}

/**
 * Goals with their progress and streaks.
 *
 * Progress and streaks are computed by SQL rather than the client, because both
 * need the midnight-split attribution that lives in the aggregation functions.
 * Recomputing them here would be a second implementation of the same rule, and
 * the two would disagree the first time either changed.
 */
export function useGoals(timeZone: string, weekStartsOn = 1) {
  const today = todayInTimeZone(timeZone);

  return useQuery({
    queryKey: queryKeys.goals.progress(today),
    queryFn: async (): Promise<GoalWithProgress[]> => {
      const supabase = createClient();

      const { data: goals, error } = await supabase
        .from("goals")
        .select("*")
        .eq("is_active", true)
        .order("created_at");

      if (error) throw error;
      if (!goals || goals.length === 0) return [];

      return Promise.all(
        (goals as Goal[]).map(async (goal) => {
          const range = resolveRange(goal.period, timeZone, weekStartsOn, today);

          // Streaks are only meaningful for daily goals: a "3 week streak" of a
          // weekly goal needs a different definition, and inventing one silently
          // would be worse than not showing it.
          const [achievedResult, streakResult] = await Promise.all([
            supabase.rpc("get_goal_achieved", {
              p_goal_id: goal.id,
              p_start: range.start,
              p_end: range.end,
            }),
            goal.period === "daily"
              ? supabase.rpc("get_streak", { p_goal_id: goal.id })
              : Promise.resolve({ data: null, error: null }),
          ]);

          const achieved = Number(achievedResult.data ?? 0);
          const streak = Array.isArray(streakResult.data) ? streakResult.data[0] : null;

          return {
            goal,
            progress: goalProgress(achieved, goal.target_minutes, goal.direction),
            currentStreak: Number(streak?.current_streak ?? 0),
            longestStreak: Number(streak?.longest_streak ?? 0),
            periodLabel: range.label,
          };
        }),
      );
    },
    staleTime: 30_000,
  });
}

export function useProductivityScore(date: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.analytics.score(date),
    enabled,
    queryFn: async (): Promise<number | null> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_productivity_score", {
        p_date: date,
      });

      if (error) throw error;
      // Null is meaningful, not missing: a day with no records has no score, and
      // showing zero would read as a verdict on a day that was never measured.
      return data === null ? null : Number(data);
    },
  });
}

export interface GoalInput {
  targetType: "category" | "parent_category";
  targetId: string;
  period: "daily" | "weekly" | "monthly";
  direction: "at_least" | "at_most";
  targetMinutes: number;
}

function useInvalidateGoals() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.goals.all });
  };
}

export function useCreateGoal() {
  const { userId } = useSession();
  const invalidate = useInvalidateGoals();
  const toast = useToast();

  return useMutation({
    mutationFn: async (input: GoalInput) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("goals")
        .insert({
          user_id: userId,
          target_type: input.targetType,
          target_id: input.targetId,
          period: input.period,
          direction: input.direction,
          target_minutes: input.targetMinutes,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Goal added.");
    },
    onError: (error) => {
      if ((error as { code?: string }).code === "23505") {
        toast.error("You already have that goal.");
        return;
      }
      toast.error(describeDatabaseError(error));
    },
  });
}

export function useUpdateGoal() {
  const invalidate = useInvalidateGoals();
  const toast = useToast();

  return useMutation({
    mutationFn: async ({ id, ...input }: GoalInput & { id: string }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("goals")
        .update({
          target_type: input.targetType,
          target_id: input.targetId,
          period: input.period,
          direction: input.direction,
          target_minutes: input.targetMinutes,
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Goal updated.");
    },
    onError: (error) => toast.error(describeDatabaseError(error)),
  });
}

export function useDeleteGoal() {
  const invalidate = useInvalidateGoals();
  const toast = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("goals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      // Deleting a goal must not read as losing the history behind it, so the
      // wording is explicit that only the target is gone.
      toast.success("Goal removed. Your recorded time is untouched.");
    },
    onError: (error) => toast.error(describeDatabaseError(error)),
  });
}
