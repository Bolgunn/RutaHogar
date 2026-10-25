-- Security correction is intentionally not downgraded to the vulnerable policy.
-- Keep the role guard, restricted direct reads and authorized projections.
begin;
do $$ begin raise notice 'Security rollback retains restrictive policies and role protection; restore service availability with a forward correction.'; end; $$;
commit;
