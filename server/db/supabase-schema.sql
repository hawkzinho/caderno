-- Caderno Digital -> Supabase schema
-- Compatibility note:
-- public.subjects = "cadernos" in the current frontend
-- public.notebooks = "materias" in the current frontend

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null unique,
  avatar_color text not null default '#6C5CE7',
  theme text not null default 'light' check (theme in ('light', 'dark')),
  preferences text not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  color text not null default '#6C5CE7',
  icon text not null default '📚',
  order_index integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table if not exists public.notebooks (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  color text not null default '#00B894',
  order_index integer not null default 0,
  is_archived boolean not null default false,
  page_theme text not null default 'blank',
  is_pinned boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references public.notebooks (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  order_index integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null default 'Sem titulo',
  content text not null default '{"type":"doc","content":[{"type":"paragraph"}]}',
  page_theme text not null default 'blank',
  page_settings text not null default '{}',
  is_favorite boolean not null default false,
  is_pinned boolean not null default false,
  is_archived boolean not null default false,
  is_deleted boolean not null default false,
  tags text not null default '[]',
  order_index integer not null default 0,
  word_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table if not exists public.page_history (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  title text,
  content text,
  word_count integer not null default 0,
  saved_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  filename text not null,
  original_name text not null,
  mime_type text not null,
  size bigint not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  page_id uuid references public.pages (id) on delete set null,
  started_at timestamptz not null default timezone('utc', now()),
  ended_at timestamptz,
  duration_seconds integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table if not exists public.daily_stats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  date date not null,
  pages_created integer not null default 0,
  pages_edited integer not null default 0,
  words_written integer not null default 0,
  study_seconds integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  constraint daily_stats_user_date_key unique (user_id, date)
);

create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = coalesce(nullif(excluded.name, ''), public.users.name),
    updated_at = timezone('utc', now());

  return new;
end;
$$;

create or replace function public.handle_auth_user_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
  set
    email = new.email,
    updated_at = timezone('utc', now())
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_auth_user_created();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
after update of email on auth.users
for each row execute procedure public.handle_auth_user_updated();

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at
before update on public.users
for each row execute procedure public.set_current_timestamp_updated_at();

drop trigger if exists set_subjects_updated_at on public.subjects;
create trigger set_subjects_updated_at
before update on public.subjects
for each row execute procedure public.set_current_timestamp_updated_at();

drop trigger if exists set_notebooks_updated_at on public.notebooks;
create trigger set_notebooks_updated_at
before update on public.notebooks
for each row execute procedure public.set_current_timestamp_updated_at();

drop trigger if exists set_sections_updated_at on public.sections;
create trigger set_sections_updated_at
before update on public.sections
for each row execute procedure public.set_current_timestamp_updated_at();

drop trigger if exists set_pages_updated_at on public.pages;
create trigger set_pages_updated_at
before update on public.pages
for each row execute procedure public.set_current_timestamp_updated_at();

drop trigger if exists set_page_history_updated_at on public.page_history;
create trigger set_page_history_updated_at
before update on public.page_history
for each row execute procedure public.set_current_timestamp_updated_at();

drop trigger if exists set_attachments_updated_at on public.attachments;
create trigger set_attachments_updated_at
before update on public.attachments
for each row execute procedure public.set_current_timestamp_updated_at();

drop trigger if exists set_study_sessions_updated_at on public.study_sessions;
create trigger set_study_sessions_updated_at
before update on public.study_sessions
for each row execute procedure public.set_current_timestamp_updated_at();

drop trigger if exists set_daily_stats_updated_at on public.daily_stats;
create trigger set_daily_stats_updated_at
before update on public.daily_stats
for each row execute procedure public.set_current_timestamp_updated_at();

create index if not exists idx_subjects_user_active
on public.subjects (user_id, order_index, created_at)
where deleted_at is null and is_archived = false;

create index if not exists idx_notebooks_user_active
on public.notebooks (user_id, order_index, created_at)
where deleted_at is null and is_archived = false;

create index if not exists idx_notebooks_subject_active
on public.notebooks (subject_id, order_index, created_at)
where deleted_at is null and is_archived = false;

create index if not exists idx_sections_user_active
on public.sections (user_id, order_index, created_at)
where deleted_at is null and is_archived = false;

create index if not exists idx_sections_notebook_active
on public.sections (notebook_id, order_index, created_at)
where deleted_at is null and is_archived = false;

create index if not exists idx_pages_user_active
on public.pages (user_id, updated_at desc)
where deleted_at is null and is_deleted = false and is_archived = false;

create index if not exists idx_pages_section_order
on public.pages (section_id, order_index, updated_at desc)
where deleted_at is null and is_deleted = false and is_archived = false;

create index if not exists idx_pages_user_favorite
on public.pages (user_id, updated_at desc)
where deleted_at is null and is_deleted = false and is_favorite = true;

create index if not exists idx_pages_user_deleted
on public.pages (user_id, deleted_at desc)
where is_deleted = true;

create index if not exists idx_pages_title_trgm
on public.pages using gin (title gin_trgm_ops);

create index if not exists idx_pages_content_trgm
on public.pages using gin (content gin_trgm_ops);

create index if not exists idx_page_history_page_saved_at
on public.page_history (page_id, saved_at desc)
where deleted_at is null;

create index if not exists idx_attachments_page_created_at
on public.attachments (page_id, created_at desc)
where deleted_at is null;

create index if not exists idx_study_sessions_user_started_at
on public.study_sessions (user_id, started_at desc)
where deleted_at is null;

create index if not exists idx_study_sessions_user_open
on public.study_sessions (user_id, started_at desc)
where ended_at is null and deleted_at is null;

create index if not exists idx_daily_stats_user_date
on public.daily_stats (user_id, date desc)
where deleted_at is null;

alter table public.users enable row level security;
alter table public.subjects enable row level security;
alter table public.notebooks enable row level security;
alter table public.sections enable row level security;
alter table public.pages enable row level security;
alter table public.page_history enable row level security;
alter table public.attachments enable row level security;
alter table public.study_sessions enable row level security;
alter table public.daily_stats enable row level security;

drop policy if exists "Users manage own profile" on public.users;
create policy "Users manage own profile"
on public.users
for all
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Subjects manage own rows" on public.subjects;
create policy "Subjects manage own rows"
on public.subjects
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Notebooks manage own rows" on public.notebooks;
create policy "Notebooks manage own rows"
on public.notebooks
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Sections manage own rows" on public.sections;
create policy "Sections manage own rows"
on public.sections
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Pages manage own rows" on public.pages;
create policy "Pages manage own rows"
on public.pages
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Page history manage own rows" on public.page_history;
create policy "Page history manage own rows"
on public.page_history
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Attachments manage own rows" on public.attachments;
create policy "Attachments manage own rows"
on public.attachments
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Study sessions manage own rows" on public.study_sessions;
create policy "Study sessions manage own rows"
on public.study_sessions
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Daily stats manage own rows" on public.daily_stats;
create policy "Daily stats manage own rows"
on public.daily_stats
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

drop policy if exists "Attachments bucket read own files" on storage.objects;
create policy "Attachments bucket read own files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Attachments bucket upload own files" on storage.objects;
create policy "Attachments bucket upload own files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Attachments bucket update own files" on storage.objects;
create policy "Attachments bucket update own files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Attachments bucket delete own files" on storage.objects;
create policy "Attachments bucket delete own files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);
