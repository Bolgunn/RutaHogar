-- Rollback for 20260921110000_restore_project_catalog_contract.sql.
--
-- Deliberately no-op: comuna belongs to 20260729_project_catalog.sql and
-- descripcion belongs to 20260827090000_proyectos_campos_comerciales.sql.
-- Dropping either one would roll back those earlier migrations and destroy
-- catalog data. Reverting this repair therefore means leaving the original
-- contract in place.

begin;
commit;
