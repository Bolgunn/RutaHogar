-- Never restore the legacy predicate that exposes aliases/partial snapshots.
-- A safe rollback disables direct raw reads; backend projections still work.
begin;
revoke select on public.evaluations,public.scoring_history from authenticated,anon;
commit;
