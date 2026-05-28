-- 0001_auth_and_maps.sql
--
-- Adds per-user storage for hexer maps with client-side end-to-end
-- encryption. Supabase only ever sees ciphertext. RLS scopes every row to
-- its owner via auth.uid().
--
-- All ciphertext / IV / salt columns are TEXT (base64-encoded). This keeps
-- supabase-js calls straightforward (no \x-hex-string gymnastics for bytea),
-- at the cost of ~33% storage overhead vs raw bytea — irrelevant at this
-- scale. Validation that a value is well-formed base64 happens client-side.
--
-- Apply by pasting this file into the Supabase SQL editor (project
-- qtknfcplbxgtmrzxocfu) and clicking Run.

-- If a previous attempt is in place with bytea columns, drop first.
drop function if exists public.delete_self();
drop table if exists public.maps;
drop table if exists public.user_keys;

-- =============================================================================
-- user_keys: one row per signed-in user, holding the salt + the DEK wrapped
-- twice (once by a password-derived KEK, once by a recovery-code-derived KEK).
-- A row is created during signup. The plaintext DEK never touches the server.
-- =============================================================================

create table public.user_keys (
  user_id                 uuid        primary key references auth.users (id) on delete cascade,
  salt                    text        not null,                       -- base64 of 16 bytes
  kdf_iterations          int         not null default 600000,
  wrapped_dek_password    text        not null,                       -- base64 ciphertext of DEK
  wrapped_dek_password_iv text        not null,                       -- base64 of 12-byte IV
  wrapped_dek_recovery    text        not null,
  wrapped_dek_recovery_iv text        not null,
  created_at              timestamptz not null default now()
);

alter table public.user_keys enable row level security;

create policy user_keys_owner_select on public.user_keys
  for select using (user_id = auth.uid());

create policy user_keys_owner_insert on public.user_keys
  for insert with check (user_id = auth.uid());

create policy user_keys_owner_update on public.user_keys
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- No delete policy: rows are removed via cascade when auth.users is deleted
-- (by delete_self() below or by an admin).


-- =============================================================================
-- maps: ciphertext storage for SavedMap blobs and their human-readable names.
-- One row per map; the row id matches the UUID the client generates locally,
-- so promoting a local map to the cloud is idempotent.
-- =============================================================================

create table public.maps (
  id          uuid        primary key,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  name_ct     text        not null,                                   -- base64 ciphertext of map name
  name_iv     text        not null,                                   -- base64 of 12-byte IV
  data_ct     text        not null,                                   -- base64 ciphertext of SavedMap JSON
  data_iv     text        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index maps_user_updated_idx on public.maps (user_id, updated_at desc);

alter table public.maps enable row level security;

create policy maps_owner_select on public.maps
  for select using (user_id = auth.uid());

create policy maps_owner_insert on public.maps
  for insert with check (user_id = auth.uid());

create policy maps_owner_update on public.maps
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy maps_owner_delete on public.maps
  for delete using (user_id = auth.uid());


-- =============================================================================
-- delete_self(): lets a signed-in user delete their own auth.users row, which
-- cascades to user_keys + maps. The Supabase JS client cannot call
-- auth.admin.deleteUser with a publishable key, so we expose this narrow RPC
-- instead. SECURITY DEFINER runs as the function owner (postgres), so we lock
-- the search_path and enforce auth.uid() inside the body.
-- =============================================================================

create or replace function public.delete_self()
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_self() from public;
grant execute on function public.delete_self() to authenticated;
