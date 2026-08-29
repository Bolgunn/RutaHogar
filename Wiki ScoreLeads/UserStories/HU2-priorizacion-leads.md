# HU 2 - Priorización de leads calificados

> **⚠️ Parcial - PMV.** Entrega al ejecutivo comercial una vista priorizada y asistida por IA de los leads precalificados. En vez de una lista cruda de contactos, el ejecutivo ve a quien llamar primero, por que, y que acción tomar.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Compleja |
| **Puntos de Historia** | 5 |
| **Actor** | Ejecutivo comercial |
| **Sprint** | PMV |
| **Estado** | ⚠️ Parcial |

---

## Historia de usuario

> **Como** ejecutivo comercial inmobiliario, **quiero** visualizar una cartera de leads precalificados y priorizados con apoyo de IA, **para** concentrar mi tiempo en los prospectos con mayor probabilidad de avanzar en el proceso de compra y entender rápidamente el contexto financiero de cada lead.

---

## Criterios de aceptación

### E1 - Priorización de leads con score alto

**Dado** que el sistema ha procesado el scoring financiero de múltiples prospectos, **cuando** el ejecutivo comercial accede al panel principal, **entonces** los leads con clasificación "Alto" deben aparecer automáticamente al inicio de la lista.

### E2 - Indicadores visuales y explicación inteligente

**Dado** que un lead tiene un score asignado, **cuando** el ejecutivo selecciona un lead específico, **entonces** el sistema debe mostrar un resumen visual de los indicadores (carga financiera, estabilidad, etc.) y la explicación inteligente generada para justificar ese score.

### E3 - Filtro por nivel de prioridad

**Dado** que el ejecutivo necesita organizar su día, **cuando** usa la herramienta de filtro, **entonces** el sistema debe permitir segmentar la vista por categorías Alto, Medio o Bajo de forma inmediata.

### E4 - Acción comercial sugerida

**Dado** que el ejecutivo revisa el perfil de un lead priorizado, **cuando** visualiza el detalle del scoring, **entonces** el sistema debe desplegar una etiqueta de acción sugerida (por ejemplo "Contactar de inmediato", "Mantener en seguimiento" o "Solicitar más información") según el nivel de preparación del lead.

---

## Notas

- Esta historia evita deliberadamente la integración con CRM (eso es [[HU12-derivacion-comercial|HU 12]]). El dashboard es autocontenido.
- El resumen asistido por IA de E2 lo genera la misma capa de explicación que [[HU3-scoring-hibrido|HU 3]]; no se requiere un modelo aparte.
- El rol de ejecutivo se aplica a nivel de routing: solo usuarios con rol `sales` acceden al dashboard de leads.
- La versión móvil de este dashboard se documenta como [[../RNF/RNF7-dashboard-movil-ejecutivo|RNF 7]].

---

## Estado frente al código

Verificación criterio por criterio contra el código entregado. ✅ implementado · ⚠️ parcial · ❌ no implementado.

| Criterio | Estado | Evidencia |
| :------- | :----- | :-------- |
| `E1` | ✅ | `frontend/src/components/DashboardLeads.jsx:91` fija `Alto` como filtro por defecto del panel, de modo que el ejecutivo entra viendo los leads Alto. |
| `E2` | ✅ | El resumen de indicadores y la explicación se renderizan desde la misma capa que HU 3; ver `AiExplanationBlock.jsx`. |
| `E3` | ✅ | `DashboardLeads.jsx:216` filtra por clasificación, comuna, edad y fecha; los conteos por categoría se calculan en `DashboardLeads.jsx:208`. |
| `E4` | ⚠️ | No se encontró una etiqueta de acción comercial sugerida ("Contactar de inmediato", "Mantener en seguimiento") en `DashboardLeads.jsx`. La priorización existe; la recomendación de acción explícita, no. |

> Esta tabla se revisa cuando cambia el código de la historia. Un criterio sin evidencia citable
> es un criterio no verificado, no un criterio cumplido.

---

## Notas de implementación

Registro técnico de lo ya construido para esta historia.

### Notificación de leads Alto al ejecutivo

Cuando un usuario completa una preevaluación y obtiene clasificación **Alto**, el sistema notifica al ejecutivo comercial en tiempo real mediante un toast en la esquina inferior derecha de la pantalla.


### Comportamiento

#### Al iniciar sesión (carga inicial)

Al autenticarse, el ejecutivo recibe un conteo de leads Alto que aún no ha visto. Un lead se considera "no visto" si:

- `profiles.last_lead_seen_at` del ejecutivo es `null` (primera vez) → **todos** los leads Alto cuentan.
- `profiles.last_lead_seen_at` tiene un valor → solo cuentan los leads con `evaluations.created_at > last_lead_seen_at`.

Los leads creados por el propio ejecutivo son excluidos del conteo (`ev.user_id !== userId`).

#### En tiempo real (sesión activa)

Mientras el ejecutivo tiene la sesión abierta, el sistema escucha eventos `INSERT` en la tabla `evaluations` vía Supabase Realtime. Cada nuevo lead con `classification === 'Alto'` incrementa el contador sin necesidad de recargar la página.

El DashboardLeads también se actualiza automáticamente: la nueva fila aparece en la tabla al instante. Los datos del evento Realtime se normalizan con `normalizeEvaluation` antes de agregarse al estado.


### Marcar leads como vistos

#### Navegando a `/leads`

Cuando el ejecutivo navega a la página de leads, un `useEffect` en `App.jsx` llama automáticamente a `markLeadsSeen()`:

```js
useEffect(() => {
  if (page === "leads" && profile?.role === roles.sales) markLeadsSeen();
}, [page]);
```

#### Cerrando el toast (botón ×)

`handleDismissNotification` también llama a `markLeadsSeen()` — el ejecutivo puede descartar sin navegar y la notificación no vuelve a aparecer.

#### `markLeadsSeen()` internamente

1. Resetea `newHighLeadsCount` a 0 (toast desaparece).
2. Llama a `updateLastLeadSeenAt(userId)` — escribe `now()` en `profiles.last_lead_seen_at` en Supabase.
3. Llama a `updateStoredProfile({ ...profile, last_lead_seen_at: ... })` — sincroniza el perfil en `localStorage` para que la próxima carga use el timestamp correcto sin un fetch extra.

El estado de "visto" es persistente entre dispositivos y sesiones gracias a Supabase.


### Componentes involucrados

| Archivo | Responsabilidad |
| :------ | :-------------- |
| `hooks/useLeads.js` | Carga inicial, suscripción realtime, conteo, `markLeadsSeen`, `dismissToastLocally` |
| `components/NotificationToast.jsx` | Toast visual — renders `null` si `count <= 0` |
| `services/profileService.js` | `updateLastLeadSeenAt(userId)` — escribe en Supabase |
| `services/auth.js` | `updateStoredProfile(profile)` — sincroniza localStorage |
| `App.jsx` | `useEffect([page])` que llama `markLeadsSeen()` al entrar a `/leads`; `handleDismissNotification` |


### Configuración requerida en Supabase

Para que los eventos de Realtime funcionen, la tabla `evaluations` debe estar correctamente configurada:

```sql
-- Necesario para RLS + Realtime: incluye la fila completa en los eventos de cambio
alter table public.evaluations replica identity full;

-- Agrega la tabla a la publicación que escucha el servicio de Realtime
alter publication supabase_realtime add table public.evaluations;
```

Estos comandos están incluidos en `supabase/schema.sql`. Si se despliega desde cero, se aplican automáticamente. Si la base de datos ya existía antes de esta configuración, deben ejecutarse manualmente en el SQL Editor de Supabase.


### Campo `last_lead_seen_at` en `profiles`

Columna agregada para persistir el estado de notificación por usuario ejecutivo.

| Campo | Tipo | Nullable | Descripción |
| :---- | :--- | :------- | :---------- |
| `last_lead_seen_at` | `timestamptz` | YES | Timestamp de la última vez que el ejecutivo visitó `/leads` o descartó el toast. Null = nunca ha visto leads. |

Migración para instancias existentes:

```sql
alter table public.profiles
add column if not exists last_lead_seen_at timestamptz;
```


### Campo `created_at` en `evaluations`

El campo `created_at` es crítico para el filtrado de leads nuevos. El cliente lo establece explícitamente en `buildRow()` (`evaluationService.js`) para garantizar que siempre tenga valor, independientemente del `DEFAULT` de la base de datos.

Si existen registros con `created_at = null` (evaluaciones anteriores a esta implementación), ejecutar:

```sql
update public.evaluations
set created_at = now()
where created_at is null;
```


### Notas

- La suscripción realtime solo se activa para usuarios con rol `sales` o `admin` (`isStaff`).
- `dismissToastLocally()` existe para resetear el contador solo en memoria (sin llamada a Supabase). Útil si se necesita limpiar el toast sin marcar los leads como vistos permanentemente.
- Si el ejecutivo está en `/leads` cuando llega un lead nuevo, el DashboardLeads lo muestra automáticamente y el toast también aparece brevemente. El `useEffect([page])` limpiará el conteo inmediatamente al entrar a `/leads`.

### Badges de conteo en el filtro del DashboardLeads

El selector de filtro en `DashboardLeads.jsx` muestra el número de leads por cada categoría junto al nombre de la clasificación.


### Comportamiento

El dropdown de filtro muestra:

```
Todos (12)
Alto (5)
Medio (4)
Bajo (3)
```

Los conteos se recalculan con `useMemo` cada vez que cambia la lista de evaluaciones. Como `evaluations` se actualiza en tiempo real a través de `useLeads`, los badges reflejan el estado actual sin necesidad de recargar.


### Implementación

Los conteos se calculan localmente en `DashboardLeads.jsx` con un `useMemo`:

```js
const counts = useMemo(() => {
  const c = { Alto: 0, Medio: 0, Bajo: 0 };
  evaluations.forEach((item) => {
    if (c[item.result.classification] !== undefined) c[item.result.classification]++;
  });
  return c;
}, [evaluations]);
```

El total (`Todos`) usa directamente `evaluations.length`.


### Archivos involucrados

| Archivo | Cambio |
| :------ | :----- |
| `frontend/src/components/DashboardLeads.jsx` | `useMemo` de conteos + badges en las opciones del `<select>` |

### Visibilidad de evaluaciones para staff

Los usuarios con rol `sales` o `admin` pueden ver **todas** las evaluaciones del sistema, no solo las propias. Esta distinción se maneja en `evaluationService.js` y en el hook `useLeads`.


### Comportamiento

| Rol | Evaluaciones cargadas |
| :-- | :-------------------- |
| `user` | Solo las propias (filtro `user_id = userId`) |
| `sales` / `admin` | Todas (sin filtro de usuario) |

El filtro se aplica tanto en modo local (evaluaciones en `localStorage`) como en Supabase.


### Campo `email` en evaluaciones

Se agregó el campo `email` a la fila de evaluación para facilitar la identificación del lead en el DashboardLeads. Antes solo estaba disponible `user_id` (UUID), lo que dificultaba reconocer al lead sin consultar la tabla `profiles`.

El campo se completa con `profile.email` al crear la evaluación.

#### Schema

```sql
-- Columna agregada a public.evaluations
email text
```

La migración está incluida en `supabase/migrations/`. Si la base de datos ya existía:

```sql
alter table public.evaluations add column if not exists email text;
```


### Validación UUID en evaluationService

Se agregó un helper `isUUID(id)` que valida si el `userId` pasado a `getEvaluations` / `createEvaluation` es un UUID v4 válido. Esto evita que un email o string arbitrario sea enviado como filtro a Supabase, lo que causaba errores de tipo en la query.

- Si `userId` es UUID válido → se filtra por él.
- Si `userId` es `null` (staff) → sin filtro.
- Si `userId` no es UUID (email, string local) → se usa el usuario autenticado de Supabase.


### `created_at` explícito en `buildRow`

Se agregó `created_at: new Date().toISOString()` en `buildRow()` para garantizar que cada evaluación tenga siempre un timestamp al crearse. Esto es crítico para el filtrado de leads nuevos en `useLeads`: sin `created_at`, la comparación `ev.created_at > lastSeenAt` falla silenciosamente.


### Archivos involucrados

| Archivo | Cambio |
| :------ | :----- |
| `frontend/src/services/evaluationService.js` | Campo `email` en `buildRow` y `evaluationSelectColumns`; `getEvaluations` sin filtro para staff; helper `isUUID` |
| `frontend/src/hooks/useLeads.js` | Pasa `null` como `filterId` cuando `isStaff` es true |
| `frontend/src/App.jsx` | Pasa `isUUID(userId) ? userId : null` a `createEvaluation` |
