# HU 16 - Gestión de leads inconsistentes o sospechosos

> **🗓 Planificada - Sprint 2.** Detecta inconsistencias automáticamente, permite reportarlas y revisarlas, y conserva el historial completo sin eliminar nunca el lead.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Deseable |
| **Puntos de Historia** | 8 |
| **Actor** | Ejecutivo comercial |
| **Sprint** | Sprint 2 |
| **Estado** | 🗓 Planificada |

---

## Historia de usuario

> **Como** ejecutivo comercial, **quiero** identificar y reportar leads con información inconsistente o poco confiable, **para** priorizar oportunidades de mejor calidad y permitir que los casos sospechosos sean revisados sin eliminar su información.

---

## Criterios de aceptación

### E1 - Detección automática de inconsistencias

**Dado** que un lead registra o actualiza información financiera o personal relevante, **cuando** el sistema detecte valores contradictorios, cambios anormales respecto a su historial o datos poco consistentes, **entonces** debe marcar el lead con una alerta de posible inconsistencia e indicar los factores que originaron la advertencia.

### E2 - Reporte y revisión manual

**Dado** que un ejecutivo identifica información sospechosa en un lead, **cuando** lo reporte indicando un motivo, **entonces** el caso debe quedar disponible para revisión por parte del administrador inmobiliario, quien podrá cambiar su estado a Normal, En revisión, descartado o reactivado.

### E3 - Visualización y filtrado por estado de confiabilidad

**Dado** que existen leads con distintos estados de revisión, **cuando** el ejecutivo acceda al dashboard comercial, **entonces** el sistema debe mostrar su estado de confiabilidad y permitir filtrarlos, mostrando por defecto los leads que no estén marcados como sospechosos o descartados.

### E4 - Conservación del historial y trazabilidad

**Dado** que un lead es marcado, reportado, revisado, descartado o reactivado, **cuando** cambie su estado, **entonces** el sistema debe conservar su información e historial de cambios, incluyendo fecha, responsable, motivo y estado anterior y posterior, sin eliminar definitivamente el lead.

## Notas

- E4 se apoya en [[../RNF/RNF4-auditoria-tecnica|RNF 4]] y [[../RNF/RNF5-historial-inmutable|RNF 5]].
