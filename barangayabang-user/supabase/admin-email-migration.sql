-- Replace the one allowed admin email. Run once in Supabase SQL Editor.
begin;

delete from private.admin_allowlist;

insert into private.admin_allowlist(email)
values ('mecaellacorcotchia15@gmail.com');

commit;
