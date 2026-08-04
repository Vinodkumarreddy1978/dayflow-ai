"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, Skeleton } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select, Switch } from "@/components/ui/field";
import { useCategories, type CategoryWithParent } from "./use-categories";
import {
  useArchiveCategory,
  useCreateCategory,
  useCreateParentCategory,
  useDeleteCategory,
  useDeleteParentCategory,
  useUpdateCategory,
  useUpdateParentCategory,
} from "./use-category-mutations";
import type { ParentCategory } from "@/lib/supabase/database.types";

/** Suggested colours. Users can still type any hex value. */
const PALETTE = [
  "#2563eb",
  "#4f46e5",
  "#7c3aed",
  "#9333ea",
  "#c026d3",
  "#e11d48",
  "#dc2626",
  "#ea580c",
  "#d97706",
  "#ca8a04",
  "#16a34a",
  "#059669",
  "#0891b2",
  "#0284c7",
  "#64748b",
];

type Dialog =
  | { kind: "category"; category?: CategoryWithParent; parentId?: string }
  | { kind: "group"; group?: ParentCategory }
  | null;

export function CategoriesView() {
  const { tree, isLoading } = useCategories();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [showArchived, setShowArchived] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Categories</h1>
          <p className="mt-1 text-sm text-text-muted">
            Two levels: groups, and the categories inside them. Rename or delete whatever
            does not fit how you actually spend your time.
          </p>
        </div>

        <Button onClick={() => setDialog({ kind: "group" })} variant="secondary">
          <Plus className="size-4" aria-hidden="true" />
          New group
        </Button>
      </header>

      <label className="flex items-center gap-2 text-sm text-text-muted">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(event) => setShowArchived(event.target.checked)}
          className="size-4 rounded border-border-strong"
        />
        Show archived categories
      </label>

      <div className="space-y-4">
        {tree.parents.map((parent) => (
          <GroupCard
            key={parent.id}
            group={parent}
            categories={(tree.byParent.get(parent.id) ?? []).filter(
              (category) => showArchived || !category.is_archived,
            )}
            onEditGroup={() => setDialog({ kind: "group", group: parent })}
            onAddCategory={() => setDialog({ kind: "category", parentId: parent.id })}
            onEditCategory={(category) => setDialog({ kind: "category", category })}
          />
        ))}
      </div>

      {dialog?.kind === "category" && (
        <CategoryDialog
          category={dialog.category}
          defaultParentId={dialog.parentId}
          parents={tree.parents}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.kind === "group" && (
        <GroupDialog group={dialog.group} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

function GroupCard({
  group,
  categories,
  onEditGroup,
  onAddCategory,
  onEditCategory,
}: {
  group: ParentCategory;
  categories: CategoryWithParent[];
  onEditGroup: () => void;
  onAddCategory: () => void;
  onEditCategory: (category: CategoryWithParent) => void;
}) {
  const deleteGroup = useDeleteParentCategory();
  const archiveCategory = useArchiveCategory();
  const deleteCategory = useDeleteCategory();

  return (
    <Card>
      <div className="flex items-center gap-3 border-b border-border p-4">
        <span
          aria-hidden="true"
          className="size-3 shrink-0 rounded-full"
          style={{ backgroundColor: group.color }}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-text">{group.name}</h2>

            {group.is_distraction && <Badge tone="distraction">Distraction</Badge>}

            {/*
              Distracted Time is seeded and protected by a database trigger. The
              lock is shown rather than the buttons simply being absent, so the
              constraint is legible instead of looking like a missing feature.
            */}
            {group.is_system && (
              <Badge tone="neutral">
                <Lock className="size-3" aria-hidden="true" />
                Built in
              </Badge>
            )}
          </div>

          <p className="mt-0.5 text-xs text-text-muted">
            {categories.length} {categories.length === 1 ? "category" : "categories"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onAddCategory}>
            <Plus className="size-4" aria-hidden="true" />
            Add
          </Button>

          {!group.is_system && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={onEditGroup}
                aria-label={`Edit ${group.name}`}
              >
                <Pencil className="size-4" aria-hidden="true" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                aria-label={`Delete ${group.name}`}
                onClick={() => deleteGroup.mutate(group.id)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </>
          )}
        </div>
      </div>

      {categories.length === 0 ? (
        <p className="px-4 py-5 text-sm text-text-muted">Nothing in this group yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {categories.map((category) => (
            <li key={category.id} className="flex items-center gap-3 px-4 py-2.5">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: category.effectiveColor }}
              />

              <span
                className={
                  category.is_archived
                    ? "min-w-0 flex-1 truncate text-sm text-text-subtle line-through"
                    : "min-w-0 flex-1 truncate text-sm text-text"
                }
              >
                {category.name}
              </span>

              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onEditCategory(category)}
                  aria-label={`Edit ${category.name}`}
                >
                  <Pencil className="size-4" aria-hidden="true" />
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={
                    category.is_archived
                      ? `Restore ${category.name}`
                      : `Archive ${category.name}`
                  }
                  onClick={() =>
                    archiveCategory.mutate({
                      id: category.id,
                      archived: !category.is_archived,
                    })
                  }
                >
                  {category.is_archived ? (
                    <ArchiveRestore className="size-4" aria-hidden="true" />
                  ) : (
                    <Archive className="size-4" aria-hidden="true" />
                  )}
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger"
                  aria-label={`Delete ${category.name}`}
                  onClick={() => deleteCategory.mutate(category.id)}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ColorPicker({
  value,
  onChange,
  allowInherit,
}: {
  value: string | null;
  onChange: (color: string | null) => void;
  allowInherit?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {allowInherit && (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Use the group's colour"
          aria-pressed={value === null}
          className={
            value === null
              ? "grid size-8 place-items-center rounded-md border-2 border-accent text-[10px] text-text"
              : "grid size-8 place-items-center rounded-md border border-border-strong text-[10px] text-text-muted"
          }
        >
          Auto
        </button>
      )}

      {PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          aria-label={`Use colour ${color}`}
          aria-pressed={value === color}
          style={{ backgroundColor: color }}
          className={
            value === color
              ? "size-8 rounded-md ring-2 ring-accent ring-offset-2 ring-offset-[var(--color-surface-raised)]"
              : "size-8 rounded-md"
          }
        />
      ))}
    </div>
  );
}

function CategoryDialog({
  category,
  defaultParentId,
  parents,
  onClose,
}: {
  category?: CategoryWithParent;
  defaultParentId?: string;
  parents: ParentCategory[];
  onClose: () => void;
}) {
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();

  const [name, setName] = useState(category?.name ?? "");
  const [parentId, setParentId] = useState(
    category?.parent_category_id ?? defaultParentId ?? parents[0]?.id ?? "",
  );
  const [color, setColor] = useState<string | null>(category?.color ?? null);

  const isSaving = createCategory.isPending || updateCategory.isPending;
  const canSave = name.trim().length > 0 && parentId.length > 0 && !isSaving;

  function handleSave() {
    if (!canSave) return;
    const payload = { name, parentCategoryId: parentId, color };

    if (category) {
      updateCategory.mutate({ id: category.id, ...payload }, { onSuccess: onClose });
    } else {
      createCategory.mutate(payload, { onSuccess: onClose });
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={category ? "Edit category" : "New category"}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave} isLoading={isSaving}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" required>
          {({ id }) => (
            <Input
              id={id}
              value={name}
              maxLength={50}
              autoFocus
              onChange={(event) => setName(event.target.value)}
              placeholder="Reading, Gym, Code review…"
            />
          )}
        </Field>

        <Field label="Group" required>
          {({ id }) => (
            <Select
              id={id}
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
            >
              {parents.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field
          label="Colour"
          hint="Auto uses the group's colour, which keeps charts readable by default."
        >
          {() => <ColorPicker value={color} onChange={setColor} allowInherit />}
        </Field>
      </div>
    </Modal>
  );
}

function GroupDialog({
  group,
  onClose,
}: {
  group?: ParentCategory;
  onClose: () => void;
}) {
  const createGroup = useCreateParentCategory();
  const updateGroup = useUpdateParentCategory();

  const [name, setName] = useState(group?.name ?? "");
  const [color, setColor] = useState(group?.color ?? PALETTE[0]!);
  const [isDistraction, setIsDistraction] = useState(group?.is_distraction ?? false);

  const isSaving = createGroup.isPending || updateGroup.isPending;
  const canSave = name.trim().length > 0 && !isSaving;

  function handleSave() {
    if (!canSave) return;
    const payload = { name, color, isDistraction };

    if (group) {
      updateGroup.mutate({ id: group.id, ...payload }, { onSuccess: onClose });
    } else {
      createGroup.mutate(payload, { onSuccess: onClose });
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={group ? "Edit group" : "New group"}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave} isLoading={isSaving}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" required>
          {({ id }) => (
            <Input
              id={id}
              value={name}
              maxLength={50}
              autoFocus
              onChange={(event) => setName(event.target.value)}
              placeholder="Work, Learning, Health…"
            />
          )}
        </Field>

        <Field label="Colour" required>
          {() => (
            <ColorPicker value={color} onChange={(next) => setColor(next ?? color)} />
          )}
        </Field>

        <Switch
          checked={isDistraction}
          onChange={setIsDistraction}
          label="Count as distraction"
          description="Time in this group is totalled separately and can be hidden from any chart."
        />
      </div>
    </Modal>
  );
}
