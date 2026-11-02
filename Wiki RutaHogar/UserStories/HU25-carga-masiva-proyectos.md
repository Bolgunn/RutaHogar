# HU 25 - Carga masiva de proyectos inmobiliarios mediante archivo

> **⚠️ Construida, pendiente de merge** (rama `feat/hu25-carga-masiva-proyectos`). El administrador
> de una inmobiliaria carga o actualiza muchos proyectos de su catálogo desde una planilla Excel o un
> CSV, con validación completa fila por fila antes de guardar y escritura todo o nada.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Deseable *(el texto entregado indica también "Opcional")* |
| **Puntos de Historia** | 5 |
| **Actor** | Administrador inmobiliario |
| **Estado** | ⚠️ Construida, pendiente de merge |

> Numeración del sprint actual. La página [[HU25-exportacion-dossier|HU25 - Exportación de dossier]]
> corresponde a la numeración del sprint anterior.

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

- **Dónde está.** `/admin/proyectos` → botón **Carga masiva**. Lo ve solo el administrador de una
  inmobiliaria, y los proyectos quedan **siempre en la inmobiliaria de su sesión**. El administrador
  global de RutaHogar no ve el botón: cargar proyectos para un cliente desde RutaHogar necesita otro
  flujo, que no es parte de esta historia.
- **E1 — las plantillas.**
  - **Excel (.xlsx):** hoja *Proyectos* con las ocho columnas del catálogo y listas desplegables
    para comuna, tipo y estado; hoja *Instrucciones* con qué escribir en cada columna. La columna
    `entrega_estimada` viene con formato de texto para que Excel no convierta `2027-06` en fecha.
  - **CSV:** las mismas columnas, con `;` y UTF-8, como lo abre Excel en configuración chilena.
  - Columnas obligatorias: `nombre`, `comuna`, `tipo`, `precio_min_uf`, `precio_max_uf`, `estado`.
    Opcionales: `descripcion`, `entrega_estimada`. Ninguna plantilla trae filas de ejemplo, para que
    un ejemplo olvidado no termine publicado.
- **Archivos que acepta.** `.xlsx` (se lee la primera hoja) y `.csv` (con `;` o `,`, en UTF-8 o en
  la codificación de Excel en Windows). Un `.xls` antiguo, `.ods` o `.numbers` muestran cómo
  guardarlo como `.xlsx`. Máximo 500 proyectos y 1 MB por archivo.
- **E2 — la validación.** Cada fila pasa por las mismas reglas que el formulario de "Nuevo
  proyecto" (comuna de la lista, tipo y estado válidos, precios mayores que 0 y máximo ≥ mínimo,
  descripción de hasta 500 caracteres, entrega en formato AAAA-MM). El resultado indica la **fila tal
  como se ve en Excel**, la columna y el motivo. Además se revisa lo que solo un archivo puede tener
  mal: columnas obligatorias que faltan, un nombre repetido dentro del archivo, valores fuera de las
  columnas y el máximo por carga. Mientras haya un solo error no se puede confirmar: no hay carga
  parcial.
  - **Montos:** se usa la convención chilena. El punto separa miles y la coma, si aparece, decimales:
    `51.000`, `$51.000,00`, `UF 3.250,5`. Se toleran `$`, `UF` y espacios. Una celda numérica de
    Excel se toma tal cual. Un texto que no es un monto (`tres mil`) se marca como error en esa
    celda; el sistema nunca se cae por un monto mal escrito.
  - Mayúsculas y tildes no importan en comuna, tipo y estado (`lo espejo`, `Casa`, `En
    construcción` se leen bien).
  - Si Excel convirtió la entrega en fecha, se toma su mes.
- **E3 — la carga.** Al confirmar, todos los proyectos se escriben en una sola operación: o entran
  todos o no entra ninguno. Un proyecto cuyo nombre ya existe en la inmobiliaria se **actualiza**
  (sin distinguir mayúsculas); los demás se **crean**. La vista previa marca cada fila como *Nuevo*
  o *Actualiza* antes de confirmar. Al terminar, la lista del catálogo se recarga y los proyectos ya
  aparecen para los leads y en el matching.
- **Seguridad.** Si el archivo trae una columna `inmobiliaria_id`, se ignora y se avisa. La escritura
  pasa por los mismos permisos de base de datos que la carga manual.
- **Fuera de alcance.** Asignar ejecutivos desde el archivo, borrar proyectos que no vienen en el
  archivo, tipologías, carga desde el administrador global y sincronizaciones automáticas.

## Cómo probarla

Archivos de ejemplo en `docs/stories/HU25-carga-masiva-proyectos/samples/`.

**Requisito:** la migración `20261102120000_hu25_importar_proyectos.sql` aplicada en un Supabase de
pruebas (no producción) y una cuenta `admin_inmobiliario` de una inmobiliaria con algunos proyectos.
Si solo tienes el administrador global: en `/admin/proyectos` usa **Asignar administrador** con una
cuenta de prueba ya registrada y una inmobiliaria demo, y entra con esa cuenta. Sin la migración
todo funciona hasta **Confirmar carga**, que mostrará "No se pudo completar la carga".

1. **E1.** Entrar como administrador de la inmobiliaria → `/admin/proyectos` → **Carga masiva** →
   **Plantilla Excel (.xlsx)**. Abrirla: ver las ocho columnas, las listas desplegables en comuna,
   tipo y estado, y la hoja *Instrucciones*. Descargar también **Plantilla CSV** y abrirla en Excel.
2. **E2.** Subir `proyectos-con-errores.xlsx`. Debe mostrar 6 filas, 1 válida y 5 con errores:
   fila 3 `comuna` vacía · fila 4 `precio_max_uf` menor que el mínimo · fila 5 `comuna`, `tipo` y
   `estado` fuera del catálogo · fila 6 monto `tres mil` y entrega `jun-27` · fila 7 nombre repetido de
   la fila 2. **Confirmar carga** queda deshabilitado y la lista de proyectos no cambia.
3. **E3.** Subir `proyectos-validos.xlsx`. Debe mostrar las filas 2, 3 y 5 (la 4 está vacía) como
   *Nuevo*, con rangos UF 6.500 – 9.200,5 · UF 51.000 – 60.000 · UF 3.200. Confirmar: aparece
   "3 proyectos creados" y los tres se ven en la lista sin recargar. Entrar como lead y verlos en el
   catálogo (el *agotado* no aparece para el lead, igual que con la carga manual).
4. **Actualización.** Subir de nuevo `proyectos-validos.xlsx`: las tres filas salen como *Actualiza*
   y al confirmar se informa "3 proyectos actualizados", sin duplicados.
5. **CSV.** Subir `proyectos-validos.csv`: dos proyectos válidos (`4.100`, `5.250,5`, `$7.800`).
6. **Aislamiento.** Entrar como administrador global: no aparece **Carga masiva**.

## Implementación

`frontend/src/lib/catalog/projectImport.js` y `readXlsx.js` (librería `read-excel-file`, cargada
solo al subir un `.xlsx`), el modal `frontend/src/components/ProjectBulkImport.jsx`, la plantilla
`frontend/public/plantillas/plantilla-proyectos-rutahogar.xlsx` (generada por
`frontend/scripts/build-import-template.mjs`), la función `importar_proyectos()` (migración
`20261102120000`) y el plan `docs/stories/HU25-carga-masiva-proyectos/PLAN.md`. Esta historia
implementa la propuesta [[propuesta-importacion-masiva-catalogo|Importación masiva del catálogo]]
(salvo su E4, tipologías).
