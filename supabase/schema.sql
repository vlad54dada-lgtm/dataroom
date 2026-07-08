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

-- ---------------------------------------------------------------------------
-- 10) file_versions
-- ---------------------------------------------------------------------------

-- File versioning: every superseded upload of a file is kept as a version.
-- The nodes row always mirrors the CURRENT version (existing readers keep
-- working untouched); file_versions is the linear history, including the
-- current one once a file has been versioned at least once.
create table public.file_versions (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.nodes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version int not null,
  blob_path text not null,
  size bigint not null,
  created_at timestamptz not null default now(),
  unique (node_id, version)
);

create index file_versions_node_idx
  on public.file_versions (node_id, version desc);

alter table public.file_versions enable row level security;
create policy "file_versions_all_own" on public.file_versions
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Recursive delete must sweep version blobs too, or they leak in Storage.
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
  select blob_path from subtree where blob_path is not null
  union
  select fv.blob_path from public.file_versions fv
  join subtree s on fv.node_id = s.id;
$$;

-- ---------------------------------------------------------------------------
-- 12) dataroom sort order
-- ---------------------------------------------------------------------------

-- Custom drag-to-reorder order for datarooms on the home grid. Null until a
-- room is first reordered -- nulls sort last (new rooms append at the end),
-- so behaviour is unchanged until the user drags.
alter table public.nodes add column sort_order double precision;

-- Atomic reorder: assign each id its 1-based position from the array. RLS on
-- nodes restricts the update to the caller's own rows, so no explicit user
-- filter is needed.
create or replace function public.reorder_nodes(ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.nodes n
  set sort_order = u.ord
  from unnest(ids) with ordinality as u(id, ord)
  where n.id = u.id;
$$;

-- ---------------------------------------------------------------------------
-- 13) file_sharing
-- ---------------------------------------------------------------------------
--
-- Public per-file share links. A file carries at most one active link
-- (unique node_id). The token is an unguessable uuid; anyone holding the
-- link views the file with NO sign-in ("anyone with the link"). Revoking
-- deletes the row, so the old link dies immediately and re-sharing mints a
-- fresh token. expires_at is reserved for a future expiry control (null =
-- never); the validity predicate already honours it.

create table public.file_shares (
  token uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.nodes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  -- one active link per file
  unique (node_id)
);

create index file_shares_node_idx on public.file_shares (node_id);

-- Owner-only management: create / read / revoke your own share rows.
alter table public.file_shares enable row level security;

create policy "file_shares_select_own" on public.file_shares
  for select using ((select auth.uid()) = user_id);
create policy "file_shares_insert_own" on public.file_shares
  for insert with check ((select auth.uid()) = user_id);
create policy "file_shares_delete_own" on public.file_shares
  for delete using ((select auth.uid()) = user_id);

-- Token -> shared file, for ANONYMOUS visitors. SECURITY DEFINER so it can
-- read past the owner-only RLS on nodes/file_shares, but it returns ONLY the
-- single file a valid, live token points at — nothing else is reachable.
create or replace function public.get_shared_file(share_token uuid)
returns table (node_id uuid, name text, size bigint, blob_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.name, n.size, n.blob_path
  from public.file_shares s
  join public.nodes n on n.id = s.node_id
  where s.token = share_token
    and (s.expires_at is null or s.expires_at > now())
    and n.deleted_at is null
    and n.type = 'file';
$$;

-- Is this storage object the CURRENT blob of a validly-shared file? Used by
-- the anon storage-read policy below. SECURITY DEFINER so the lookup isn't
-- itself blocked by nodes/file_shares RLS when evaluated as the anon role.
create or replace function public.is_object_shared(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.file_shares s
    join public.nodes n on n.id = s.node_id
    where n.blob_path = object_name
      and (s.expires_at is null or s.expires_at > now())
      and n.deleted_at is null
  );
$$;

grant execute on function public.get_shared_file(uuid) to anon, authenticated;
grant execute on function public.is_object_shared(text) to anon, authenticated;

-- Anon (and any signed-in user) may DOWNLOAD a pdf object only while it is
-- the live blob of a shared file. Policies are OR'd with pdfs_select_own, so
-- owners keep full access to their own bucket folder unchanged.
create policy "pdfs_select_shared" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'pdfs' and public.is_object_shared(name));

-- ---------------------------------------------------------------------------
-- 14) access_and_sharing_v2
-- ---------------------------------------------------------------------------
--
-- Three access surfaces on top of the owner-only model:
--   * public links extend to FOLDERS (anon browsing of the shared subtree)
--     and track opens (count + last opened);
--   * dataroom MEMBERSHIP: the owner invites people by email as viewer
--     (read/download) or editor (full content CRUD, no access management,
--     no changes to the room row itself);
--   * every table's RLS delegates to one helper, room_access(room), over a
--     denormalized nodes.root_id (the dataroom every node belongs to).

-- 14.1 root_id: the dataroom every node belongs to (self for datarooms).
alter table public.nodes add column root_id uuid references public.nodes(id) on delete cascade;

-- Backfill must not bump updated_at on every row.
alter table public.nodes disable trigger nodes_set_updated_at;
with recursive tree as (
  select id, id as root from public.nodes where parent_id is null
  union all
  select n.id, t.root from public.nodes n join tree t on n.parent_id = t.id
)
update public.nodes n set root_id = t.root from tree t where n.id = t.id;
alter table public.nodes enable trigger nodes_set_updated_at;

alter table public.nodes alter column root_id set not null;
create index nodes_root_idx on public.nodes (root_id);
-- Membership queries no longer filter by user_id equality.
drop index public.nodes_parent_idx;
create index nodes_parent_idx on public.nodes (parent_id);

-- 14.2 Triggers maintaining root_id (BEFORE computes; AFTER repoints the
-- subtree on a cross-room move). SECURITY DEFINER like set_updated_at.
create or replace function public.nodes_root_id_before()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.parent_id is null then new.root_id := new.id;
    else
      select root_id into new.root_id from public.nodes where id = new.parent_id;
      if new.root_id is null then raise exception 'parent % not found', new.parent_id; end if;
    end if;
  else
    if pg_trigger_depth() > 1 then return new; end if;  -- internal subtree fix-up
    if new.parent_id is distinct from old.parent_id then
      if new.parent_id is null then new.root_id := new.id;
      else
        select root_id into new.root_id from public.nodes where id = new.parent_id;
        if new.root_id is null then raise exception 'parent % not found', new.parent_id; end if;
      end if;
    else
      new.root_id := old.root_id;  -- clients can never set root_id directly
    end if;
    if new.user_id is distinct from old.user_id then raise exception 'user_id is immutable'; end if;
  end if;
  return new;
end;
$$;
create trigger nodes_root_id_before before insert or update on public.nodes
  for each row execute function public.nodes_root_id_before();

create or replace function public.nodes_root_id_after()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  update public.nodes set root_id = new.root_id
  where id in (
    with recursive sub as (
      select id from public.nodes where parent_id = new.id
      union all
      select n.id from public.nodes n join sub s on n.parent_id = s.id
    ) select id from sub
  ) and root_id is distinct from new.root_id;
  return null;
end;
$$;
create trigger nodes_root_id_after after update of parent_id on public.nodes
  for each row when (old.root_id is distinct from new.root_id)
  execute function public.nodes_root_id_after();

-- 14.3 Name uniqueness rescoped: children share ONE namespace per parent
-- (owner + editors write into the same folder); roots stay per-account.
drop index public.nodes_unique_container_names;
create unique index nodes_unique_container_names on public.nodes (parent_id, lower(name))
  where (type <> 'file' and deleted_at is null and parent_id is not null);
create unique index nodes_unique_root_names on public.nodes (user_id, lower(name))
  where (type <> 'file' and deleted_at is null and parent_id is null);

-- 14.4 Membership.
create table public.room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.nodes(id) on delete cascade,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  user_id uuid references auth.users(id) on delete cascade,
  role text not null check (role in ('viewer', 'editor')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (room_id, email)
);
create index room_members_user_idx on public.room_members (user_id, room_id);
create index room_members_email_idx on public.room_members (email) where user_id is null;
alter table public.room_members enable row level security;

-- 14.5 Access helpers. SECURITY DEFINER = safe to call FROM policies (they
-- read past RLS, so no recursive policy evaluation).
create or replace function public.room_owner_uid(room uuid)
returns uuid language sql stable security definer set search_path = ''
as $$ select user_id from public.nodes where id = room; $$;

create or replace function public.room_access(room uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select case
    when exists (select 1 from public.nodes r where r.id = room and r.user_id = (select auth.uid())) then 'owner'
    else (select m.role from public.room_members m where m.room_id = room and m.user_id = (select auth.uid()))
  end;
$$;

create or replace function public.node_root(node uuid)
returns uuid language sql stable security definer set search_path = ''
as $$ select root_id from public.nodes where id = node; $$;

create policy "room_members_select" on public.room_members for select
  using ((select auth.uid()) = user_id or public.room_owner_uid(room_id) = (select auth.uid()));
-- user_id is TRIGGER-OWNED (claim_invite_on_insert overwrites any client
-- value), so the policy doesn't need to constrain it.
create policy "room_members_insert_owner" on public.room_members for insert
  with check (public.room_owner_uid(room_id) = (select auth.uid())
              and invited_by = (select auth.uid()));
create policy "room_members_update_owner" on public.room_members for update
  using (public.room_owner_uid(room_id) = (select auth.uid()))
  with check (public.room_owner_uid(room_id) = (select auth.uid()));
create policy "room_members_delete" on public.room_members for delete
  using (public.room_owner_uid(room_id) = (select auth.uid()) or (select auth.uid()) = user_id);

-- 14.6 Invite claiming: at signup (trigger) and at any later sign-in (RPC).
create or replace function public.claim_invites_for_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.room_members set user_id = new.id where email = lower(new.email) and user_id is null;
  return new;
end;
$$;
create trigger claim_invites_on_signup after insert on auth.users
  for each row execute function public.claim_invites_for_new_user();

create or replace function public.claim_room_invites()
returns int language plpgsql security definer set search_path = ''
as $$
declare uid uuid := (select auth.uid()); em text; n int;
begin
  if uid is null then return 0; end if;
  select lower(email) into em from auth.users where id = uid;
  update public.room_members set user_id = uid where email = em and user_id is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- An invite for an ALREADY-REGISTERED email links immediately, so the owner
-- sees an active member, not a pending badge until next sign-in. user_id is
-- fully trigger-owned: whatever the client sends is overwritten.
create or replace function public.claim_invite_on_insert()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  new.user_id := (select id from auth.users where lower(email) = new.email);
  return new;
end;
$$;
create trigger claim_invite_on_insert before insert on public.room_members
  for each row execute function public.claim_invite_on_insert();

-- 14.7 nodes policies: membership-aware. Replaces the owner-only set; owner
-- behavior is identical (room_access = 'owner' for every pre-existing row).
drop policy "nodes_select_own" on public.nodes;
drop policy "nodes_insert_own" on public.nodes;
drop policy "nodes_update_own" on public.nodes;
drop policy "nodes_delete_own" on public.nodes;

-- Viewer never sees trash; editor sees trash but never a trashed ROOM row
-- (only the owner restores a room). One expression keeps list_trash/
-- search_trash/countTrash consistent with zero RPC changes.
--
-- The first arm is NOT redundant: INSERT ... RETURNING on a NEW dataroom
-- evaluates this policy, and room_access() (STABLE) reads the statement-
-- start snapshot where the just-inserted room doesn't exist yet. Root rows
-- owned by the caller are owner-visible by definition; content rows
-- (parent_id not null) still answer to room_access alone, so a removed
-- editor loses sight of rows they created.
create policy "nodes_select_access" on public.nodes for select
  using (
    (parent_id is null and (select auth.uid()) = user_id)
    or case public.room_access(root_id)
      when 'owner'  then true
      when 'editor' then (deleted_at is null or type <> 'dataroom')
      when 'viewer' then deleted_at is null
      else false
    end
  );
-- WITH CHECK runs AFTER before-triggers, so root_id is already correct.
-- A new dataroom's root_id = its own id, which doesn't exist yet: hence
-- the parent_id-null bypass.
create policy "nodes_insert_access" on public.nodes for insert
  with check (
    (select auth.uid()) = user_id
    and (parent_id is null or public.room_access(root_id) in ('owner', 'editor'))
  );
-- Editors touch content only, never the room row (parent_id not null on
-- BOTH sides: can't edit a room, can't turn a folder into a root).
create policy "nodes_update_access" on public.nodes for update
  using (public.room_access(root_id) = 'owner'
         or (public.room_access(root_id) = 'editor' and parent_id is not null))
  with check (public.room_access(root_id) = 'owner'
              or (public.room_access(root_id) = 'editor' and parent_id is not null));
create policy "nodes_delete_access" on public.nodes for delete
  using (public.room_access(root_id) = 'owner'
         or (public.room_access(root_id) = 'editor' and parent_id is not null));

-- 14.8 file_texts / file_versions: members read, editors write.
drop policy "file_texts_all_own" on public.file_texts;
create policy "file_texts_select_access" on public.file_texts for select
  using (public.room_access(public.node_root(node_id)) is not null);
create policy "file_texts_insert_access" on public.file_texts for insert
  with check ((select auth.uid()) = user_id
    and public.room_access(public.node_root(node_id)) in ('owner','editor'));
create policy "file_texts_update_access" on public.file_texts for update
  using (public.room_access(public.node_root(node_id)) in ('owner','editor'))
  with check (public.room_access(public.node_root(node_id)) in ('owner','editor'));
create policy "file_texts_delete_access" on public.file_texts for delete
  using (public.room_access(public.node_root(node_id)) in ('owner','editor'));

drop policy "file_versions_all_own" on public.file_versions;
create policy "file_versions_select_access" on public.file_versions for select
  using (public.room_access(public.node_root(node_id)) is not null);
create policy "file_versions_insert_access" on public.file_versions for insert
  with check ((select auth.uid()) = user_id
    and public.room_access(public.node_root(node_id)) in ('owner','editor'));
create policy "file_versions_delete_access" on public.file_versions for delete
  using (public.room_access(public.node_root(node_id)) in ('owner','editor'));

-- 14.9 Storage: member read (current + version blobs). Editor upload needs
-- no change: saveFile writes {uploader_uid}/... which pdfs_insert_own permits.
create or replace function public.is_object_member_readable(object_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.nodes n
    where n.blob_path = object_name and public.room_access(n.root_id) is not null
  ) or exists (
    select 1 from public.file_versions fv
    join public.nodes n on n.id = fv.node_id
    where fv.blob_path = object_name and public.room_access(n.root_id) is not null
  );
$$;
create policy "pdfs_select_member" on storage.objects for select to authenticated
  using (bucket_id = 'pdfs' and public.is_object_member_readable(name));

-- 14.10 Purge claims: blob cleanup when the deleter isn't the uploader.
-- Claimed BEFORE the metadata delete (afterwards the rows are gone and no
-- policy could authorize the storage removal).
create table public.purge_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  object_name text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, object_name)
);
alter table public.purge_claims enable row level security;
create policy "purge_claims_select_own" on public.purge_claims for select
  using ((select auth.uid()) = user_id);

create or replace function public.claim_purge_paths(node_id uuid)
returns setof text language plpgsql security definer set search_path = ''
as $$
declare uid uuid := (select auth.uid()); rt uuid; par uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select root_id, parent_id into rt, par from public.nodes where id = node_id;
  if rt is null then raise exception 'not found'; end if;
  if not (public.room_access(rt) = 'owner'
          or (public.room_access(rt) = 'editor' and par is not null)) then
    raise exception 'not allowed';
  end if;
  delete from public.purge_claims where user_id = uid and created_at < now() - interval '1 hour';
  return query
    with recursive subtree as (
      select id, blob_path from public.nodes where id = node_id
      union all
      select n.id, n.blob_path from public.nodes n join subtree s on n.parent_id = s.id
    ),
    paths as (
      select blob_path from subtree where blob_path is not null
      union
      select fv.blob_path from public.file_versions fv join subtree s on fv.node_id = s.id
    ),
    ins as (
      insert into public.purge_claims (user_id, object_name)
      select uid, blob_path from paths
      on conflict do nothing
      returning object_name
    )
    select blob_path from paths;
end;
$$;
create policy "pdfs_delete_claimed" on storage.objects for delete to authenticated
  using (bucket_id = 'pdfs' and exists (
    select 1 from public.purge_claims c
    where c.user_id = (select auth.uid()) and c.object_name = name
  ));
-- Storage remove() RETURNs the deleted rows, so SELECT policies apply to the
-- delete — and by cleanup time the metadata is gone, which kills the member-
-- read visibility. A claim therefore grants SELECT too, same 1-hour window.
create policy "pdfs_select_claimed" on storage.objects for select to authenticated
  using (bucket_id = 'pdfs' and exists (
    select 1 from public.purge_claims c
    where c.user_id = (select auth.uid()) and c.object_name = name
  ));

-- 14.11 Public links: folders + open tracking + a security fix.
alter table public.file_shares
  add column open_count int not null default 0,
  add column last_opened_at timestamptz;

-- FIX: the old policy checked only the share row's user_id — with
-- membership an editor could mint a public link for owner content. Only
-- the ROOM OWNER shares, and never a dataroom.
drop policy "file_shares_insert_own" on public.file_shares;
create policy "file_shares_insert_owner" on public.file_shares for insert
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.nodes n
      where n.id = node_id and n.type <> 'dataroom'
        and public.room_access(n.root_id) = 'owner'
    )
  );

-- Token -> node (file OR folder), anon-safe.
create or replace function public.get_shared_node(share_token uuid)
returns table (node_id uuid, node_type text, name text, size bigint, blob_path text)
language sql stable security definer set search_path = ''
as $$
  select n.id, n.type, n.name, n.size, n.blob_path
  from public.file_shares s join public.nodes n on n.id = s.node_id
  where s.token = share_token
    and (s.expires_at is null or s.expires_at > now())
    and n.deleted_at is null and n.type in ('file', 'folder');
$$;

-- Children of a folder INSIDE the shared subtree. Containment = bounded
-- live up-walk from the requested parent to the token's node.
create or replace function public.list_shared_children(share_token uuid, parent uuid)
returns table (id uuid, parent_id uuid, type text, name text, size bigint,
               blob_path text, created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  with recursive share as (
    select s.node_id from public.file_shares s
    join public.nodes sn on sn.id = s.node_id
    where s.token = share_token and (s.expires_at is null or s.expires_at > now())
      and sn.deleted_at is null and sn.type = 'folder'
  ),
  up as (
    select p.id, p.parent_id, 1 as depth from public.nodes p
    where p.id = parent and p.deleted_at is null
    union all
    select n.id, n.parent_id, up.depth + 1 from public.nodes n
    join up on n.id = up.parent_id
    where n.deleted_at is null and up.depth < 60
  )
  select c.id, c.parent_id, c.type, c.name, c.size, c.blob_path, c.created_at, c.updated_at
  from public.nodes c
  where c.parent_id = parent and c.deleted_at is null
    and exists (select 1 from share sh join up u on u.id = sh.node_id);
$$;

-- Breadcrumb chain from the shared root down to node (refresh support).
-- Returns nothing when node is outside the shared subtree.
create or replace function public.get_shared_ancestors(share_token uuid, node uuid)
returns table (id uuid, name text, type text)
language sql stable security definer set search_path = ''
as $$
  with recursive share as (
    select s.node_id from public.file_shares s
    join public.nodes sn on sn.id = s.node_id
    where s.token = share_token and (s.expires_at is null or s.expires_at > now())
      and sn.deleted_at is null and sn.type = 'folder'
  ),
  up as (
    select p.id, p.parent_id, p.name, p.type, 1 as depth from public.nodes p
    where p.id = node and p.deleted_at is null
    union all
    select n.id, n.parent_id, n.name, n.type, up.depth + 1 from public.nodes n
    join up on n.id = up.parent_id
    where n.deleted_at is null and up.depth < 60
  )
  select u.id, u.name, u.type from up u
  where exists (select 1 from share sh join up r on r.id = sh.node_id)
    and u.depth <= (select min(r.depth) from up r join share sh on sh.node_id = r.id)
  order by u.depth desc;
$$;

-- Open tracking: count + last-opened, no visit log. Anon-callable.
create or replace function public.record_share_open(share_token uuid)
returns void language sql security definer set search_path = ''
as $$
  update public.file_shares
  set open_count = open_count + 1, last_opened_at = now()
  where token = share_token and (expires_at is null or expires_at > now());
$$;

-- Rewritten: TRUE when any LIVE ancestor (or the file itself) carries a
-- live share. Strictly compatible for direct file links.
create or replace function public.is_object_shared(object_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  with recursive up as (
    select n.id, n.parent_id, 1 as depth from public.nodes n
    where n.blob_path = object_name and n.deleted_at is null
    union all
    select p.id, p.parent_id, u.depth + 1 from public.nodes p
    join up u on p.id = u.parent_id
    where p.deleted_at is null and u.depth < 60
  )
  select exists (
    select 1 from public.file_shares s join up u on u.id = s.node_id
    where (s.expires_at is null or s.expires_at > now())
  );
$$;

-- 14.12 Listing RPCs for the client (SECURITY INVOKER — RLS does scoping).
create or replace function public.list_rooms()
returns table (id uuid, parent_id uuid, type text, name text, size bigint,
  blob_path text, created_at timestamptz, updated_at timestamptz,
  description text, icon text, color text, sort_order double precision,
  access text, member_count bigint)
language sql stable security invoker set search_path = ''
as $$
  select n.id, n.parent_id, n.type, n.name, n.size, n.blob_path,
         n.created_at, n.updated_at, n.description, n.icon, n.color, n.sort_order,
         public.room_access(n.id) as access,
         case when public.room_access(n.id) = 'owner'
              then (select count(*) from public.room_members m where m.room_id = n.id)
              else 0 end as member_count
  from public.nodes n
  where n.parent_id is null and n.deleted_at is null;
$$;

create or replace function public.list_my_shares()
returns table (token uuid, created_at timestamptz, open_count int,
  last_opened_at timestamptz, node_id uuid, node_name text, node_type text,
  active boolean, room_name text)
language sql stable security invoker set search_path = ''
as $$
  select s.token, s.created_at, s.open_count, s.last_opened_at,
         n.id, n.name, n.type, (n.deleted_at is null) as active,
         case when r.id = n.id then null else r.name end as room_name
  from public.file_shares s
  join public.nodes n on n.id = s.node_id
  left join public.nodes r on r.id = n.root_id
  where s.user_id = (select auth.uid())
  order by s.created_at desc;
$$;

create or replace function public.list_my_room_members()
returns table (id uuid, room_id uuid, room_name text, room_icon text,
  room_color text, email text, role text, claimed boolean, created_at timestamptz)
language sql stable security invoker set search_path = ''
as $$
  select m.id, m.room_id, r.name, r.icon, r.color,
         m.email, m.role, (m.user_id is not null) as claimed, m.created_at
  from public.room_members m
  join public.nodes r on r.id = m.room_id
  where public.room_owner_uid(m.room_id) = (select auth.uid()) and r.deleted_at is null
  order by lower(r.name), m.created_at;
$$;

-- 14.13 Grants.
grant execute on function public.get_shared_node(uuid), public.list_shared_children(uuid, uuid),
  public.get_shared_ancestors(uuid, uuid), public.record_share_open(uuid),
  public.is_object_shared(text) to anon, authenticated;
grant execute on function public.room_access(uuid), public.claim_room_invites(),
  public.claim_purge_paths(uuid), public.list_rooms(), public.list_my_shares(),
  public.list_my_room_members(), public.is_object_member_readable(text) to authenticated;
revoke execute on function public.claim_room_invites(), public.claim_purge_paths(uuid),
  public.list_rooms(), public.list_my_shares(), public.list_my_room_members() from anon;

-- 14.14 Trigger functions run as the table owner via their triggers; nothing
-- should call them through the API. (Advisor-driven hardening.)
revoke execute on function public.nodes_root_id_before(), public.nodes_root_id_after(),
  public.claim_invites_for_new_user(), public.claim_invite_on_insert(),
  public.set_updated_at(), public.auto_confirm_email(), public.handle_new_user()
from anon, authenticated, public;
