# HU 12 - Sistema de Derivación e Integración Comercial

> **🗓 Planificada - Sprint 2.** Envía al CRM **simulado** los leads evaluados con su información relevante y sus niveles de prioridad, y mantiene el registro actualizado cuando algo cambia.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Importante |
| **Puntos de Historia** | 5 |
| **Actor** | Ejecutivo comercial · Administrador inmobiliario |
| **Sprint** | Sprint 2 |
| **Estado** | 🗓 Planificada |

---

## Historia de usuario

> **Como** ejecutivo/Administrador inmobiliario, **quiero** mandar en un CRM simulado los leads evaluados junto con su información relevante y sus niveles de prioridad, **para** gestionarlos dentro del flujo comercial y saber cuáles requieren mayor atención.

---

## Criterios de aceptación

### E1 - Derivación de leads evaluados

**Dado** que un usuario obtuvo un score, **cuando** corresponda ejecutar la sincronización con el CRM, **entonces** el sistema debe enviar al CRM simulado la información relevante del lead, independientemente de su clasificación.

### E2 - Información del lead y proyecto objetivo

**Dado** que un lead será enviado al CRM simulado, **cuando** se construya la información de integración, **entonces** se deben incluir los datos necesarios para su gestión comercial, su proyecto objetivo y los resultados de su evaluación asociados a dicho proyecto.

### E3 - Priorización del lead

**Dado** que un lead posee una evaluación general y un proyecto objetivo, **cuando** sea enviado al CRM simulado, **entonces** deben registrarse separadamente su prioridad general, compatibilidad por capacidad de compra con el proyecto objetivo, su compatibilidad por afinidad con el proyecto objetivo.

### E4 - Actualización periódica en el CRM

**Dado** que un lead ya existe en el CRM simulado, **cuando** cambie su score, proyecto objetivo, compatibilidad por capacidad de compra, compatibilidad por afinidad o información comercial relevante, **entonces** en la siguiente sincronización el sistema debe actualizar el registro existente en el CRM simulado.

## Notas

- **Fuera de alcance hasta que se encargue explícitamente.** El handbook lista la integración con CRM entre los límites de alcance; esta historia no se implementa sin instrucción del equipo.
- Requiere conocer la API del CRM destino (endpoint, autenticación, mapeo de campos). Eso es parte del **Spike 2**.
- El dashboard interno ([[HU2-priorizacion-leads|HU 2]]) cubre la necesidad de priorización sin esta integración.
