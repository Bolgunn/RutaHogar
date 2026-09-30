-- =============================================================
-- ScoreLeads — CATALOGO-UNICO-HU9: favoritos de proyectos del lead
-- =============================================================
-- El catálogo de HU 9 guardaba los favoritos en localStorage, con los ids del
-- mock del backend ("proj-1" … "proj-5"). Al pasar a leer el catálogo real
-- (HU 7) los ids son UUID, así que todo favorito almacenado quedó huérfano.
-- Ya que el dato se rompe de todas formas, se rompe una sola vez hacia una
-- tabla real: sobrevive al logout y al cambio de navegador.
--
-- MODELO. PK compuesta (usuario_id, proyecto_id) y sin flag `activo`: el toggle
-- es insert-or-delete, idempotente y sin read-modify-write. Guardar el historial
-- de «lo consideré y lo descarté» es señal comercial interesante, pero es
-- analítica y cambia la postura de RLS — queda fuera.
--
-- CASCADE en ambos lados: borrar un perfil o un proyecto no puede dejar filas
-- huérfanas. Ese es exactamente el problema que se está eliminando.
--
-- PRIVACIDAD. Esto NO es inventario comercial: vincula una persona con las
-- propiedades que le interesan, o sea dato de comportamiento del lead. Es
-- owner-only en la base y no se expone a 'ejecutivo' ni a 'admin'. Si algún día
-- se expone al lado comercial, es una pregunta de consentimiento y el flujo
-- ARCO (20260608_arco_requests.sql) tiene que dar cuenta de esta tabla.
--
-- RLS. Solo auth.uid(). Un lead no pertenece a ninguna inmobiliaria
-- (profiles.inmobiliaria_id es NULL para el rol 'usuario'), así que no hay
-- tenant contra el cual acotar — pero el dueño siempre está definido. Sin
-- funciones helper y sin SECURITY DEFINER: 20260604_corrective_audit.sql y
-- 20260605_fix_rls_infinite_recursion.sql están en este repo como evidencia de
-- lo que cuesta la RLS ingeniosa.
--
-- Idempotente: create table if not exists + drop/create de policies.

begin;

create table if not exists public.proyecto_favoritos (
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (usuario_id, proyecto_id)
);

create index if not exists proyecto_favoritos_usuario_idx
  on public.proyecto_favoritos (usuario_id);

alter table public.proyecto_favoritos enable row level security;

drop policy if exists "Proyecto favoritos select propio" on public.proyecto_favoritos;
create policy "Proyecto favoritos select propio"
  on public.proyecto_favoritos
  for select
  using (usuario_id = auth.uid());

drop policy if exists "Proyecto favoritos insert propio" on public.proyecto_favoritos;
create policy "Proyecto favoritos insert propio"
  on public.proyecto_favoritos
  for insert
  with check (usuario_id = auth.uid());

drop policy if exists "Proyecto favoritos delete propio" on public.proyecto_favoritos;
create policy "Proyecto favoritos delete propio"
  on public.proyecto_favoritos
  for delete
  using (usuario_id = auth.uid());

-- Sin policy de UPDATE: el toggle es insert o delete. Una fila de favorito no
-- tiene nada que actualizar.

commit;
