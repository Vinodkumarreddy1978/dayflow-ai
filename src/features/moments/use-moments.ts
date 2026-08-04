"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import { useSession } from "@/lib/session-context";
import { useToast } from "@/components/ui/toast";
import { endOfLocalDay, startOfLocalDay } from "@/lib/domain/timezone";
import type { Database, Moment } from "@/lib/supabase/database.types";

type MomentUpdate = Database["public"]["Tables"]["moments"]["Update"];

/**
 * Database error codes raised by supabase/migrations/0008_triggers.sql.
 *
 * Translated into sentences a person can act on. A raw PostgreSQL exception
 * shown to a user is an admission that nobody thought about the failure case.
 */
const DB_ERROR_MESSAGES: Record<string, string> = {
  DF001: "Start time cannot be in the future.",
  DF002: "End time cannot be in the future.",
  DF003: "That start time looks wrong - check the year.",
  DF010: "You have too many activities open. Close one before starting another.",
  DF020: "That group is built in and cannot be deleted.",
  DF021: "That group is built in and cannot be renamed.",
  DF030: "That category no longer exists.",
};

export function describeDatabaseError(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code && DB_ERROR_MESSAGES[code]) return DB_ERROR_MESSAGES[code]!;

  // 23505 is a unique violation, which here can only be the duplicate guard.
  if (code === "23505") return "You have already recorded that activity at that time.";

  const message = (error as { message?: string })?.message;
  return message ?? "Something went wrong. Please try again.";
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function usePendingMoments() {
  return useQuery({
    queryKey: queryKeys.moments.pending(),
    queryFn: async (): Promise<Moment[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("moments")
        .select("*")
        .eq("status", "pending")
        // Oldest first: the memory most at risk gets addressed first. DF-QUE-023.
        .order("start_at", { ascending: true });

      if (error) throw error;
      return (data ?? []) as Moment[];
    },
    // Pending Moments carry a live elapsed time, so a shorter window than the
    // default keeps the queue honest even if a realtime event is missed.
    staleTime: 15_000,
  });
}

/**
 * Every Moment overlapping a Local Day.
 *
 * Queried by overlap rather than by start date so that an activity beginning at
 * 23:00 yesterday still appears on today's timeline for the portion that falls
 * within today (ADR-010).
 */
export function useDayMoments(date: string, timeZone: string) {
  return useQuery({
    queryKey: queryKeys.moments.day(date),
    queryFn: async (): Promise<Moment[]> => {
      const supabase = createClient();
      const dayStart = startOfLocalDay(date, timeZone).toISOString();
      const dayEnd = endOfLocalDay(date, timeZone).toISOString();

      const { data, error } = await supabase
        .from("moments")
        .select("*")
        .lt("start_at", dayEnd)
        .or(`end_at.is.null,end_at.gt.${dayStart}`)
        .order("start_at", { ascending: true });

      if (error) throw error;
      return (data ?? []) as Moment[];
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

function invalidateMomentData(queryClient: ReturnType<typeof useQueryClient>) {
  // Broad on purpose: a changed duration moves every chart, score and goal that
  // touches the affected day. DF-SYN-012.
  void queryClient.invalidateQueries({ queryKey: queryKeys.moments.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.goals.all });
}

export interface CreateMomentInput {
  categoryId: string;
  startAt: string;
  endAt: string | null;
  note: string | null;
}

export function useCreateMoment() {
  const queryClient = useQueryClient();
  const { userId } = useSession();
  const toast = useToast();

  return useMutation({
    mutationFn: async (input: CreateMomentInput): Promise<Moment> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("moments")
        .insert({
          user_id: userId,
          category_id: input.categoryId,
          start_at: input.startAt,
          end_at: input.endAt,
          note: input.note,
          source: "manual",
        })
        .select()
        .single();

      if (error) throw error;
      return data as Moment;
    },

    onSuccess: (moment) => {
      invalidateMomentData(queryClient);
      toast.success(
        moment.status === "pending"
          ? "Activity started. It will wait in your queue."
          : "Activity saved.",
      );
    },

    onError: (error) => toast.error(describeDatabaseError(error)),
  });
}

export function useCloseMoment() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async ({ id, endAt }: { id: string; endAt: string }) => {
      const supabase = createClient();
      // status is derived by a trigger, so only end_at is sent. Setting both
      // here would be a second place for the two to disagree.
      const { data, error } = await supabase
        .from("moments")
        .update({ end_at: endAt })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Moment;
    },

    // Optimistic: closing an activity is the single most frequent action in the
    // product, and it must feel instant. DF-SYN-014.
    onMutate: async ({ id, endAt }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.moments.pending() });
      const previous = queryClient.getQueryData<Moment[]>(queryKeys.moments.pending());

      queryClient.setQueryData<Moment[]>(queryKeys.moments.pending(), (current) =>
        (current ?? []).filter((moment) => moment.id !== id),
      );

      return { previous, endAt };
    },

    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.moments.pending(), context.previous);
      }
      toast.error(describeDatabaseError(error));
    },

    onSuccess: () => toast.success("Activity closed."),
    onSettled: () => invalidateMomentData(queryClient),
  });
}

export interface UpdateMomentInput {
  id: string;
  categoryId?: string;
  startAt?: string;
  endAt?: string | null;
  note?: string | null;
}

export function useUpdateMoment() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (input: UpdateMomentInput) => {
      const supabase = createClient();

      // Built field by field so that an omitted property means "leave alone",
      // while an explicit null means "clear it" - the distinction that lets a
      // completed Moment be reopened by sending end_at: null.
      const patch: MomentUpdate = {};
      if (input.categoryId !== undefined) patch.category_id = input.categoryId;
      if (input.startAt !== undefined) patch.start_at = input.startAt;
      if (input.endAt !== undefined) patch.end_at = input.endAt;
      if (input.note !== undefined) patch.note = input.note;

      const { data, error } = await supabase
        .from("moments")
        .update(patch)
        .eq("id", input.id)
        .select()
        .single();

      if (error) throw error;
      return data as Moment;
    },

    onSuccess: () => {
      invalidateMomentData(queryClient);
      toast.success("Activity updated.");
    },

    onError: (error) => toast.error(describeDatabaseError(error)),
  });
}

export function useDeleteMoment() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("moments").delete().eq("id", id);
      if (error) throw error;
      return id;
    },

    onSuccess: () => {
      invalidateMomentData(queryClient);
      // DF-MOM-032: deletion is permanent, so the confirmation says so plainly
      // rather than implying an undo that does not exist.
      toast.success("Activity deleted.");
    },

    onError: (error) => toast.error(describeDatabaseError(error)),
  });
}
