# HU 25 - Carga masiva de proyectos inmobiliarios mediante archivo

> **🗓 Planificada - Sprint 3.** El administrador carga varios proyectos desde una plantilla CSV/Excel, ve qué filas tienen errores antes de guardar y, al confirmar, los proyectos quedan en el catálogo al instante.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | *(sin definir en el tablero)* |
| **Puntos de Historia** | 5 |
| **Actor** | Administrador inmobiliario |
| **Sprint** | Sprint 3 |
| **Estado** | 🗓 Planificada |
| **Responsable** | Mauro — ver [[../Sprint3-Division\|División del Sprint 3]] |

---

## Historia de usuario

> **Como** administrador inmobiliario, **quiero** cargar múltiples proyectos y sus características de forma masiva mediante un archivo, **para** evitar el ingreso manual uno a uno y agilizar la actualización del catálogo.

---

## Criterios de aceptación

### E1 - Plantilla descargable

**Dado** que el administrador desea subir proyectos, **cuando** acceda a la sección, **entonces** el sistema debe proveer una plantilla descargable (CSV/Excel) con las columnas requeridas.

### E2 - Validación previa por fila

**Dado** que se sube un archivo poblado, **cuando** el sistema lo procese, **entonces** debe validar los datos (formatos, campos obligatorios) e informar exactamente qué filas tienen errores antes de guardar.

### E3 - Disponibilidad inmediata

**Dado** que el archivo es válido, **cuando** se confirme la carga, **entonces** los proyectos deben quedar disponibles en el catálogo de la inmobiliaria al instante.

---

## Notas

- Es la [[propuesta-importacion-masiva-catalogo|propuesta de importación masiva del catálogo]] que entró al backlog con número.
- Extiende el catálogo de [[HU7-catalogo-de-proyectos|HU 7]] (`AdminProjectCatalog.jsx`, `projectService.js`, `projectValidation.js`).
- Una carga que cambia precios o agrega bonos es lo que debe activar las alertas de [[HU31-radar-oportunidades-alertas|HU 31]].
