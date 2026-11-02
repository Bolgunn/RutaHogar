# HU 25 - Carga masiva de proyectos inmobiliarios mediante archivo

> **⚠️ Construida, pendiente de merge** (rama `feat/hu25-carga-masiva-proyectos`). El administrador
> carga o actualiza muchos proyectos del catálogo desde un archivo CSV, con validación completa fila
> por fila antes de guardar y escritura todo o nada.

> **Número en conflicto.** El índice del backlog asigna "HU 25" a
> [[HU25-exportacion-dossier|Exportación de dossier para evaluación bancaria]]. Esta historia llegó
> como "HU25 - Carga masiva de proyectos inmobiliarios mediante archivo"; quien mantiene el backlog
> debe decidir cuál conserva el número antes del merge.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Deseable *(el texto entregado indica también "Opcional")* |
| **Puntos de Historia** | 5 |
| **Actor** | Administrador inmobiliario |
| **Estado** | ⚠️ Construida, pendiente de merge |

---

## Historia de usuario

> **Como** administrador inmobiliario, **quiero** cargar múltiples proyectos y sus características de forma masiva mediante un archivo, **para** evitar el ingreso manual uno a uno y agilizar la actualización del catálogo.

---

## Criterios de aceptación

### E1

**Dado** que el administrador desea subir proyectos, **cuando** acceda a la sección, **entonces** el sistema debe proveer una plantilla descargable (CSV/Excel) con las columnas requeridas.

### E2

**Dado** que se sube un archivo poblado, **cuando** el sistema lo procese, **entonces** debe validar los datos (formatos, campos obligatorios) e informar exactamente qué filas tienen errores antes de guardar.

### E3

**Dado** que el archivo es válido, **cuando** se confirme la carga, **entonces** los proyectos deben quedar disponibles en el catálogo de la inmobiliaria al instante.

## Notas

- **Dónde está.** `/admin/proyectos` → botón **Carga masiva**. Lo ven el administrador de una
  inmobiliaria y el administrador global; este último elige en qué inmobiliaria se cargan los
  proyectos.
- **E1 — la plantilla.** Es un CSV con las ocho columnas del catálogo: `nombre`, `comuna`, `tipo`,
  `precio_min_uf`, `precio_max_uf`, `estado` (obligatorias), `descripcion` y `entrega_estimada`
  (opcionales). Se guarda con `;` y codificación UTF-8, que es como Excel en configuración chilena
  lo abre en columnas y con tildes. No trae filas de ejemplo, para que un ejemplo olvidado no termine
  publicado; el modal muestra una guía con qué escribir en cada columna. Se puede subir de vuelta un
  CSV guardado desde Excel, Google Sheets o LibreOffice (con `;` o `,`). Un `.xlsx` no se acepta:
  el modal pide guardarlo como CSV.
- **E2 — la validación.** Cada fila pasa por las mismas reglas que el formulario de "Nuevo
  proyecto" (comuna de la lista, tipo y estado válidos, precios mayores que 0 y máximo ≥ mínimo,
  descripción de hasta 500 caracteres, entrega en formato AAAA-MM). El resultado indica la **fila tal
  como se ve en Excel** (el encabezado es la fila 1), la columna y el motivo. Además se revisa lo que
  solo un archivo puede tener mal: columnas obligatorias que faltan, un nombre repetido dentro del
  archivo, valores de más en una fila y un máximo de 500 proyectos por carga. Mientras haya un solo
  error no se puede confirmar: no hay carga parcial.
  - Los precios aceptan el formato chileno (`3.500`, `4.850,5`) y el simple (`3500`, `3500.5`). Un
    valor como `3,500` se marca como ambiguo en vez de adivinar.
  - Mayúsculas y tildes no importan en comuna, tipo y estado (`nunoa`, `Departamento`, `En
    construcción` se leen bien).
- **E3 — la carga.** Al confirmar, todos los proyectos se escriben en una sola operación: o entran
  todos o no entra ninguno. Un proyecto cuyo nombre ya existe en la inmobiliaria se **actualiza**
  (sin distinguir mayúsculas); los demás se **crean**. La vista previa marca cada fila como *Nuevo*
  o *Actualiza* antes de confirmar. Al terminar, la lista del catálogo se recarga y los proyectos ya
  aparecen para los leads y en el matching.
- **Seguridad.** Los proyectos siempre quedan en la inmobiliaria del administrador que carga: si el
  archivo trae una columna `inmobiliaria_id`, se ignora y se avisa. La escritura pasa por los mismos
  permisos de base de datos que la carga manual.
- **Fuera de alcance.** Archivos `.xlsx`, asignar ejecutivos desde el archivo, borrar proyectos que
  no vienen en el archivo, tipologías y sincronizaciones automáticas con otros sistemas.
- Implementación: `frontend/src/lib/catalog/projectImport.js`, el modal
  `frontend/src/components/ProjectBulkImport.jsx`, la función `importar_proyectos()` (migración
  `20261102120000`) y el plan `docs/stories/HU25-carga-masiva-proyectos/PLAN.md`. Esta historia
  implementa la propuesta [[propuesta-importacion-masiva-catalogo|Importación masiva del catálogo]]
  (salvo su E4, tipologías).
