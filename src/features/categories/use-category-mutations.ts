"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import { useSession } from "@/lib/session-context";
import { useToast } from "@/components/ui/toast";
import { describeDatabaseError } from "@/features/moments/use-moments";

/**
 * Taxonomy mutations.
 *
 * Deletion is restricted at the database level rather than cascading: a category
 * with Moments cannot be removed, because deleting it would silently destroy
 * recorded history. Archiving exists for exactly that case. DF-CAT-045.
 */

function useInvalidateTaxonomy() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
  };
}

export interface CategoryInput {
  name: string;
  parentCategoryId: string;
  color: string | null;
  icon?: string | null;
}

export function useCreateCategory() {
  const { userId } = useSession();
  const invalidate = useInvalidateTaxonomy();
  const toast = useToast();

  return useMutation({
    mutationFn: async (input: CategoryInput) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("categories")
        .insert({
          user_id: userId,
          parent_category_id: input.parentCategoryId,
          name: input.name.trim(),
          color: input.color,
          icon: input.icon ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Category added.");
    },
    onError: (error) => toast.error(describeDatabaseError(error)),
  });
}

export function useUpdateCategory() {
  const invalidate = useInvalidateTaxonomy();
  const toast = useToast();

  return useMutation({
    mutationFn: async ({ id, ...input }: CategoryInput & { id: string }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("categories")
        .update({
          name: input.name.trim(),
          parent_category_id: input.parentCategoryId,
          color: input.color,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Category updated.");
    },
    onError: (error) => toast.error(describeDatabaseError(error)),
  });
}

export function useDeleteCategory() {
  const invalidate = useInvalidateTaxonomy();
  const toast = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Category deleted.");
    },
    onError: (error) => {
      // 23503 is a foreign key violation, which here means recorded Moments
      // still reference this category. Archiving is the honest alternative.
      if ((error as { code?: string }).code === "23503") {
        toast.error(
          "This category has recorded activities. Archive it instead - deleting it would erase that history.",
        );
        return;
      }
      toast.error(describeDatabaseError(error));
    },
  });
}

export function useArchiveCategory() {
  const invalidate = useInvalidateTaxonomy();
  const toast = useToast();

  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("categories")
        .update({ is_archived: archived })
        .eq("id", id);
      if (error) throw error;
      return archived;
    },
    onSuccess: (archived) => {
      invalidate();
      toast.success(
        archived
          ? "Archived. Past activities keep it; new ones will not offer it."
          : "Restored.",
      );
    },
    onError: (error) => toast.error(describeDatabaseError(error)),
  });
}

export interface ParentCategoryInput {
  name: string;
  color: string;
  isDistraction: boolean;
}

export function useCreateParentCategory() {
  const { userId } = useSession();
  const invalidate = useInvalidateTaxonomy();
  const toast = useToast();

  return useMutation({
    mutationFn: async (input: ParentCategoryInput) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("parent_categories")
        .insert({
          user_id: userId,
          name: input.name.trim(),
          color: input.color,
          is_distraction: input.isDistraction,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Group added.");
    },
    onError: (error) => toast.error(describeDatabaseError(error)),
  });
}

export function useUpdateParentCategory() {
  const invalidate = useInvalidateTaxonomy();
  const toast = useToast();

  return useMutation({
    mutationFn: async ({ id, ...input }: ParentCategoryInput & { id: string }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("parent_categories")
        .update({
          name: input.name.trim(),
          color: input.color,
          is_distraction: input.isDistraction,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Group updated.");
    },
    onError: (error) => toast.error(describeDatabaseError(error)),
  });
}

export function useDeleteParentCategory() {
  const invalidate = useInvalidateTaxonomy();
  const toast = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("parent_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Group deleted.");
    },
    onError: (error) => {
      if ((error as { code?: string }).code === "23503") {
        toast.error("Move or delete the categories in this group first.");
        return;
      }
      toast.error(describeDatabaseError(error));
    },
  });
}
