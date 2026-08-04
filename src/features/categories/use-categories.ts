"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import type { Category, ParentCategory } from "@/lib/supabase/database.types";

export interface CategoryWithParent extends Category {
  parent: ParentCategory;
  /** The category's own colour if set, otherwise its group's. */
  effectiveColor: string;
}

export interface CategoryTree {
  parents: ParentCategory[];
  categories: CategoryWithParent[];
  byParent: Map<string, CategoryWithParent[]>;
  byId: Map<string, CategoryWithParent>;
  distractionParent: ParentCategory | undefined;
}

/**
 * The whole taxonomy in one query.
 *
 * A user has tens of categories, not thousands, so fetching all of them once and
 * indexing on the client is cheaper than filtering server-side on every screen
 * that needs a name or a colour - which is nearly all of them.
 */
export function useCategories() {
  const query = useQuery({
    queryKey: queryKeys.categories.tree(),
    queryFn: async () => {
      const supabase = createClient();

      const [parentsResult, categoriesResult] = await Promise.all([
        supabase.from("parent_categories").select("*").order("sort_order"),
        supabase.from("categories").select("*").order("sort_order"),
      ]);

      if (parentsResult.error) throw parentsResult.error;
      if (categoriesResult.error) throw categoriesResult.error;

      return {
        parents: (parentsResult.data ?? []) as ParentCategory[],
        categories: (categoriesResult.data ?? []) as Category[],
      };
    },
    staleTime: 5 * 60_000,
  });

  const tree = useMemo<CategoryTree>(() => {
    const parents = query.data?.parents ?? [];
    const rawCategories = query.data?.categories ?? [];
    const parentById = new Map(parents.map((parent) => [parent.id, parent]));

    const categories: CategoryWithParent[] = rawCategories.flatMap((category) => {
      const parent = parentById.get(category.parent_category_id);
      // A category whose group is missing cannot be rendered meaningfully. The
      // foreign key makes this impossible in practice; skipping is still safer
      // than a non-null assertion that would crash the whole screen.
      if (!parent) return [];

      return [
        {
          ...category,
          parent,
          effectiveColor: category.color ?? parent.color,
        },
      ];
    });

    const byParent = new Map<string, CategoryWithParent[]>();
    for (const category of categories) {
      const existing = byParent.get(category.parent_category_id);
      if (existing) {
        existing.push(category);
      } else {
        byParent.set(category.parent_category_id, [category]);
      }
    }

    return {
      parents,
      categories,
      byParent,
      byId: new Map(categories.map((category) => [category.id, category])),
      distractionParent: parents.find((parent) => parent.is_system),
    };
  }, [query.data]);

  return { ...query, tree };
}

/** Active categories grouped for a `<select>`, archived ones excluded. */
export function useCategoryOptions() {
  const { tree, isLoading } = useCategories();

  const groups = useMemo(
    () =>
      tree.parents
        .map((parent) => ({
          parent,
          options: (tree.byParent.get(parent.id) ?? []).filter(
            (category) => !category.is_archived,
          ),
        }))
        .filter((group) => group.options.length > 0),
    [tree],
  );

  return { groups, isLoading };
}
