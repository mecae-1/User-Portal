-- Barangay Abang development schema.
-- Run in Supabase Dashboard > SQL Editor on the DEVELOPMENT project only.
-- The allowlisted admin address below is development-only and must be replaced for production.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table if not exists private.admin_allowlist (
  email text primary key check (email = lower(email))
);
revoke all on private.admin_allowlist from public, anon, authenticated;
delete from private.admin_allowlist;
insert into private.admin_allowlist(email)
values ('mecaellacorcotchia15@gmail.com')
on conflict (email) do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.admin_allowlist a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  username text not null default '',
  avatar_path text,
  announcement_email_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles add column if not exists avatar_path text;
create unique index if not exists profiles_username_case_insensitive_unique
  on public.profiles (lower(username)) where username <> '';

create table if not exists public.document_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  document_type text not null,
  purpose text not null,
  details text,
  status text not null default 'Pending' check (status in ('Pending','Processing','Approved','Completed','Rejected')),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null,
  details text not null,
  status text not null default 'Open' check (status in ('Open','In Progress','Resolved','Closed')),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  kind text not null default 'Announcement' check (kind in ('Announcement','Event')),
  published boolean not null default false,
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null,
  event_type text not null,
  record_id uuid,
  send_status text not null default 'queued' check (send_status in ('queued','sent','failed')),
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists document_requests_user_created_idx on public.document_requests(user_id, created_at desc);
create index if not exists complaints_user_created_idx on public.complaints(user_id, created_at desc);
create index if not exists announcements_published_idx on public.announcements(published, published_at desc);

-- Create a profile whenever Auth creates an account. Client-supplied role fields are ignored.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(id, email, full_name, username, announcement_email_opt_in)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'username', ''),
    coalesce((new.raw_user_meta_data ->> 'announcement_email_opt_in')::boolean, false)
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function private.handle_new_user();

-- Users may create requests, but only admins can change their status or notes.
create or replace function private.guard_user_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    if tg_op = 'INSERT' then
      new.user_id := auth.uid();
      new.status := case when tg_table_name = 'complaints' then 'Open' else 'Pending' end;
      new.admin_notes := null;
    else
      raise exception 'Only an admin may edit submitted records';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists guard_document_request on public.document_requests;
create trigger guard_document_request before insert or update on public.document_requests
for each row execute function private.guard_user_submission();
drop trigger if exists guard_complaint on public.complaints;
create trigger guard_complaint before insert or update on public.complaints
for each row execute function private.guard_user_submission();

alter table public.profiles enable row level security;
alter table public.document_requests enable row level security;
alter table public.complaints enable row level security;
alter table public.announcements enable row level security;
alter table public.notification_log enable row level security;

revoke all on public.profiles, public.document_requests, public.complaints, public.announcements, public.notification_log from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, username, announcement_email_opt_in) on public.profiles to authenticated;
grant update (avatar_path) on public.profiles to authenticated;
grant select, insert, update on public.document_requests to authenticated;
grant select, insert, update on public.complaints to authenticated;
grant select on public.announcements to anon, authenticated;
grant insert, update, delete on public.announcements to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Profiles: users can read/edit their own allowed fields; the allowlisted admin can manage all profiles.
drop policy if exists profiles_read_self_or_admin on public.profiles;
create policy profiles_read_self_or_admin on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin on public.profiles for update to authenticated
using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- Private profile photo storage. Each authenticated user can read and replace only their own avatar.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists avatars_read_own on storage.objects;
create policy avatars_read_own on storage.objects for select to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects for update to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Document and complaint records are private to their owner and the admin.
drop policy if exists document_requests_read_owner_admin on public.document_requests;
create policy document_requests_read_owner_admin on public.document_requests for select to authenticated
using (user_id = auth.uid() or public.is_admin());
drop policy if exists document_requests_submit_owner on public.document_requests;
create policy document_requests_submit_owner on public.document_requests for insert to authenticated
with check (user_id = auth.uid() or public.is_admin());
drop policy if exists document_requests_update_admin on public.document_requests;
create policy document_requests_update_admin on public.document_requests for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists complaints_read_owner_admin on public.complaints;
create policy complaints_read_owner_admin on public.complaints for select to authenticated
using (user_id = auth.uid() or public.is_admin());
drop policy if exists complaints_submit_owner on public.complaints;
create policy complaints_submit_owner on public.complaints for insert to authenticated
with check (user_id = auth.uid() or public.is_admin());
drop policy if exists complaints_update_admin on public.complaints;
create policy complaints_update_admin on public.complaints for update to authenticated
using (public.is_admin()) with check (public.is_admin());

-- Public pages can see published announcements; only the allowlisted admin can manage them.
drop policy if exists announcements_read_published on public.announcements;
create policy announcements_read_published on public.announcements for select to anon, authenticated
using (published = true or (auth.uid() is not null and public.is_admin()));
drop policy if exists announcements_insert_admin on public.announcements;
create policy announcements_insert_admin on public.announcements for insert to authenticated
with check (public.is_admin());
drop policy if exists announcements_update_admin on public.announcements;
create policy announcements_update_admin on public.announcements for update to authenticated
using (public.is_admin()) with check (public.is_admin());
drop policy if exists announcements_delete_admin on public.announcements;
create policy announcements_delete_admin on public.announcements for delete to authenticated
using (public.is_admin());

-- Email logs are server-only: no client grants or client RLS policies are provided.

insert into public.announcements(title, body, kind, published, published_at)
select 'Barangay Assembly Meeting', 'All residents are invited to attend the barangay assembly meeting at the Barangay Hall.', 'Announcement', true, now()
where not exists (select 1 from public.announcements where title = 'Barangay Assembly Meeting');
insert into public.announcements(title, body, kind, published, published_at)
select 'Community Clean-up Drive', 'Join your neighbors for the community clean-up. Contact the Barangay Hall for details.', 'Event', true, now()
where not exists (select 1 from public.announcements where title = 'Community Clean-up Drive');

commit;
