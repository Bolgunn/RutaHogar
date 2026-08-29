# Contrato del catálogo de proyectos (HU 7)

Contrato congelado que expone [[HU7-ProjectCatalog|HU 7]] y consume
[[HU13-LeadProjectMatching|HU 13]] (matching lead–proyecto).

- **Implementación:** `frontend/src/services/projectService.js` (copia del contrato en el encabezado del archivo).
- **Lógica pura:** `frontend/src/services/projectValidation.js` — cubierta por `frontend/src/services/__tests__/projectCatalog.test.js`.
- **Criterios de matching:** `Wiki ScoreLeads/research/spike1-e4-lead-project-matching-criteria.md` (Spike 1 · E4). Ese documento es normativo para el matching; este lo es para el catálogo.

> Este archivo es la fuente de verdad del contrato. El plan de la historia vive en
> `docs/stories/HU 7/PLAN.md` y lo referencia sin repetirlo, para que ambos no puedan
> contradecirse.

---

## Forma que devuelven `getProjects` y `getAvailableProjects`

```js
{
  id, inmobiliaria_id, inmobiliaria_nombre,
  nombre, comuna,
  tipo,                        // 'departamento' | 'casa'
  precio_min_uf, precio_max_uf,
  estado,                      // 'disponible' | 'en_construccion' | 'agotado'
  descripcion,                 // opcional · texto de vitrina, null si no se cargó
  entrega_estimada,            // opcional · 'YYYY-MM', null si no se comprometió
  ejecutivos: [
    { ejecutivo_id, email, nombre, estado, source }
    // estado: 'vinculado' | 'pendiente'   ·   source: 'manual' | 'crm'
  ],
  created_at, updated_at
}
```

`getProjects({ inmobiliariaId })` respeta el tenant del admin (RLS lo garantiza);
el admin global puede pedir una inmobiliaria concreta o todas.
`getAvailableProjects()` es el feed del matching.

**Cambiar un nombre de campo rompe una especificación ya congelada** (Spike 1 E4 §8.4).

### Enmienda aditiva — campos comerciales (CATALOGO-UNICO)

`descripcion` y `entrega_estimada` se agregaron cuando la página de simulación
dejó de leer su propio arreglo hardcodeado (`frontend/src/data/mockProjects.js`,
ya eliminado) y pasó a leer este catálogo. Sin ellos, dos datos que el usuario
final ya veía se habrían perdido en la consolidación. Ver
`docs/stories/CATALOGO-UNICO/PLAN.md`.

Es una enmienda **aditiva**: ningún campo previo cambió de nombre ni de tipo, así
que HU 13 se especifica igual con o sin ella.

- Ambos son **opcionales** y llegan `null` en toda fila anterior a la migración
  `supabase/migrations/20260827090000_proyectos_campos_comerciales.sql`. No hay
  backfill: la UI no renderiza nada cuando faltan. **Nunca asumir que existen.**
- `entrega_estimada` es `text` con formato `'YYYY-MM'`, no `date`: la entrega se
  cotiza por mes y un `date` obligaría a inventar un día que nadie declaró. El
  formato está garantizado por un `check` en la base y validado en
  `projectValidation.js`.
- `descripcion` es texto de vitrina, tope 500 caracteres. No participa en ninguna
  decisión.
- **Ninguno de los dos es señal de afinidad.** En particular, cruzar
  `entrega_estimada` con el `plazo_compra` del lead sería una regla nueva del
  matching, con su propia fila de penalización y una redistribución del
  presupuesto de 100 puntos: es una decisión de diseño de HU 13, no un efecto
  secundario de esta migración.

---

## Notas para el consumidor

### 1. Estado: solo `agotado` queda fuera del feed

`getAvailableProjects()` excluye únicamente `agotado` — que es literalmente lo que
pide HU 7 E4 — y recorta `ejecutivos` a los `vinculado`.

`en_construccion` **sí se recomienda**: la venta en verde es una parte real del
mercado chileno y excluirla escondería inventario que se está vendiendo hoy.
Además, Spike 1 E4 §5.1 solo autoriza dos filtros excluyentes (capacidad y
bloqueador crítico); `estado` no es uno de ellos, así que viaja hacia HU 13 en
vez de filtrarse aquí en silencio. HU 13 puede mostrarlo o ponderarlo.

### 2. `precio_min_uf == precio_max_uf` es válido

Un proyecto de precio único es legítimo y la validación lo acepta.

El scorer de holgura (§5.2) es *"lineal sobre la posición de la capacidad dentro
de `[precio_min_uf, precio_max_uf]`"*. Implementado ingenuamente,
`(capacidad − min) / (max − min)` **divide por cero** cuando `min == max`, y un
`NaN` contamina el orden de todo el panel.

La regla ya se resuelve sola si se respeta el orden de las ramas: como el gate de
capacidad exige `capacidad >= precio_min`, cualquier par que sobreviva está
`>= precio_max`, y el propio §5.2 dice *"at/above `precio_max` → 0"*.
**Evaluar esa rama antes de interpolar.**

### 3. Semántica del rango de precio

- `precio_min_uf` = precio de la **unidad disponible más barata**.
- `precio_max_uf` = precio de la **más cara**.

Coincide con la lectura del spike en §5.1 (*"they cannot buy the cheapest unit"*).
Hoy los digita el administrador.

### 4. No se declaran constantes de capacidad en el frontend

Nada de tope FOGAES, tasa de referencia ni ratio de pie en el catálogo. Son
constantes de mercado, cambian por calendario o por ley (§3.1: el tope FOGAES pasó
de UF 4.500 a UF 6.000 en ago-2026) y la mitigación del spike (§8.3) es explícita:
el frontend replica **solo los pesos de afinidad**, la capacidad llega
precalculada desde el backend.

Por la misma razón se eliminó el espejo de `PRECIOS_REFERENCIA_UF` que existía en
`constants/proyectos.js`: el matching es *preference-independent* y **nunca** lee
esa tabla (§1, §2). La comuna del proyecto solo se compara con la
`comuna_objetivo` declarada por el lead (−15 de afinidad, nunca un gate).

### 5. Filtrado por ejecutivo

No existe `getProjectsForExecutive()` a propósito. Spike 1 E4 §8.2 deja a HU 13 la
decisión del subconjunto, `ejecutivos[]` ya trae `ejecutivo_id` para filtrar, y RLS
ya limita la lectura al tenant (un `ejecutivo` puede leer `proyectos` y
`proyecto_ejecutivos` de su inmobiliaria).

---

## Datos de demo

El seed crea solo inmobiliarias imaginarias — el cliente real (Echeverría
Izquierdo) se incorpora con `assign_admin` + la UI de inmobiliarias, no por
migración.

Los dos primeros proyectos **reproducen los ejemplos trabajados de Spike 1 E4 §9.2**
para que el matching sea verificable contra números publicados: con el Perfil 2
(capacidad 3.060 UF, `comuna_objetivo` Ñuñoa, clasificación Medio),
*Altos de Macul* debe dar afinidad **62,1** (`Cercano`, brecha 140,4 UF ≈ $1,15 MM
de ahorro) y *Parque Lo Espejo* afinidad **70,0** (`Compatible`, sin brecha).
No cambiar esos valores sin actualizar el spike.

Los demás cubren a propósito: proyecto agotado (E4) y sobre el tope FOGAES, venta
en verde dentro del feed, comuna fuera de `PRECIOS_REFERENCIA_UF`, y proyecto de
precio único.

`20260827090100_demo_projects_seed.sql` agrega otros 8 proyectos a *Inmobiliaria Andes
(demo)*: son los que la página de simulación traía hardcodeados antes de
CATALOGO-UNICO, todos de precio único y con `descripcion` y `entrega_estimada`
cargadas. Se insertan con `on conflict do nothing`, así que re-ejecutar el seed
no pisa ediciones hechas después desde `/admin/proyectos`.

---

## Consumidores actuales

Además del panel de administración (HU 7) y del matching (HU 13), la página de
simulación (`frontend/src/components/SimulationPage.jsx`) consume
`getAvailableProjects()` a través del adaptador
`frontend/src/lib/simulation/projectAdapter.js`, que traduce el vocabulario del
catálogo al de la simulación (`tipo` → `tipo_vivienda`, `precio_min_uf` →
`valor_uf`, `descripcion` → `descripcion_corta`).

El cálculo de escenario necesita **un** número y el catálogo guarda un **rango**.
El adaptador usa `precio_min_uf` — la unidad más barata — y la UI etiqueta el
resultado `"desde X UF"`, de modo que nadie lea un escenario como el precio del
proyecto. El rango completo viaja junto al valor puntual: el adaptador no pierde
información. Cuando `precio_min_uf == precio_max_uf` el proyecto tiene precio
único y la etiqueta muestra la cifra desnuda.

---

## Extensiones futuras

### Modelo de unidades / tipologías

**Pendiente, no implementado.** Un proyecto real no tiene un precio continuo: un
edificio se vende por tipologías (1D, 2D, 3D…) con precios, superficies y
disponibilidad distintos. Hoy eso se resume en `precio_min_uf` / `precio_max_uf`,
que es lo que pide HU 7 E1 (*"price range"*) y lo que el spike congeló.

Cuando haga falta más granularidad, la vía es **aditiva y no rompe este contrato**:

- una tabla hija `proyecto_tipologias(proyecto_id, tipologia, tipo, precio_uf, estado, …)`;
- `precio_min_uf` / `precio_max_uf` pasan de digitarse a **derivarse** como
  `MIN`/`MAX` sobre las unidades disponibles;
- el contrato queda idéntico byte a byte, así que **HU 13 no se re-especifica**.

Eso resolvería además la limitación conocida de `tipo`: hoy es único por proyecto,
así que un desarrollo mixto (casas + departamentos) queda mal representado y la
penalización de tipo (−10) puede fallar.

Mientras tanto, la regla de agregación ya está documentada para la ingesta desde
CRM en `docs/crm-integration.md`, porque los CRM de los clientes sí manejan
inventario a nivel de unidad.
