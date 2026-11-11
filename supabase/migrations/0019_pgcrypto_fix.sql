-- ═══════════════════════════════════════════════════════════════
-- 0019 · pgcrypto search_path fix
--
-- On Supabase pgcrypto lives in the `extensions` schema, but every
-- SECURITY DEFINER function pins `search_path = public`. As a result
-- digest() was invisible and verify_payment() failed with:
--   function digest(text, unknown) does not exist
--
-- Two layers of fix:
--   1. thin public wrappers for the pgcrypto helpers we use
--   2. add `extensions` to the search_path of the hashing function
-- ═══════════════════════════════════════════════════════════════

create or replace function public.digest(data text, type text)
returns bytea
language sql
immutable
as $$ select extensions.digest($1, $2) $$;

create or replace function public.digest(data bytea, type text)
returns bytea
language sql
immutable
as $$ select extensions.digest($1, $2) $$;

create or replace function public.gen_random_bytes(n int)
returns bytea
language sql
volatile
as $$ select extensions.gen_random_bytes($1) $$;

do $$
declare
  s text;
begin
  for s in
    select p.oid::regprocedure::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('ledger_hash', 'ledger_append', 'verify_ledger')
  loop
    execute format('alter function %s set search_path = public, extensions', s);
  end loop;
end $$;
