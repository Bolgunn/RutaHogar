# HU 12 - Sistema de derivación e integración comercial

> **🗓 Planificada - Sprint 2.** Replica en el CRM de la inmobiliaria los leads calificados de alta prioridad, y los mantiene actualizados cuando cambia su score.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Importante |
| **Puntos de Historia** | 8 |
| **Actor** | Funcionario de inmobiliaria |
| **Sprint** | Sprint 2 |
| **Estado** | 🗓 Planificada |

---

## Historia de usuario

> **Como** funcionario de una inmobiliaria, **quiero** ingresar usuarios calificados desde la aplicación al CRM de la inmobiliaria, **para** poder darles una gestión priorizada dentro del flujo de venta del proyecto inmobiliario.

---

## Criterios de aceptación

### E1 - Derivación automática de leads de alta prioridad al CRM

**Dado** un usuario ingresado en la aplicación, **cuando** este termine de ser calificado y sea calificado como de alta prioridad, **entonces** el sistema debe replicar, inmediatamente o eventualmente, la información del usuario dentro del CRM.

### E2 - Actualización del lead en el CRM ante cambios de score o prioridad

**Dado** un usuario ingresado en la aplicación, **cuando** ocurra una actualización en el score de nuestro usuario y este pase a estar calificado o se aumente su prioridad, **entonces** el sistema debe mandar una request al CRM para que actualice los datos del usuario.

### E3 - Retención interna de leads no prioritarios

**Dado** un usuario ingresado en la aplicación, **cuando** este termine de ser calificado y no se considere de alta prioridad, **entonces** la aplicación no debe enviar su perfil al CRM y solo debe manejar sus datos dentro de la aplicación hasta que su calificación se actualice.

---

## Notas

- **Fuera de alcance hasta que se encargue explícitamente.** El handbook lista la integración con CRM entre los límites de alcance; esta historia no se implementa sin instrucción del equipo.
- Requiere conocer la API del CRM destino (endpoint, autenticación, mapeo de campos). Eso es parte del **Spike 2**.
- El dashboard interno ([[HU2-priorizacion-leads|HU 2]]) cubre la necesidad de priorización sin esta integración.
