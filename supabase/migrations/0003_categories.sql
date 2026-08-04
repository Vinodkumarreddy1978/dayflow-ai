-- =============================================================================
-- 0003 - Parent categories and categories
-- Reference: docs/02-product/11-prd-core-moments-and-categories.md sections 3 and 4
-- =============================================================================

create table if not exists public.parent_categories (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  name            text not null check (char_length(trim(name)) between 1 and 50),
  color           text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon            text,
  -- Only Distracted Time. Protected from rename and deletion by trigger.
  is_system       boolean not null default false,
  -- Analytics keys off this flag, never off the name, so a user may mark any of
  -- their own parent categories as distraction-like. DF-CAT-025.
  is_distraction  boolean not null default false,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Redundant as a uniqueness statement, but required as the target of the
  -- composite foreign key from categories. That composite key is what makes it
  -- structurally impossible to attach one user's category to another's parent.
  constraint parent_categories_user_id_id_key unique (user_id, id)
);

create unique index if not exists parent_categories_user_name_key
  on public.parent_categories (user_id, lower(trim(name)));

create index if not exists parent_categories_user_sort_idx
  on public.parent_categories (user_id, sort_order);

create table if not exists public.categories (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  parent_category_id  uuid not null,
  name                text not null check (char_length(trim(name)) between 1 and 50),
  -- Null means inherit the parent's hue at reduced saturation. DF-UX-041.
  color               text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  icon                text,
  -- Archived categories disappear from the selector but remain in history,
  -- which is how a taxonomy evolves without destroying past analytics. DF-CAT-006.
  is_archived         boolean not null default false,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint categories_user_id_id_key unique (user_id, id),

  -- restrict, not cascade: deleting a parent must never silently destroy the
  -- categories beneath it and the months of Moments behind them. DF-CAT-022.
  constraint categories_parent_fkey
    foreign key (parent_category_id, user_id)
    references public.parent_categories (id, user_id)
    on delete restrict
);

create unique index if not exists categories_user_name_key
  on public.categories (user_id, lower(trim(name)));

create index if not exists categories_user_parent_idx
  on public.categories (user_id, parent_category_id);

create index if not exists categories_user_active_idx
  on public.categories (user_id) where is_archived = false;
