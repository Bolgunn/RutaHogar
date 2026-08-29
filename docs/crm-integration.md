# Integración CRM — contrato propuesto para el catálogo de proyectos

> **Estado: documentación únicamente.** HU 7 dejó el esquema y el servicio listos para
> recibir proyectos y asignaciones desde un CRM, pero **no implementó ningún adaptador**.
> La conexión real es propiedad de **HU 4 / Spike 2 (Sprint 2)**, y ese spike puede
> revisar o reemplazar el contrato descrito aquí. Este documento es una propuesta.

## Alcance

El catálogo de proyectos (`inmobiliarias`, `proyectos`, `proyecto_ejecutivos`) es la
fuente de datos del matching lead–proyecto (HU 13). Hoy los proyectos y sus ejecutivos
se administran a mano desde `AdminProjectCatalog.jsx`. Cuando una inmobiliaria ya
mantiene su cartera en un CRM, duplicar esa carga es un costo de adopción evitable:
el CRM debería poder empujar sus proyectos y sus asignaciones de ejecutivos.

**Dirección de sincronización — fase 1: solo lectura (pull desde el CRM).** ScoreLeads
no escribe de vuelta en el CRM. Los proyectos con `source = 'crm'` se consideran
gestionados por el CRM; la edición manual sigue disponible pero puede ser sobrescrita
por la siguiente sincronización.

## Funciones propuestas

Ambas se implementarían en `frontend/src/services/projectService.js` (o en una función
Edge de Supabase, si Spike 2 decide que la ingesta debe ser server-side).

```js
// Sincroniza el catálogo de proyectos de una inmobiliaria.
syncProjectsFromCrm(payload) -> { creados, actualizados, omitidos, errores: [] }

// Sincroniza las asignaciones proyecto ↔ ejecutivo.
syncAssignmentsFromCrm(payload) -> { vinculados, pendientes, rechazados, errores: [] }
```

### Payload — proyectos

```json
{
  "inmobiliaria_id": "uuid-de-la-inmobiliaria-en-scoreleads",
  "source": "crm",
  "generated_at": "2026-07-29T14:05:00Z",
  "proyectos": [
    {
      "crm_id": "PRJ-00412",
      "nombre": "Parque Ñuñoa",
      "comuna": "Ñuñoa",
      "tipo": "departamento",
      "precio_min_uf": 4200,
      "precio_max_uf": 6800,
      "estado": "disponible"
    }
  ]
}
```

### Payload — asignaciones

```json
{
  "inmobiliaria_id": "uuid-de-la-inmobiliaria-en-scoreleads",
  "source": "crm",
  "asignaciones": [
    {
      "crm_project_id": "PRJ-00412",
      "crm_executive_id": "USR-889",
      "ejecutivo_email": "ana.soto@inmobiliaria.cl"
    }
  ]
}
```

## Mapeo de campos

### Proyecto CRM → `public.proyectos`

| Campo CRM | Columna ScoreLeads | Notas |
| :-------- | :----------------- | :---- |
| `crm_id` | — (clave de correlación) | No se persiste en HU 7. Si Spike 2 necesita idempotencia por id externo, agregar `proyectos.crm_id text` + índice único `(inmobiliaria_id, crm_id)`. |
| `nombre` | `nombre` | Único por inmobiliaria e insensible a mayúsculas (`proyectos_nombre_por_inmobiliaria_idx`). Es la clave natural de correlación mientras no exista `crm_id`. |
| `comuna` | `comuna` | Debe pertenecer a `comunasMvp` (`frontend/src/constants/comunas.js`). No se requiere que tenga entrada en `PRECIOS_REFERENCIA_UF`: el matching es *preference-independent* y nunca lee esa tabla (Spike 1 E4 §1, §2). La comuna solo se compara con la `comuna_objetivo` del lead (−15 de afinidad, nunca un gate). |
| `tipo` | `tipo` | `departamento` \| `casa`. Cualquier otro valor debe normalizarse en el adaptador; la CHECK de la tabla lo rechaza. |
| `precio_min_uf` / `precio_max_uf` | `precio_min_uf` / `precio_max_uf` | **Siempre en UF.** Si el CRM entrega CLP, el adaptador convierte antes de escribir. CHECK: ambos `> 0` y `min <= max`. Si el CRM entrega inventario por unidad, ver *Agregación de unidades* más abajo. |
| `estado` | `estado` | `disponible` \| `en_construccion` \| `agotado`. Mapear los estados del CRM ("vendido", "sold out", "entrega inmediata"…) a este enum. Solo `agotado` excluye el proyecto del matching: `en_construccion` **sí** se recomienda (venta en verde). No mapear un proyecto en obra a `agotado`. |
| — | `inmobiliaria_id` | Viene del sobre del payload, no de cada proyecto. Determina el tenant. |

### Agregación de unidades → rango de precio

Los CRM inmobiliarios normalmente manejan inventario **a nivel de unidad**
(tipologías 1D/2D/3D, deptos individuales, lotes), no un rango por proyecto.
ScoreLeads hoy modela el proyecto con un rango, así que el adaptador **colapsa las
unidades al escribir**:

```
precio_min_uf = MIN(precio_uf de las unidades vendibles)
precio_max_uf = MAX(precio_uf de las unidades vendibles)
```

Reglas:

- **"Vendibles"** = unidades que el CRM no marca como vendidas o reservadas. Una
  unidad vendida no debe bajar el `precio_min_uf`: el gate de capacidad del
  matching significa *"¿alcanza la unidad disponible más barata?"* (Spike 1 E4 §5.1),
  y contar unidades ya vendidas recomendaría un proyecto que el lead no puede comprar.
- Si **todas** las unidades están vendidas → `estado = 'agotado'` (no un rango vacío).
- Si queda **una sola** unidad vendible → `precio_min_uf == precio_max_uf`. Es válido
  y está soportado; ver la nota de división por cero en
  `docs/project-catalog-contract.md`.
- Si el proyecto mezcla casas y departamentos, `tipo` es único por proyecto: elegir
  el predominante y registrar la pérdida de información. Se resuelve con el modelo
  de unidades descrito en el contrato.
- La agregación se recalcula **en cada sync**, porque el inventario se mueve.

Cuando exista la tabla de unidades (ver *Extensiones futuras* en
`docs/project-catalog-contract.md`), esta agregación deja de hacerse en el
adaptador y pasa a derivarse en la base — el payload del CRM no cambia.

### Ejecutivo CRM → `public.proyecto_ejecutivos`

| Campo CRM | Columna ScoreLeads | Notas |
| :-------- | :----------------- | :---- |
| `ejecutivo_email` | `ejecutivo_email` | Se normaliza a minúsculas. Es la mitad de la PK `(proyecto_id, ejecutivo_email)`. |
| `crm_executive_id` | — | No se persiste en HU 7. El correo es el identificador de correlación. |
| — | `ejecutivo_id` | `NULL` mientras el ejecutivo no tenga cuenta en ScoreLeads. |
| — | `source` | **`'crm'`** para todo lo que entre por esta vía (`'manual'` para la UI de admin). Permite distinguir qué gestiona el CRM. |
| — | `estado` | `'pendiente'` si el correo no tiene cuenta de ejecutivo; `'vinculado'` si sí. |

## Flujo de la unión tolerante a pendientes

El join `proyecto_ejecutivos` fue diseñado para aceptar ejecutivos que **todavía no
existen** en ScoreLeads, que es el caso normal cuando el CRM es la fuente de verdad:

1. El CRM envía `ejecutivo_email`. El adaptador llama al RPC `assign_executive(proyecto_id, email)`
   (o inserta con `source = 'crm'` si la ingesta ocurre server-side con la service key).
2. Si **no hay** cuenta con ese correo y rol `ejecutivo`: se inserta la fila con
   `ejecutivo_id = NULL`, `estado = 'pendiente'`. El proyecto ya queda documentado
   pero **no aparece** en `getAvailableProjects()` con ese ejecutivo.
3. Si **hay** cuenta y su `profiles.inmobiliaria_id` es `NULL`: se asigna la inmobiliaria
   del proyecto y la fila queda `estado = 'vinculado'`.
4. Si la cuenta ya pertenece a **otra** inmobiliaria: se rechaza (`raise exception`).
   El adaptador debe contarlo en `rechazados`, no reintentarlo.
5. Cuando el ejecutivo pendiente crea su cuenta, `resolve_pending_executives()` — que
   se ejecuta al cargar el catálogo — encuentra la coincidencia por correo, asigna la
   inmobiliaria y pasa la fila a `'vinculado'`.

Esto significa que el CRM puede enviar su cartera completa **antes** de que el equipo
comercial se registre en ScoreLeads, sin perder información.

## Endpoint de ingesta propuesto

HU 7 no expone ningún endpoint (guardrail: no se agregan endpoints al backend FastAPI
y no se toca el contrato de `POST /score`). Lo que se propone para Spike 2:

```
POST /functions/v1/crm-sync-projects
POST /functions/v1/crm-sync-assignments
```

Funciones Edge de Supabase (mismo patrón que `notify-admin-arco`), autenticadas con un
secreto por inmobiliaria, ejecutándose con la service key para poder escribir a través
de las políticas RLS multi-tenant. Alternativa aceptable: un job que haga *pull* contra
la API del CRM en lugar de recibir *push*.

## Punto de enganche en el código

`frontend/src/services/projectService.js` decide el proveedor en una sola constante:

```js
export const PROVIDER = isSupabaseDataConfigured ? "supabase" : "local";
```

El proveedor `'crm'` **no se agrega aquí**: un CRM no reemplaza la persistencia, la
alimenta. Lo que corresponde es que el adaptador CRM escriba en las mismas tablas
`proyectos` / `proyecto_ejecutivos` y que `projectService` siga leyendo por la rama
`supabase` sin cambios. Es decir:

- **No se necesita** una tercera rama de proveedor ni una interfaz de adaptador.
- El adaptador vive fuera de `projectService` (función Edge o módulo de ingesta).
- El **contrato de retorno de `getProjects()` / `getAvailableProjects()` no cambia**;
  los proyectos de origen CRM son indistinguibles para HU 13, salvo por
  `proyecto_ejecutivos.source`.

Si aun así Spike 2 quisiera un proveedor `'crm'` de solo lectura (catálogo servido
directo desde el CRM, sin espejo en Supabase), el único cambio necesario es una rama
adicional en cada función de `projectService.js` que devuelva la misma forma congelada:

```js
{
  id, inmobiliaria_id, inmobiliaria_nombre,
  nombre, comuna,
  tipo,                         // 'departamento' | 'casa'
  precio_min_uf, precio_max_uf,
  estado,                       // 'disponible' | 'en_construccion' | 'agotado'
  ejecutivos: [ { ejecutivo_id, email, nombre, estado } ],
  created_at, updated_at
}
```

## Fuera de alcance de este documento

- Escritura de ScoreLeads hacia el CRM (leads calificados, resultados de matching).
  Eso es HU 5 / HU 4 y no toca el catálogo.
- Credenciales, rotación de secretos y contratos concretos por proveedor de CRM.
- Cualquier consulta de datos financieros externos: requiere consentimiento explícito
  y alcance aprobado (guardrail #9).
