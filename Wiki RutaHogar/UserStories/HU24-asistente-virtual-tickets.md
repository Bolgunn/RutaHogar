# HU 24 - Asistente virtual y sistema de tickets para usuarios

> **🗓 Planificada - Sprint 3.** Un asistente responde dudas de uso y de conceptos financieros desde los manuales y la Academia Financiera, y si no basta, el usuario escala a soporte con un ticket que incluye su conversación.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | *(sin definir en el tablero)* |
| **Puntos de Historia** | 8 |
| **Actor** | Lead · Ejecutivo comercial · Administrador inmobiliario |
| **Sprint** | Sprint 3 |
| **Estado** | 🗓 Planificada |
| **Responsable** | Claudio — ver [[../Sprint3-Division\|División del Sprint 3]] |

---

## Historia de usuario

> **Como** usuario de la plataforma (administrador inmobiliario, ejecutivo, lead), **quiero** poder realizar preguntas a un asistente virtual sobre el uso de la aplicación o conceptos financieros, y poder escalar mi consulta mediante un ticket de soporte si la respuesta no es suficiente, **para** poder resolver mis dudas y continuar usando la plataforma sin bloqueos.

---

## Criterios de aceptación

### E1 - Ayuda durante la pre-evaluación

**Dado** que el usuario tenga problemas o dudas al realizar la pre-evaluación, **cuando** el usuario pregunte al asistente virtual, **entonces** el sistema debe explicar los pasos a seguir, el significado de los datos solicitados y dónde debe ingresarlos dentro de la interfaz.

### E2 - Respuesta desde la base de conocimientos

**Dado** que el usuario (ejecutivo, lead o administrador) tenga dudas sobre cómo usar las vistas de la plataforma o sobre conceptos financieros, **cuando** consulte al respecto, **entonces** el sistema debe generar una respuesta consultando la base de conocimientos (Manuales y Academia Financiera) y, de ser pertinente, adjuntar un enlace o botón que redirija a la sección exacta de la plataforma o al artículo de la academia.

### E3 - Oferta proactiva de soporte

**Dado** que el asistente entregue una respuesta a una consulta, **cuando** el usuario indique explícitamente que sigue teniendo dudas o que la respuesta no le sirvió, **entonces** el sistema debe ofrecerle proactivamente la opción de "Contactar a Soporte" (mediante un botón o acción rápida en el chat).

### E4 - Creación del ticket

**Dado** que el usuario seleccione la opción de "Contactar a Soporte", **cuando** confirme la acción, **entonces** el sistema debe crear un ticket internamente (registro en base de datos y/o envío de correo electrónico al administrador). Este ticket debe incluir automáticamente la identificación del usuario y el historial reciente de la conversación con el asistente, y el sistema debe confirmar al usuario que su solicitud fue enviada exitosamente.

---

## Notas

- El texto del tablero dice "historial reciente de la conversación con el sistema de tickets"; por contexto se refiere a la conversación con el asistente.
- Reutiliza `_ask_groq` de `backend/app/ai.py` y el contenido de [[HU5-academia-financiera|HU 5]]. La IA solo redacta respuestas: no calcula ni recalcula score.
- El correo al administrador comparte cliente con [[HU27-gestion-acceso-cuentas|HU 27]] y [[HU28-gestion-equipo-inmobiliaria|HU 28]] (hoy `ResendEmailClient` en `backend/app/lead_changes/email.py`).
