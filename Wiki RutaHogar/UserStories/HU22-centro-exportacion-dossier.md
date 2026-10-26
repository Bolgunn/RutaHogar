# HU 22 - Centro de exportación de información y dossier

> **🗓 Planificada - Sprint 3.** El ejecutivo o el administrador exporta información de RutaHogar —un dossier PDF por lead o una hoja de cálculo de leads y métricas— limitada por su rol y con registro de cada exportación.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | *(sin definir en el tablero)* |
| **Puntos de Historia** | 5 |
| **Actor** | Ejecutivo comercial · Administrador inmobiliario |
| **Sprint** | Sprint 3 |
| **Estado** | 🗓 Planificada |
| **Responsable** | Andrés — ver [[../Sprint3-Division\|División del Sprint 3]] |

---

## Historia de usuario

> **Como** ejecutivo comercial o administrador inmobiliario, **quiero** exportar información relevante de RutaHogar en formatos adecuados para su uso comercial y de gestión, **para** compartir antecedentes de leads, generar dossiers y analizar información fuera de la plataforma.

---

## Criterios de aceptación

### E1 - Dossier PDF de un lead

**Dado** que el ejecutivo se encuentra revisando un lead, **cuando** solicite generar un dossier, **entonces** el sistema debe crear un PDF estructurado con la información seleccionada del perfil, evaluación, proyecto objetivo, antecedentes financieros y documentos permitidos.

### E2 - Hoja de cálculo respetando filtros

**Dado** que el ejecutivo o administrador está visualizando un conjunto de leads o métricas, **cuando** solicite una exportación, **entonces** el sistema debe generar un archivo de hoja de cálculo (ej.: Excel, CSV) con la información correspondiente, respetando los filtros y segmentaciones aplicados en la plataforma.

### E3 - Selección de contenido limitada por rol

**Dado** que existen distintos tipos de información disponible, **cuando** se prepare una exportación, **entonces** el ejecutivo debe poder seleccionar los antecedentes que corresponda incluir y el sistema debe limitar el contenido según su rol y permisos.

### E4 - Identificación y trazabilidad

**Dado** que se genera un archivo desde RutaHogar, **cuando** este sea descargado, **entonces** debe identificar la fecha de generación y el contexto de los datos exportados, manteniendo además registro de la exportación realizada para efectos de trazabilidad.

---

## Notas

- Reemplaza a la antigua [[HU25-exportacion-dossier|HU 25 — Exportación de dossier para evaluación bancaria]] y la amplía con la exportación tabular.
- **Depende de [[HU23-documentos-validacion-asistida|HU 23]]:** el dossier debe distinguir datos respaldados y no respaldados, y nunca incluir el documento original (HU 23 lo elimina tras procesarlo).
- La generación de CSV/Excel la necesita también [[HU25-carga-masiva-proyectos|HU 25]] (plantilla descargable). Conviene construirla una vez.
- Hoy no hay librerías de PDF ni de hoja de cálculo en el proyecto.
