# HU 25 - Exportación de dossier para evaluación bancaria

> **🗓 Planificada - Sprint 3.** Genera un expediente digital consolidado con el perfil del lead y sus documentos, para agilizar una derivación posterior a un banco.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Opcional |
| **Puntos de Historia** | 3 |
| **Actor** | Ejecutivo comercial |
| **Sprint** | Sprint 3 |
| **Estado** | 🗓 Planificada |

---

## Historia de usuario

> **Como** ejecutivo comercial, **quiero** exportar un reporte consolidado con el perfil del lead y sus documentos, **para** agilizar una futura derivación a instituciones bancarias formales.

---

## Criterios de aceptación

### E1 - Exportación desde perfil del lead

**Dado** que el ejecutivo revisa un prospecto priorizado, **cuando** seleccione exportar dossier, **entonces** el sistema debe generar un expediente digital.

### E2 - Contenido del dossier

**Dado** que el dossier se genera, **cuando** el ejecutivo lo descargue, **entonces** debe incluir detalle del score, perfil del lead y documentos cargados.

### E3 - Formato estandarizado

**Dado** que el dossier será usado para revisión posterior, **cuando** se genere el archivo, **entonces** debe presentar la información de forma limpia y estructurada.

---

## Notas

- Depende de [[HU24-carga-documentos|HU 24]] para el contenido documental, y hereda su tensión con la salvaguarda S8.
- Qué datos incluye el dossier y qué permisos se requieren para descargarlo es parte del **Spike 2**.
