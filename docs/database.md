# La base de datos: RLS, migraciones y las dos fuentes de verdad

Supabase es **el** almacén de datos, no uno opcional (handbook, "Where things live"). Este documento
cubre lo que no se puede leer del SQL de un vistazo: por qué hay dos archivos que definen las mismas
policies, qué reglas gobiernan a las funciones helper, y cómo se aplica un cambio.

El esquema en sí no se documenta acá — vive en `supabase/schema.sql` y no tiene sentido copiarlo.

---

## Las dos fuentes de verdad, y cómo se separan

| Archivo | Qué es | Quién lo corre |
| :------ | :----- | :------------- |
| `supabase/schema.sql` | Snapshot de bootstrap. Su cabecera: *"ejecutar en Supabase SQL Editor o como migración inicial"*. Crea tablas, funciones y policies desde cero | Un entorno nuevo, una sola vez |
| `supabase/migrations/*.sql` | Cambios incrementales, en orden de nombre | El Supabase hosteado, acumulativamente |
| `supabase/rollback/*.sql` | Deshace una migración concreta, restaurando el estado anterior | A mano, si hay que revertir |

**El mismo objeto está definido en los dos primeros.** Las policies usan `drop policy if exists` +
`create policy`, así que una migración que reescribe `"Proyectos select tenant"` deja `schema.sql`
declarando la versión vieja del **mismo nombre**. Nadie falla: el entorno hosteado queda con una
definición y un entorno recién levantado con otra.

**Esto ya pasó, y se mide.** Objetos que una migración declara y `schema.sql` no refleja:

| Migración | Objeto que falta en `schema.sql` |
| :-------- | :------------------------------- |
| `20260604_corrective_audit.sql` | policy `Evaluations update own` |
| `20260611_scoring_history_staff_select.sql` | policy `Scoring history select staff` |
| `20260731_executive_accounts.sql` | función `public.find_user_id_by_email` |
| `20260807000000_scoring_events.sql` | policy `Scoring history update own` |
| `20260827090200_proyectos_lectura_lead.sql` | policy `Proyectos select lead` |

Un entorno levantado hoy desde `schema.sql` **no tiene esas cinco cosas**. La más visible es la
última: los leads no podrían leer el catálogo de proyectos.

> **Regla.** Una migración que crea o reescribe una policy o una función **también la escribe en
> `schema.sql`**, en el mismo commit. Es la única forma de que las dos rutas converjan.

La deriva es difícil de ver porque el frontend suele filtrar lo mismo por su cuenta — por ejemplo
`filterAssignedTo()` recorta el catálogo en el cliente además de la policy. El síntoma queda tapado
y sólo aparece a nivel de API.

**Cómo comprobarlo**, sin depender de leerlo a ojo:

```bash
node scripts/check-schema-drift.js
```

Extrae los cuerpos de policy y de función de cada migración y de `schema.sql`, descarta comentarios y
espacios, y compara. Compara sólo la **última** definición de cada objeto: las migraciones se pisan
entre sí, y una policy reescrita tres veces sólo tiene que coincidir en su versión viva. Sale con
código 1 si algo está fuera de sincronía, y avisa (sin abortar) de las migraciones sin rollback.

**No está en CI** — ningún workflow lo corre. Se ejecuta a mano al escribir una migración.

Al día de hoy reporta **11 objetos fuera de sincronía**: los 5 ausentes de la tabla de arriba y 6
divergencias heredadas en `improvement_goals`, `evaluations` y `profiles`. Ninguno es de HU 10;
`20260831090000` está sincronizada. Cerrarlos es una pasada de reconciliación propia, no de esta
historia.

---

## Reglas para funciones helper

Las policies se apoyan en funciones (`public.get_my_role()`, `get_my_inmobiliaria()`,
`get_my_email()`, `is_ejecutivo_asignado()`, `get_proyecto_inmobiliaria()`,
`can_admin_inmobiliaria()`, `is_global_admin()`). Todas comparten dos propiedades, y ninguna es
decorativa.

### 1. `SECURITY DEFINER`, siempre

Una policy consultando la tabla que la policy protege **recursa**. `get_my_role()` lee `profiles`, y
`profiles` tiene policies; sin `security definer` la evaluación se muerde la cola. Es literalmente
por lo que existe `20260605_fix_rls_infinite_recursion.sql`.

Van además con `set search_path = public`, para que un `search_path` manipulado no las redirija —
que es la contraparte obligatoria de `security definer`.

### 2. Nunca leer `auth.users` desde el `USING` de una policy

**El `USING` de una policy se evalúa con los privilegios de quien consulta**, no del dueño de la
tabla. Supabase no le da `SELECT` sobre `auth.users` al rol `authenticated`, así que un subselect
inline no devuelve `null` ni `false`:

```
ERROR: permission denied for table users
```

…y **tumba el `SELECT` entero**, para todos los usuarios de ese rol. Es un modo de falla ruidoso pero
invisible en desarrollo, porque la RLS no se ejecuta con el proveedor `local`.

El correo se lee por `public.get_my_email()`, que es `security definer` y por lo tanto sí puede.
Cualquier dato de `auth.users` que una policy necesite pasa por una función así.

---

## El modelo de acceso

Tres roles, en `profiles.role`: `usuario` (el lead), `ejecutivo` (comercial) y `admin`. Un `admin`
con `inmobiliaria_id` en `NULL` es **admin global** y ve todos los tenants.

| Tabla | `usuario` | `ejecutivo` | `admin` |
| :---- | :-------- | :---------- | :------ |
| `profiles` | lo suyo | lo suyo | los ejecutivos de su inmobiliaria |
| `evaluations` | las suyas | **todas** ⚠️ | **todas** ⚠️ |
| `improvement_goals` | las suyas | — | — |
| `scoring_history` | lo suyo | lectura de staff | lectura de staff |
| `arco_requests` | las suyas | — | sólo admin global |
| `inmobiliarias` | — | la suya | la suya, o todas si es global |
| `proyectos` | catálogo publicado | **sólo donde está asignado** | los de su inmobiliaria |
| `proyecto_ejecutivos` | — | **sólo sus asignaciones, dentro de su tenant** | las de su inmobiliaria |

⚠️ **`evaluations` no está acotada por tenant.** La tabla no tiene `inmobiliaria_id` y cualquier
`ejecutivo`/`admin` lee todas las evaluaciones. Es un hueco conocido contra la salvaguarda **S6**,
anterior a HU 10 y todavía abierto: cerrarlo necesita una decisión de producto sobre qué significa la
inmobiliaria de un lead que llegó por tráfico público de precalificación.

### Proyectos: el vínculo se volvió vinculante (HU 10)

HU 7 creó `proyecto_ejecutivos` para registrar quién atiende qué proyecto, pero la policy de lectura
nunca la miró: bastaba ser `ejecutivo` del tenant. El vínculo era **decorativo para la lectura**.

`20260831090000_proyectos_scope_ejecutivo.sql` lo vuelve vinculante, porque el panel de HU 10 pone un
selector de proyecto y sin esto un ejecutivo rankearía leads contra el proyecto de un colega. Después
de aplicarla:

- **admin** — sin cambios, catálogo completo de su tenant (o de todos, si es global).
- **ejecutivo** — sólo los proyectos donde está asignado, y sólo sus propias asignaciones.
- **usuario** — sin cambios; `"Proyectos select lead"` sigue vigente aparte.

Dos detalles cargan peso:

**El vínculo se reconoce por `ejecutivo_id` O por correo.** Una asignación recién creada queda
`pendiente` con `ejecutivo_id` en `NULL` hasta que corre `resolve_pending_executives()`. Sin la rama
del correo, un ejecutivo recién asignado no vería su propio proyecto hasta la siguiente resolución.
`filterAssignedTo()` (`frontend/src/services/projectValidation.js`) replica **el mismo predicado** en
el cliente — tiene que ser el mismo, o el frontend escondería proyectos que la base sí autoriza.

**El gate de tenant en `proyecto_ejecutivos` no es redundante** con el predicado de identidad. Sin él,
un admin de otra inmobiliaria crea una asignación `pendiente` tecleando un correo — la cuenta ni
siquiera tiene que existir — y el dueño de ese correo pasaría a leer esa fila, con el `proyecto_id`
de un tenant ajeno. Una migración de scoping sólo debe **estrechar** lecturas, nunca abrirlas.

---

## Aplicar un cambio

1. **Escribir la migración** en `supabase/migrations/AAAAMMDDHHMMSS_<slug>.sql`. Idempotente:
   `drop policy if exists` + `create policy`, `create or replace function`. Correrla dos veces no
   puede hacer daño.
2. **Escribir el rollback** en `supabase/rollback/<mismo-nombre>_rollback.sql`, restaurando el estado
   anterior — incluido borrar las funciones que la migración creó, si nada más las usa.
3. **Reflejarla en `schema.sql`**, en el mismo commit. Ver la regla de arriba.
4. **Responder la pregunta estándar 3 del plan** de la historia (*"¿Necesita migración? ¿Quién la
   aplica al Supabase hosteado?"*) con el alcance real. El handbook la da por contrastada contra el
   diff *(planned)* — **hoy nadie la contrasta**: el único workflow del repo es
   `deploy-supabase-functions.yml`, que despliega edge functions y no mira migraciones. Es una
   revisión humana hasta que ese gate exista.
5. **Aplicarla a mano** al Supabase hosteado. No hay runner automático ni CI que la ejecute: la corre
   quien mergea el PR, y deja constancia en el hilo.

Sólo 4 de las 15 migraciones tienen rollback. Las nuevas lo traen; las viejas son deuda.

---

## Lo que no se puede verificar en local

La RLS **no se ejecuta** con el proveedor `local` (sin Supabase configurada, los servicios caen a
`localStorage`, que no tiene policies). Los tests de `filterAssignedTo` cubren el **espejo del
cliente**, nunca la policy.

Todo cambio de RLS se verifica en un entorno hosteado, con una cuenta de cada rol involucrado. Para
`20260831090000`, con una cuenta de ejecutivo real:

1. El selector de proyectos lista **sólo** los asignados a esa cuenta.
2. Un ejecutivo con asignación `pendiente` — sin `ejecutivo_id` todavía — **sí** ve su proyecto (es
   la rama del correo).
3. Leer sus asignaciones **no** devuelve error (es la trampa de `auth.users` de arriba).
