# Propuesta — Captura y notificación de solicitudes de contacto

> **Propuesta sin numerar.** `POST /interest` responde éxito y no persiste nada: "Contactar a un Ejecutivo" no deja rastro y ningún ejecutivo se entera. Esta historia convierte la solicitud en un lead real y notificable.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Esencial |
| **Puntos de Historia** | 5 |
| **Actor** | Ejecutivo comercial |
| **Sprint** | — *(fuera del backlog numerado)* |
| **Estado** | Propuesta |

---

## Historia de usuario

> **Como** ejecutivo comercial, **quiero** recibir y ver las solicitudes de contacto que los leads envían desde un proyecto del catálogo, **para** poder responderlas en vez de perderlas.

---

## Criterios de aceptación

### E1 - Persistencia de la solicitud

**Dado** que un lead solicita ser contactado desde un proyecto, **cuando** se envíe la solicitud, **entonces** el sistema debe persistirla asociada al lead, al proyecto y a la fecha.

### E2 - Gestión por el ejecutivo

**Dado** que existe una solicitud registrada, **cuando** el ejecutivo revise su dashboard, **entonces** debe verla junto al lead que la originó y al proyecto solicitado, y poder marcarla como atendida para que deje de figurar como pendiente.

### E3 - Identidad real del solicitante

**Dado** que el lead tiene sesión iniciada, **cuando** envíe la solicitud, **entonces** el sistema debe asociarla a su identidad de sesión y no a un correo escrito libremente en el formulario.

### E4 - Confirmación honesta

**Dado** que la solicitud no se pudo registrar, **cuando** el lead reciba la respuesta, **entonces** el sistema no debe declarar que un ejecutivo lo contactará.

---

## Notas

- Origen: `docs/stories/CATALOGO-UNICO-HU9/PLAN.md:116`, que lo deja fuera del alcance de la
  migración de catálogo y lo califica como *"un defecto genuino; es captura de lead / notificación al
  ejecutivo, su propia historia"*.
- **Verificado contra el código hoy:** `backend/app/main.py:365` retorna
  `{"status": "success", "message": "Notificación enviada al ejecutivo exitosamente."}` sin escribir
  nada en ninguna parte. El frontend (`ProjectEvaluationModal.jsx:74`) muestra *"Un ejecutivo te
  contactará a la brevedad."* — E4 existe porque hoy ese mensaje es falso.
- El PLAN de origen menciona además un `email: "usuario@ejemplo.com"` hardcodeado. **Ese detalle ya no
  aplica:** el modal envía `contactEmail`. E3 se mantiene igual, porque un correo tipeado a mano sigue
  sin ser identidad verificada.
- Extiende el dashboard de [[HU2-priorizacion-leads|HU 2]] y consume el catálogo de
  [[HU7-catalogo-de-proyectos|HU 7]]. No es la integración con CRM: eso es
  [[HU12-derivacion-comercial|HU 12]] y sigue fuera de alcance.
- El canal de notificación (correo, in-app) es una decisión de producto pendiente. E2 se satisface con
  visibilidad en el dashboard; la notificación push queda supeditada a esa decisión.

---

## Estado frente al código

Historia propuesta, sin implementación.

| Criterio | Estado | Evidencia |
| :------- | :----- | :-------- |
| `E1` | ❌ | `backend/app/main.py:366` no persiste; retorna éxito directo. |
| `E2` | ❌ | `DashboardLeads.jsx` no tiene fuente de solicitudes ni estado de atención. |
| `E3` | ❌ | `ProjectEvaluationModal.jsx:77` envía `email` del formulario. |
| `E4` | ❌ | El mensaje de éxito es incondicional. |
