# Propuesta — Importación masiva del catálogo desde CSV

> **Propuesta sin numerar.** Cargar un catálogo completo desde un archivo CSV, con validación previa fila por fila y confirmación explícita antes de escribir nada. Resuelve volumen; la granularidad la resuelve [[propuesta-carga-proyectos-por-unidad|Carga de proyectos por unidad y tipología]].

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Deseable |
| **Puntos de Historia** | 5 |
| **Actor** | Administrador inmobiliario |
| **Sprint** | — *(fuera del backlog numerado)* |
| **Estado** | Propuesta |

---

## Historia de usuario

> **Como** administrador inmobiliario con decenas de proyectos y cientos de tipologías, **quiero** cargarlos desde un archivo CSV en vez de digitarlos uno por uno, **para** poner mi catálogo en la plataforma sin días de trabajo manual.

---

## Criterios de aceptación

### E1 - Plantilla y validación previa a la escritura

**Dado** que el administrador va a importar su catálogo, **cuando** acceda a la importación, **entonces** debe poder descargar una plantilla CSV con las columnas esperadas y un ejemplo; **y cuando** suba un archivo, **entonces** el sistema debe validarlo completo **sin haber escrito nada** en el catálogo, indicando en cada fila inválida el número de fila, la columna y el motivo, con las mismas reglas que la carga manual.

### E2 - Confirmación explícita y escritura todo o nada

**Dado** que el administrador revisó la previsualización, **cuando** confirme la importación, **entonces** recién ahí deben escribirse los registros, y debe informarse cuántos se crearon y cuántos se actualizaron; **y si** la importación falla a mitad de camino, **entonces** el catálogo debe quedar como estaba antes de iniciarla.

### E3 - Aislamiento por inmobiliaria

**Dado** que un administrador importa un archivo, **cuando** se escriban los registros, **entonces** todos deben quedar asociados a su propia inmobiliaria, sin importar lo que el archivo declare.

### E4 - Tipologías en el mismo archivo

**Dado** que existe el modelo de tipologías de [[propuesta-carga-proyectos-por-unidad|Carga de proyectos por unidad y tipología]], **cuando** el archivo incluya filas de tipología, **entonces** deben importarse asociadas a su proyecto y el rango de precio derivarse de ellas.

---

## Notas

- **Resuelve volumen, no granularidad.** Es la contraparte de
  [[propuesta-carga-proyectos-por-unidad|Carga de proyectos por unidad y tipología]]: aquella hace que un proyecto pueda describirse bien;
  esta hace que describir cien no cueste cien veces.
- **E1 más E2 son el corazón de la historia.** Una importación que escribe mientras valida deja el
  catálogo a medio migrar y sin forma de saber qué entró. La previsualización no es una comodidad de
  UX: es lo que hace la operación reversible antes de existir.
- **E1 reutiliza `projectValidation.js`, no reimplementa las reglas.** Si la validación del CSV se
  escribe aparte, las dos rutas de entrada divergen y el CSV se vuelve la puerta trasera por la que
  entran proyectos que el formulario habría rechazado. Comuna dentro de `comunasMvp`, `tipo` y
  `estado` dentro de sus enumeraciones, `precio_max_uf >= precio_min_uf`, `entrega_estimada` en
  formato `AAAA-MM`, descripción hasta 500 caracteres — todas ya existen
  (`frontend/src/services/projectValidation.js`).
- **E3 no es paranoia.** Un CSV es entrada no confiable: si el archivo trae una columna
  `inmobiliaria_id`, se ignora y se usa el tenant de la sesión. Salvaguarda S6 del handbook.
- **El “todo o nada” de E2 es lo que decide la implementación.** Escribir fila por fila desde el frontend no puede
  cumplirlo. La importación necesita resolverse en una transacción del lado del servidor — es la
  decisión de diseño principal de esta historia y conviene grillarla antes de planificarla.
- **Sin HU 21, E4 no aplica** y la historia sigue siendo válida: importa proyectos con su rango
  digitado, exactamente los ocho campos de hoy. Se puede hacer antes, después o junto con HU 21;
  hecha después, el archivo cubre proyecto y tipologías en una sola pasada.
- **Fuera de alcance:** sincronización recurrente, importación programada, conexión a un ERP o
  portal inmobiliario, y formatos que no sean CSV. Excel y las integraciones son otra conversación —
  la integración con sistemas externos vive en [[HU12-derivacion-comercial|HU 12]] y sigue fuera de
  alcance sin encargo explícito.

---

## Relación con otras historias

| Historia | Relación |
| :------- | :------- |
| [[HU7-catalogo-de-proyectos\|HU 7]] | Es una segunda vía de entrada al mismo catálogo. Comparte validación y contrato; no los redefine. |
| [[propuesta-carga-proyectos-por-unidad\|Carga de proyectos por unidad y tipología]] | Complementaria, no bloqueante. Con HU 21, el CSV también trae tipologías (E4). |
| [[HU12-derivacion-comercial\|HU 12]] | Frontera explícita: importar un archivo **no** es integrarse con un sistema externo. |

---

## Estado frente al código

Historia propuesta, sin implementación.

| Criterio | Estado | Evidencia |
| :------- | :----- | :-------- |
| `E1` | ❌ | No existe plantilla ni vista de importación; `AdminProjectCatalog.jsx` solo tiene alta unitaria por formulario y `projectValidation.js` valida un proyecto, no un lote. |
| `E2` | ❌ | Sin previsualización ni escritura transaccional de lote. |
| `E3` | ❌ | Sin ruta de importación que forzar al tenant. |
| `E4` | ❌ | Depende de [[propuesta-carga-proyectos-por-unidad\|Carga de proyectos por unidad y tipología]]. |
