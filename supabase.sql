-- FamilyChat: esquema inicial privado para Supabase.
-- Ejecuta TODO este archivo en Supabase > SQL Editor > New query.
-- Este SQL configura perfiles, invitación, chats, grupos, mensajes y almacenamiento privado.
-- No contiene claves secretas del proyecto.

create extension if not exists pgcrypto;

-- Configuración privada: el hash no se expone al navegador.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.app_config (
  key text primary key,
  value text not null
);
revoke all on private.app_config from public, anon, authenticated;
insert into private.app_config(key, value)
values ('invite_code_sha256', encode(digest('amoalilli', 'sha256'), 'hex'))
on conflict (key) do nothing;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null default 'Usuario' check (char_length(username) between 2 and 30),
  avatar_path text,
  invite_accepted boolean not null default false,
  created_at timestamptz not null default now()
);
-- Compatibilidad con perfiles creados por la versión anterior de GamesAndChat.
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists invite_accepted boolean not null default false;
alter table public.profiles enable row level security;

create or replace function public.create_profile_for_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles(id, username)
  values (
    new.id,
    coalesce(nullif(left(new.raw_user_meta_data ->> 'username', 30), ''), split_part(new.email, '@', 1), 'Usuario')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_familychat on auth.users;
create trigger on_auth_user_created_familychat
after insert on auth.users
for each row execute procedure public.create_profile_for_user();

create or replace function public.is_app_member()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.invite_accepted = true
  );
$$;
revoke all on function public.is_app_member() from public;
grant execute on function public.is_app_member() to authenticated;

create or replace function public.redeem_invite(p_code text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare expected_hash text;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para validar la invitación.';
  end if;
  select value into expected_hash from private.app_config where key = 'invite_code_sha256';
  if expected_hash is null or encode(digest(coalesce(p_code, ''), 'sha256'), 'hex') <> expected_hash then
    raise exception 'Clave de invitación incorrecta.';
  end if;
  update public.profiles set invite_accepted = true where id = auth.uid();
  return found;
end;
$$;
revoke all on function public.redeem_invite(text) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct','group')),
  title text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((type = 'direct' and title is null) or (type = 'group' and char_length(coalesce(title,'')) between 2 and 60))
);
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);

-- Helper SECURITY DEFINER: prevents recursive RLS checks on conversation_members.
create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_conversation_member(uuid) from public;
grant execute on function public.is_conversation_member(uuid) to authenticated;

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

-- Profiles are visible only to approved FamilyChat members.
drop policy if exists "profiles_select_members" on public.profiles;
create policy "profiles_select_members" on public.profiles for select to authenticated
using (public.is_app_member() and invite_accepted = true);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated
using (id = (select auth.uid()) and public.is_app_member())
with check (id = (select auth.uid()) and public.is_app_member());

-- Membership list is visible only to participants of the relevant conversation.
drop policy if exists "members_select_if_member" on public.conversation_members;
create policy "members_select_if_member" on public.conversation_members for select to authenticated
using (public.is_app_member() and public.is_conversation_member(conversation_id));
drop policy if exists "members_insert_by_creator" on public.conversation_members;
create policy "members_insert_by_creator" on public.conversation_members for insert to authenticated
with check (
  public.is_app_member() and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.created_by = (select auth.uid())
  )
);

drop policy if exists "conversations_select_members" on public.conversations;
create policy "conversations_select_members" on public.conversations for select to authenticated
using (public.is_app_member() and public.is_conversation_member(id));
drop policy if exists "conversations_insert_own" on public.conversations;
create policy "conversations_insert_own" on public.conversations for insert to authenticated
with check (public.is_app_member() and created_by = (select auth.uid()));
drop policy if exists "conversations_update_creator" on public.conversations;
create policy "conversations_update_creator" on public.conversations for update to authenticated
using (created_by = (select auth.uid()) and public.is_app_member())
with check (created_by = (select auth.uid()) and public.is_app_member());

drop policy if exists "messages_select_members" on public.messages;
create policy "messages_select_members" on public.messages for select to authenticated
using (public.is_app_member() and public.is_conversation_member(conversation_id));
drop policy if exists "messages_insert_as_member" on public.messages;
create policy "messages_insert_as_member" on public.messages for insert to authenticated
with check (
  public.is_app_member()
  and sender_id = (select auth.uid())
  and public.is_conversation_member(conversation_id)
);

-- Storage bucket privado para fotos de perfil y archivos de chat.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('family-media', 'family-media', false, 26214400, array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','application/pdf'])
on conflict (id) do update set public = false;

drop policy if exists "family_media_read_profile_or_chat" on storage.objects;
create policy "family_media_read_profile_or_chat" on storage.objects for select to authenticated
using (
  bucket_id = 'family-media' and public.is_app_member() and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_conversation_member(((storage.foldername(name))[1])::uuid)
  )
);
drop policy if exists "family_media_insert_own_or_member_chat" on storage.objects;
create policy "family_media_insert_own_or_member_chat" on storage.objects for insert to authenticated
with check (
  bucket_id = 'family-media' and public.is_app_member() and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_conversation_member(((storage.foldername(name))[1])::uuid)
  )
);
drop policy if exists "family_media_delete_own_or_member_chat" on storage.objects;
create policy "family_media_delete_own_or_member_chat" on storage.objects for delete to authenticated
using (
  bucket_id = 'family-media' and public.is_app_member() and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_conversation_member(((storage.foldername(name))[1])::uuid)
  )
);

-- Realtime: agrega mensajes para recibirlos en vivo (si no están ya agregados).
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.conversations to authenticated;
grant select, insert on public.conversation_members to authenticated;
grant select, insert on public.messages to authenticated;
