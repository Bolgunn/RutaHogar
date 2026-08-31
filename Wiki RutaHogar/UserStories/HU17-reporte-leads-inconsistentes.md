# HU 17 - Reportar leads inconsistentes o fraudulentos

> **🗓 Planificada - Sprint 2.** Permite marcar, reportar y depurar del dashboard comercial los leads con información contradictoria o posiblemente fraudulenta, sin eliminar su información de forma irreversible.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Deseable |
| **Puntos de Historia** | 5 |
| **Actor** | Ejecutivo comercial |
| **Sprint** | Sprint 2 |
| **Estado** | 🗓 Planificada |

---

## Historia de usuario

> **Como** ejecutivo comercial, **quiero** eliminar/quitar del dashboard de mis ejecutivos comerciales a usuarios fraudulentos, **para** así poder evitar posibles fraudes y perdida de tiempo y dinero para los ejecutivos comerciales.

---

## Criterios de aceptación

### E1 - Detección de indicadores de inconsistencia

**Dado** que un lead completa una preevaluación financiera, **cuando** el sistema detecte información contradictoria, incompleta o poco confiable, **entonces** deberá marcar el lead con una alerta de posible inconsistencia.

### E2 - Visualización de alertas en el dashboard

**Dado** que existe un lead marcado con posible inconsistencia o fraude, **cuando** el ejecutivo comercial o administrador visualice el dashboard, **entonces** el sistema deberá mostrar una etiqueta o advertencia visible en la tarjeta del lead.

### E3 - Reporte manual de lead sospechoso

**Dado** que un ejecutivo comercial revisa un lead, **cuando** detecte información sospechosa, inconsistente o posiblemente fraudulenta, **entonces** deberá poder reportarlo indicando un motivo del reporte.

### E4 - Cambio de estado del lead reportado

**Dado** que un lead ha sido reportado, **cuando** el administrador inmobiliario revise el caso, **entonces** deberá poder cambiar su estado a "En revisión", "Descartado por inconsistencia", "Fraude confirmado" o "Reactivado".

### E5 - Depuración del dashboard comercial

**Dado** que un lead fue descartado por inconsistencia o fraude confirmado, **cuando** los ejecutivos comerciales visualicen su cartera de leads, **entonces** el sistema deberá ocultar o retirar dicho lead de la vista principal de oportunidades comerciales.

### E6 - Notificación del estado del reporte

**Dado** que un reporte cambia de estado, **cuando** el sistema actualice la revisión del lead, **entonces** deberá notificar o mostrar el nuevo estado al usuario que realizó el reporte y al administrador correspondiente.

### E7 - Registro de auditoría del reporte

**Dado** que se reporta, descarta, reactiva o modifica el estado de un lead, **cuando** ocurra la acción, **entonces** el sistema deberá guardar fecha, responsable, motivo y estado anterior/posterior para mantener trazabilidad.

### E8 - Prevención de eliminación irreversible

**Dado** que un lead es reportado como fraudulento o inconsistente, **cuando** se depure del dashboard, **entonces** el sistema no deberá eliminar definitivamente su información de forma automática, sino mantenerla registrada para revisión, auditoría o posible reactivación.

---

## Notas

- E7 y E8 se apoyan en [[../RNF/RNF4-auditoria-tecnica|RNF 4]] y [[../RNF/RNF5-historial-inmutable|RNF 5]].
