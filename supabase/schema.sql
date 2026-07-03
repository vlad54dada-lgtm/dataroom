-- DataRoom — full database setup.
--
-- This replays the project's applied migrations in order. Run it once in the
-- Supabase SQL editor of a fresh project (Dashboard → SQL Editor → paste →
-- Run), then put the project URL + anon key into .env.local. It creates:
--   * public.nodes            — the whole dataroom/folder/file tree
--   * public.file_texts       — extracted PDF text for content search
--   * public.profiles         — one row per auth user
--   * storage bucket "pdfs"   — private, per-user folders
--   * RLS policies everywhere — users only ever see their own rows/objects
--   * SQL functions           — subtree stats/paths, search, trash listing
--   * auth trigger            — auto-confirms new users (password-only signup)

-- ---------------------------------------------------------------------------
-- 1) create_nodes_schema
-- ---------------------------------------------------------------------------

-- Single-tree node model mirroring the client's Node type.
create table public.nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- NULL parent = dataroom (root). Self-FK cascade makes recursive delete
  -- of metadata a single DELETE.
  parent_id uuid references public.nodes(id) on delete cascade,
  type text not null check (type in ('dataroom', 'folder', 'file')),
  name text not null check (char_length(name) between 1 and 255),
  size bigint check (size is null or size >= 0),
  blob_path text,
  content_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- files carry size + blob_path; containers never do
  constraint file_fields check (
    (type = 'file' and blob_path is not null and size is not null)
    or (type <> 'file' and blob_path is null and size is null)
  )
);

-- Listing children of a parent (root listing uses parent_id is null).
create index nodes_parent_idx on public.nodes (user_id, parent_id);

-- Duplicate folder/dataroom names are BLOCKED at the database level
-- (case-insensitive, scoped to parent + owner). Files auto-suffix on the
-- client instead. coalesce folds the NULL root parent into one bucket.
create unique index nodes_unique_container_names on public.nodes (
  user_id,
  coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(name)
) where (type <> 'file');

-- Full-text search over name + extracted PDF text ('simple' config:
-- filenames and legal docs are multilingual, no stemming surprises).
alter table public.nodes add column fts tsvector
  generated always as (
    to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(content_text, ''))
  ) stored;
create index nodes_fts_idx on public.nodes using gin (fts);

-- updated_at maintained by trigger so clients can't forget it.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger nodes_set_updated_at
  before update on public.nodes
  for each row execute function public.set_updated_at();

-- Owner-only access.
alter table public.nodes enable row level security;

create policy "nodes_select_own" on public.nodes
  for select using ((select auth.uid()) = user_id);
create policy "nodes_insert_own" on public.nodes
  for insert with check ((select auth.uid()) = user_id);
create policy "nodes_update_own" on public.nodes
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "nodes_delete_own" on public.nodes
  for delete using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 2) subtree_rpcs_and_storage
-- ---------------------------------------------------------------------------

-- Descendant counts for delete confirms (target itself excluded).
-- SECURITY INVOKER: RLS keeps the walk inside the caller's own rows.
create or replace function public.get_subtree_stats(node_id uuid)
returns table (folders bigint, files bigint)
language sql
stable
set search_path = ''
as $$
  with recursive subtree as (
    select id, type from public.nodes where parent_id = node_id
    union all
    select n.id, n.type from public.nodes n
    join subtree s on n.parent_id = s.id
  )
  select
    count(*) filter (where type <> 'file') as folders,
    count(*) filter (where type = 'file') as files
  from subtree;
$$;

-- Blob paths of the whole subtree INCLUDING the node itself — collected
-- before deleting metadata so storage objects can be removed too.
create or replace function public.get_subtree_blob_paths(node_id uuid)
returns setof text
language sql
stable
set search_path = ''
as $$
  with recursive subtree as (
    select id, blob_path from public.nodes where id = node_id
    union all
    select n.id, n.blob_path from public.nodes n
    join subtree s on n.parent_id = s.id
  )
  select blob_path from subtree where blob_path is not null;
$$;

-- Search within one dataroom's subtree: substring match on the name OR
-- full-text match on extracted PDF content. Returns the parent's name so
-- results can show where a match lives. (Superseded below.)
create or replace function public.search_nodes(root_id uuid, query text)
returns table (
  id uuid,
  parent_id uuid,
  type text,
  name text,
  size bigint,
  blob_path text,
  created_at timestamptz,
  updated_at timestamptz,
  parent_name text,
  content_match boolean
)
language sql
stable
set search_path = ''
as $$
  with recursive subtree as (
    select n.* from public.nodes n where n.id = root_id
    union all
    select n.* from public.nodes n
    join subtree s on n.parent_id = s.id
  )
  select
    n.id, n.parent_id, n.type, n.name, n.size, n.blob_path,
    n.created_at, n.updated_at,
    p.name as parent_name,
    (n.fts @@ websearch_to_tsquery('simple', query)
      and n.name not ilike '%' || query || '%') as content_match
  from subtree n
  join public.nodes p on p.id = n.parent_id
  where n.id <> root_id
    and length(trim(query)) > 0
    and (
      n.name ilike '%' || query || '%'
      or n.fts @@ websearch_to_tsquery('simple', query)
    )
  order by (n.type = 'file'), lower(n.name)
  limit 100;
$$;

-- Private bucket for PDFs; objects live under {user_id}/{uuid}.pdf.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pdfs', 'pdfs', false, null, array['application/pdf'])
on conflict (id) do nothing;

create policy "pdfs_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "pdfs_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "pdfs_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- 3) auto_confirm_new_users
-- ---------------------------------------------------------------------------

-- Password-only sign-up: every new user is confirmed at insert, so no
-- confirmation email is ever required. (The hosted "Confirm email" toggle
-- isn't reachable via SQL; this trigger achieves the same effect.)
create or replace function public.auto_confirm_email()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
  return new;
end;
$$;

create trigger auto_confirm_email
  before insert on auth.users
  for each row execute function public.auto_confirm_email();

-- ---------------------------------------------------------------------------
-- 4) soft_delete_trash
-- ---------------------------------------------------------------------------

-- Soft delete: only the deletion ROOT gets deleted_at; descendants stay
-- linked and become unreachable because every live-tree walk stops at a
-- trashed node. Restoring the root brings the whole subtree back.
alter table public.nodes add column deleted_at timestamptz;

create index nodes_trash_idx on public.nodes (user_id, deleted_at desc)
  where deleted_at is not null;

-- Trashed containers must not hold their names hostage.
drop index if exists public.nodes_unique_container_names;
create unique index nodes_unique_container_names on public.nodes (
  user_id,
  coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(name)
) where (type <> 'file' and deleted_at is null);

-- Search walks the LIVE subtree only: the CTE cannot pass through a
-- trashed node, so trashed subtrees never surface. (Superseded below.)
create or replace function public.search_nodes(root_id uuid, query text)
returns table (
  id uuid,
  parent_id uuid,
  type text,
  name text,
  size bigint,
  blob_path text,
  created_at timestamptz,
  updated_at timestamptz,
  parent_name text,
  content_match boolean
)
language sql
stable
set search_path = ''
as $$
  with recursive subtree as (
    select n.* from public.nodes n where n.id = root_id and n.deleted_at is null
    union all
    select n.* from public.nodes n
    join subtree s on n.parent_id = s.id
    where n.deleted_at is null
  )
  select
    n.id, n.parent_id, n.type, n.name, n.size, n.blob_path,
    n.created_at, n.updated_at,
    p.name as parent_name,
    (n.fts @@ websearch_to_tsquery('simple', query)
      and n.name not ilike '%' || query || '%') as content_match
  from subtree n
  join public.nodes p on p.id = n.parent_id
  where n.id <> root_id
    and length(trim(query)) > 0
    and (
      n.name ilike '%' || query || '%'
      or n.fts @@ websearch_to_tsquery('simple', query)
    )
  order by (n.type = 'file'), lower(n.name)
  limit 100;
$$;

-- Trash listing with the containing dataroom's name for context.
-- (Superseded below.)
create or replace function public.list_trash()
returns table (
  id uuid,
  parent_id uuid,
  type text,
  name text,
  size bigint,
  blob_path text,
  created_at timestamptz,
  updated_at timestamptz,
  deleted_at timestamptz,
  room_name text
)
language sql
stable
set search_path = ''
as $$
  with recursive up as (
    select t.id as trash_id, t.parent_id as cursor, 1 as depth
    from public.nodes t where t.deleted_at is not null
    union all
    select u.trash_id, n.parent_id, u.depth + 1
    from up u
    join public.nodes n on n.id = u.cursor
    where u.depth < 60
  ),
  rooms as (
    select distinct on (u.trash_id) u.trash_id, n.name as room_name
    from up u
    join public.nodes n on n.id = u.cursor
    where n.parent_id is null
  )
  select t.id, t.parent_id, t.type, t.name, t.size, t.blob_path,
         t.created_at, t.updated_at, t.deleted_at, r.room_name
  from public.nodes t
  left join rooms r on r.trash_id = t.id
  where t.deleted_at is not null
  order by t.deleted_at desc;
$$;

-- ---------------------------------------------------------------------------
-- 5) dataroom_identity_fields
-- ---------------------------------------------------------------------------

-- Dataroom identity: optional description + avatar (icon name, palette key).
alter table public.nodes
  add column if not exists description text
    check (description is null or char_length(description) <= 500),
  add column if not exists icon text,
  add column if not exists color text;

drop function if exists public.list_trash();

-- Trash listing now also carries the identity fields.
create function public.list_trash()
returns table (
  id uuid,
  parent_id uuid,
  type text,
  name text,
  size bigint,
  blob_path text,
  created_at timestamptz,
  updated_at timestamptz,
  deleted_at timestamptz,
  room_name text,
  description text,
  icon text,
  color text
)
language sql
stable
set search_path = ''
as $$
  with recursive up as (
    select t.id as trash_id, t.parent_id as cursor, 1 as depth
    from public.nodes t where t.deleted_at is not null
    union all
    select u.trash_id, n.parent_id, u.depth + 1
    from up u
    join public.nodes n on n.id = u.cursor
    where u.depth < 60
  ),
  rooms as (
    select distinct on (u.trash_id) u.trash_id, n.name as room_name
    from up u
    join public.nodes n on n.id = u.cursor
    where n.parent_id is null
  )
  select t.id, t.parent_id, t.type, t.name, t.size, t.blob_path,
         t.created_at, t.updated_at, t.deleted_at, r.room_name,
         t.description, t.icon, t.color
  from public.nodes t
  left join rooms r on r.trash_id = t.id
  where t.deleted_at is not null
  order by t.deleted_at desc;
$$;

-- ---------------------------------------------------------------------------
-- 6) split_profiles_and_file_texts
-- ---------------------------------------------------------------------------

-- profiles: account data, one row per auth user. Credentials stay in the
-- managed auth.users schema — passwords never touch application tables.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles
  for select using ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
  for update using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- file_texts: heavy searchable document text, split out of nodes so tree
-- queries stay lean. One row per file that has an extractable text layer.
create table public.file_texts (
  node_id uuid primary key references public.nodes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text,
  fts tsvector generated always as (
    to_tsvector('simple', coalesce(content, ''))
  ) stored
);

create index file_texts_fts_idx on public.file_texts using gin (fts);

alter table public.file_texts enable row level security;
create policy "file_texts_all_own" on public.file_texts
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

insert into public.file_texts (node_id, user_id, content)
select id, user_id, content_text
from public.nodes
where content_text is not null;

-- nodes slims down: search text now lives in file_texts.
drop index if exists public.nodes_fts_idx;
alter table public.nodes
  drop column if exists fts,
  drop column if exists content_text;

-- Search v3: name match on nodes, content match via file_texts.
create or replace function public.search_nodes(root_id uuid, query text)
returns table (
  id uuid,
  parent_id uuid,
  type text,
  name text,
  size bigint,
  blob_path text,
  created_at timestamptz,
  updated_at timestamptz,
  parent_name text,
  content_match boolean
)
language sql
stable
set search_path = ''
as $$
  with recursive subtree as (
    select n.* from public.nodes n where n.id = root_id and n.deleted_at is null
    union all
    select n.* from public.nodes n
    join subtree s on n.parent_id = s.id
    where n.deleted_at is null
  )
  select
    n.id, n.parent_id, n.type, n.name, n.size, n.blob_path,
    n.created_at, n.updated_at,
    p.name as parent_name,
    (exists (
      select 1 from public.file_texts ft
      where ft.node_id = n.id
        and ft.fts @@ websearch_to_tsquery('simple', query)
    ) and n.name not ilike '%' || query || '%') as content_match
  from subtree n
  join public.nodes p on p.id = n.parent_id
  where n.id <> root_id
    and length(trim(query)) > 0
    and (
      n.name ilike '%' || query || '%'
      or exists (
        select 1 from public.file_texts ft
        where ft.node_id = n.id
          and ft.fts @@ websearch_to_tsquery('simple', query)
      )
    )
  order by (n.type = 'file'), lower(n.name)
  limit 100;
$$;

-- ---------------------------------------------------------------------------
-- 7) search_trash
-- ---------------------------------------------------------------------------

-- Search across everything in the trash: root items AND their descendants,
-- so a file inside a deleted folder is findable by name. SECURITY INVOKER —
-- RLS keeps the walk inside the caller's own rows.
create or replace function public.search_trash(query text)
returns table (
  id uuid,
  parent_id uuid,
  type text,
  name text,
  size bigint,
  blob_path text,
  created_at timestamptz,
  updated_at timestamptz,
  description text,
  icon text,
  color text,
  root_id uuid,
  root_name text,
  is_root boolean
)
language sql
stable
set search_path = ''
as $$
  with recursive sub as (
    select n.*, n.id as root_id, n.name as root_name
    from public.nodes n where n.deleted_at is not null
    union all
    select n.*, s.root_id, s.root_name
    from public.nodes n join sub s on n.parent_id = s.id
  )
  select s.id, s.parent_id, s.type, s.name, s.size, s.blob_path,
         s.created_at, s.updated_at, s.description, s.icon, s.color,
         s.root_id, s.root_name, (s.id = s.root_id) as is_root
  from sub s
  where length(trim(query)) > 0
    and s.name ilike '%' || query || '%'
  order by (s.type = 'file'), lower(s.name)
  limit 100;
$$;

-- ---------------------------------------------------------------------------
-- 8) search_snippets
-- ---------------------------------------------------------------------------

-- Search v4: content hits also return a short highlighted fragment
-- (ts_headline) so results can show WHY a document matched. Highlight
-- markers [[ ]] are parsed client-side into <mark>.
drop function if exists public.search_nodes(uuid, text);

create function public.search_nodes(root_id uuid, query text)
returns table (
  id uuid,
  parent_id uuid,
  type text,
  name text,
  size bigint,
  blob_path text,
  created_at timestamptz,
  updated_at timestamptz,
  parent_name text,
  content_match boolean,
  snippet text
)
language sql
stable
set search_path = ''
as $$
  with recursive subtree as (
    select n.* from public.nodes n where n.id = root_id and n.deleted_at is null
    union all
    select n.* from public.nodes n
    join subtree s on n.parent_id = s.id
    where n.deleted_at is null
  )
  select
    n.id, n.parent_id, n.type, n.name, n.size, n.blob_path,
    n.created_at, n.updated_at,
    p.name as parent_name,
    (exists (
      select 1 from public.file_texts ft
      where ft.node_id = n.id
        and ft.fts @@ websearch_to_tsquery('simple', query)
    ) and n.name not ilike '%' || query || '%') as content_match,
    (select ts_headline(
       'simple', ft.content, websearch_to_tsquery('simple', query),
       'MaxFragments=1, MaxWords=14, MinWords=8, StartSel=[[, StopSel=]]'
     )
     from public.file_texts ft
     where ft.node_id = n.id
       and ft.fts @@ websearch_to_tsquery('simple', query)) as snippet
  from subtree n
  join public.nodes p on p.id = n.parent_id
  where n.id <> root_id
    and length(trim(query)) > 0
    and (
      n.name ilike '%' || query || '%'
      or exists (
        select 1 from public.file_texts ft
        where ft.node_id = n.id
          and ft.fts @@ websearch_to_tsquery('simple', query)
      )
    )
  order by (n.type = 'file'), lower(n.name)
  limit 100;
$$;

-- ---------------------------------------------------------------------------
-- 9) search_all_nodes
-- ---------------------------------------------------------------------------

-- Search v5: global search across every live dataroom (home screen).
-- Same name/content semantics as search_nodes, but walks from ALL live
-- roots, includes the datarooms themselves as hits, and returns the room
-- each hit lives in so results can navigate anywhere. SECURITY INVOKER --
-- RLS on nodes/file_texts keeps the walk inside the caller's own rows.
create or replace function public.search_all_nodes(query text)
returns table (
  id uuid,
  parent_id uuid,
  type text,
  name text,
  size bigint,
  blob_path text,
  created_at timestamptz,
  updated_at timestamptz,
  description text,
  icon text,
  color text,
  parent_name text,
  content_match boolean,
  snippet text,
  room_id uuid,
  room_name text
)
language sql
stable
set search_path = ''
as $$
  with recursive live as (
    select n.*, n.id as room_id, n.name as room_name
    from public.nodes n
    where n.parent_id is null and n.deleted_at is null
    union all
    select n.*, l.room_id, l.room_name
    from public.nodes n
    join live l on n.parent_id = l.id
    where n.deleted_at is null
  )
  select
    l.id, l.parent_id, l.type, l.name, l.size, l.blob_path,
    l.created_at, l.updated_at, l.description, l.icon, l.color,
    p.name as parent_name,
    (exists (
      select 1 from public.file_texts ft
      where ft.node_id = l.id
        and ft.fts @@ websearch_to_tsquery('simple', query)
    ) and l.name not ilike '%' || query || '%') as content_match,
    (select ts_headline(
       'simple', ft.content, websearch_to_tsquery('simple', query),
       'MaxFragments=1, MaxWords=14, MinWords=8, StartSel=[[, StopSel=]]'
     )
     from public.file_texts ft
     where ft.node_id = l.id
       and ft.fts @@ websearch_to_tsquery('simple', query)) as snippet,
    l.room_id, l.room_name
  from live l
  left join public.nodes p on p.id = l.parent_id
  where length(trim(query)) > 0
    and (
      l.name ilike '%' || query || '%'
      or exists (
        select 1 from public.file_texts ft
        where ft.node_id = l.id
          and ft.fts @@ websearch_to_tsquery('simple', query)
      )
    )
  order by (l.type = 'file'), (l.parent_id is not null), lower(l.name)
  limit 100;
$$;
