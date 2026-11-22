-- Open-Prism Cloud Sync Schema (projects, project_files, user_preferences, project-assets storage)

create table if not exists public.projects (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  name text not null,
  created_at bigint not null,
  updated_at bigint not null,
  pinned boolean not null default false,
  compiler text not null default 'pdflatex' check (compiler in ('pdflatex', 'lualatex', 'xelatex')),
  main_file_id text not null,
  active_file_id text not null,
  primary key (user_id, id)
);

create table if not exists public.project_files (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  project_id text not null,
  name text not null,
  type text not null check (type in ('tex', 'text', 'bib', 'cls', 'sty', 'image', 'binary')),
  content text,
  storage_path text,
  updated_at bigint not null,
  primary key (user_id, id),
  foreign key (user_id, project_id) references public.projects(user_id, id) on delete cascade
);

create table if not exists public.user_preferences (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  active_project_id text,
  project_sort text not null default 'updatedAt' check (project_sort in ('updatedAt', 'name')),
  ai_model text not null default 'gemini-4-hydrogen',
  updated_at bigint not null
);

-- Indexes for fast RLS-scoped queries
create index if not exists idx_projects_user_updated
  on public.projects (user_id, updated_at desc);

create index if not exists idx_project_files_user_project
  on public.project_files (user_id, project_id);

-- Explicit Data API privileges (authenticated only)
revoke all on public.projects, public.project_files, public.user_preferences from anon, public;
grant select, insert, update, delete on public.projects, public.project_files, public.user_preferences to authenticated;

-- Enable Row Level Security
alter table public.projects enable row level security;
alter table public.project_files enable row level security;
alter table public.user_preferences enable row level security;

-- RLS Policies: public.projects
create policy "projects_select_own"
  on public.projects for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "projects_insert_own"
  on public.projects for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "projects_update_own"
  on public.projects for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "projects_delete_own"
  on public.projects for delete to authenticated
  using ((select auth.uid()) = user_id);

-- RLS Policies: public.project_files
create policy "project_files_select_own"
  on public.project_files for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "project_files_insert_own"
  on public.project_files for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "project_files_update_own"
  on public.project_files for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "project_files_delete_own"
  on public.project_files for delete to authenticated
  using ((select auth.uid()) = user_id);

-- RLS Policies: public.user_preferences
create policy "user_preferences_select_own"
  on public.user_preferences for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "user_preferences_insert_own"
  on public.user_preferences for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "user_preferences_update_own"
  on public.user_preferences for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "user_preferences_delete_own"
  on public.user_preferences for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Private Storage bucket for images and binary assets
insert into storage.buckets (id, name, public, file_size_limit)
values ('project-assets', 'project-assets', false, 26214400)
on conflict (id) do nothing;

-- Storage RLS Policies (path format: <user_id>/<project_id>/<file_id>/<filename>)
create policy "project_assets_select_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'project-assets'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "project_assets_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'project-assets'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "project_assets_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'project-assets'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'project-assets'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "project_assets_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'project-assets'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
