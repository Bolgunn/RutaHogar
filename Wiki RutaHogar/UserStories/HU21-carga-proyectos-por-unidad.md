# HU 21 - Carga de proyectos por unidad y tipología

> **🗓 Planificada - Sprint 2.** Hoy el administrador declara un proyecto como un rango de precio digitado a mano. Esta historia lo convierte en un inventario de tipologías reales — 1D, 2D, 3D — cada una con su precio, superficie y disponibilidad.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Importante |
| **Puntos de Historia** | *(sin definir en el documento)* |
| **Actor** | Administrador inmobiliario |
| **Sprint** | Sprint 2 |
| **Estado** | 🗓 Planificada |

---

## Historia de usuario

> Como administrador inmobiliario, quiero cargar las tipologías concretas de cada proyecto con su precio, dormitorios, baños y superficie, para que la plataforma muestre lo que realmente vendo y no un rango de precio que yo mismo tuve que estimar.

---

## Criterios de aceptación

### E1

**Dado** que el administrador edita un proyecto de su catálogo, **cuando** agregue, modifique, marque como no disponible o elimine una tipología, **entonces** debe poder declarar su nombre, dormitorios, baños, superficie en m², precio en UF y disponibilidad, y el rango del proyecto debe recalcularse sin intervención manual.

### E2

**Dado** que un proyecto tiene al menos una tipología disponible, **cuando** se consulte el proyecto, **entonces** su precio mínimo y máximo deben derivarse de las tipologías disponibles y dejar de ser campos digitados; y dado que un proyecto no tiene tipologías cargadas, cuando el administrador lo edite o un consumidor lo lea, entonces debe seguir funcionando exactamente como hoy, con su rango de precio ingresado a mano.

### E3

**Dado** que un administrador accede a las tipologías, **cuando** consulte o modifique cualquiera, **entonces** solo debe alcanzar las de proyectos de su propia inmobiliaria.

### E4

**Dado** que un proyecto tiene tipologías cargadas, **cuando** el lead revise el proyecto, **entonces** debe ver el desglose de tipologías con su precio, y no solo el rango agregado.

## Notas

- Origen: `docs/stories/UNIDADES-PROYECTO/PLAN.md`, cuyo encabezado declara literalmente
  *"**this likely deserves a wiki HU**"*. Esta página es esa historia.
- **Qué se captura hoy:** ocho campos, todos a nivel de proyecto —
  `nombre`, `comuna`, `tipo`, `estado`, `precio_min_uf`, `precio_max_uf`, `descripcion`,
  `entrega_estimada` (`frontend/src/services/projectValidation.js:21`). Un proyecto real no es eso:
  es un conjunto de tipologías, y el "rango" es apenas el mínimo y el máximo de sus precios.
- **HU 7 dejó la puerta abierta.** El contrato congelado, nota 3
  (`docs/project-catalog-contract.md`): *"Hoy los digita el admin; si más adelante se agrega un
  modelo de unidades pasan a derivarse (MIN/MAX) sin cambiar este contrato."* E2 es esa puerta.
- **El contrato crece de forma aditiva.** Se agrega `unidades: [...]` al proyecto devuelto; ningún
  campo existente cambia de nombre, tipo ni significado. Es lo que permite hacerlo **después** de
  [[HU10-matching-lead-proyecto|HU 10]] y no antes.
- **E3 no es opcional.** `proyecto_unidades` es inventario de un tenant: necesita RLS espejando la de
  `proyectos`, resuelta vía `proyecto_id → inmobiliaria_id`. Salvaguarda S6 del handbook — una tabla
  nueva sin RLS no se libera.
- Requiere migración (tabla, índices, RLS, trigger y rollback). No se aplica sola: quien mergea la
  corre y lo dice en el PR.
- Campos deliberadamente **fuera**: piso, orientación, estacionamiento, bodega, m² de terraza, y la
  gestión de inventario real — reservas, unidades vendidas, conteos. Eso es trabajo de un CRM
  ([[HU12-derivacion-comercial|HU 12]] / Spike 2), no de una herramienta de precalificación.

---

## Relación con otras historias

| Historia | Relación |
| :------- | :------- |
| [[HU7-catalogo-de-proyectos\|HU 7]] | La extiende. Esta historia es la granularidad que HU 7 dejó anticipada en la nota 3 del contrato. |
| [[propuesta-matching-nivel-unidad\|Matching a nivel de unidad]] | **Es su precondición.** HU 21 captura las tipologías; la propuesta las usa para matchear. HU 21 entrega valor por sí sola; la propuesta no existe sin HU 21. |
| [[propuesta-importacion-masiva-catalogo\|Importación masiva del catálogo]] | Complementaria. HU 21 hace que un proyecto pueda describirse bien; la propuesta hace que describir cien no cueste cien veces. Ninguna bloquea a la otra. |
| [[HU9-cotizacion-orientativa\|HU 9]] | La cotización pasa a poder citar una tipología concreta en vez del precio de entrada. |
| [[HU6-simulacion-compatibilidad\|HU 6]] | Hoy la simulación evalúa el proyecto a su precio de entrada (`valor_uf := precio_min_uf`) y declara compatible a quien solo alcanza la unidad más barata. Con tipologías, esa afirmación deja de ser engañosa. |

> **Pregunta abierta, heredada del plan de origen:** sin una preferencia de dormitorios en el
> formulario de ingreso, `dormitorios` es un dato de solo despliegue. El plan lo llama *"la mayor
> pregunta abierta"* y asigna ese campo a [[HU1-ingreso-datos-financieros|HU 1]] — igual que
> [[propuesta-primera-vivienda-fogaes\|Primera vivienda / FOGAES]]. Vale la pena resolver ambas juntas.

---

## Estado frente al código

Historia propuesta, sin implementación.

| Criterio | Estado | Evidencia |
| :------- | :----- | :-------- |
| `E1` | ❌ | No existe `proyecto_unidades`; `AdminProjectCatalog.jsx` solo edita campos de proyecto, y no hay trigger de recálculo. |
| `E2` | ❌ | `projectValidation.js:53` valida `precio_min_uf`/`precio_max_uf` como entrada digitada. El fallback sin tipologías es el comportamiento actual: se verifica como no-regresión. |
| `E3` | ❌ | Sin tabla, sin políticas. |
| `E4` | ❌ | Ninguna vista muestra desglose por tipología. |
