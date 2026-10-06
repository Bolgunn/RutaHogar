-- Revierte 20261005130000_restore_evaluations_staff_select.sql.
-- Esa migración solo vuelve a declarar el policy de 20261001120000, así que no
-- hay estado anterior que restaurar: el cuerpo "solo el propio usuario" que
-- reemplazó era una edición a mano que dejaba al personal sin leads. Para volver
-- más atrás, aplicar 20261001120000_evaluations_select_policy_rollback.sql.
select 1;
