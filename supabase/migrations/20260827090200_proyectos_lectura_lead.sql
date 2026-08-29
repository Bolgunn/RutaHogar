-- =============================================================
-- ScoreLeads — CATALOGO-UNICO: lectura del catálogo para el lead
-- =============================================================
-- HALLAZGO. El plan de CATALOGO-UNICO asumió que la página de simulación
-- heredaba el scoping de HU 7 «a través de getAvailableProjects()». No lo
-- hereda: la policy "Proyectos select tenant" exige
--
--     public.get_my_role() = any (array['admin', 'ejecutivo'])
--
-- y /simulacion solo se renderiza para el rol 'usuario'. Mientras los proyectos
-- vivían hardcodeados en el bundle esto no se notaba; al pasar a leerlos del
-- catálogo, el lead recibía 0 filas y la página quedaba siempre vacía contra
-- Supabase. Sin esta policy, CATALOGO-UNICO no cumple su propio criterio C4.
--
-- ALCANCE, y por qué es aceptable:
--   · Solo SELECT. El lead no puede insertar, editar ni borrar: esas policies
--     siguen exigiendo can_admin_inmobiliaria().
--   · Solo proyectos no agotados — el mismo recorte que ya hace
--     getAvailableProjects() en el cliente, ahora también en la base.
--   · El catálogo es inventario comercial (vitrina), no dato personal: no hay
--     lead, perfil ni evaluación involucrados. Es información que la
--     inmobiliaria publica para que la vean compradores.
--
-- LIMITACIÓN CONOCIDA, deliberada: un lead NO pertenece a ninguna inmobiliaria
-- (`profiles.inmobiliaria_id` es NULL para el rol 'usuario'), así que no existe
-- tenant contra el cual acotarlo y ve el catálogo no agotado de todas las
-- inmobiliarias. Hoy eso es justamente lo que la simulación quiere mostrar
-- («alternativas referenciales»). Si en algún momento el lead debe verse
-- restringido a una inmobiliaria, primero hay que darle una — y esa decisión
-- pertenece a HU 13 (matching), no a esta migración.
--
-- Idempotente: drop + create, como el resto de las policies del repo.

drop policy if exists "Proyectos select lead" on public.proyectos;
create policy "Proyectos select lead"
  on public.proyectos
  for select
  using (
    public.get_my_role() = 'usuario'
    and estado <> 'agotado'
  );
