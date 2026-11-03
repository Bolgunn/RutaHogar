# HU 27 - Gestión profesional de acceso y cuentas

> **🗓 Planificada - Sprint 3.** Registro e inicio de sesión con correo o Google sin cuentas duplicadas, verificación y recuperación con enlaces de vigencia limitada, y mensajes claros cuando el acceso está restringido.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | *(sin definir en el tablero)* |
| **Puntos de Historia** | 5 |
| **Actor** | Lead · Ejecutivo comercial · Administrador inmobiliario |
| **Sprint** | Sprint 3 |
| **Estado** | 🗓 Planificada |
| **Responsable** | Andrés — ver [[../Sprint3-Division\|División del Sprint 3]] |

---

## Historia de usuario

> **Como** usuario de RutaHogar, **quiero** contar con mecanismos seguros y simples para registrarme, iniciar sesión, recuperar mi cuenta y administrar mi acceso, **para** utilizar la plataforma de forma autónoma y mantener protegida mi información.

---

## Criterios de aceptación

### E1 - Registro e inicio de sesión sin duplicados

**Dado** que una persona desea acceder a RutaHogar, **cuando** se registre o inicie sesión, **entonces** debe poder utilizar correo y contraseña o un proveedor externo habilitado como Google, manteniendo una única cuenta asociada a su identidad y evitando la creación accidental de cuentas duplicadas.

### E2 - Verificación, recuperación y cierre de sesiones

**Dado** que el usuario necesita recuperar o proteger su cuenta, **cuando** corresponda, **entonces** el sistema debe permitir verificar su correo, recuperar o cambiar su contraseña y cerrar sus sesiones de forma segura, utilizando enlaces o mecanismos con vigencia limitada y sin exponer credenciales.

### E3 - Acceso restringido con mensajes comprensibles

**Dado** que una cuenta puede encontrarse sin autenticar, con una sesión vencida, deshabilitada o con credenciales incorrectas, **cuando** intente utilizar la plataforma, **entonces** el sistema debe restringir correctamente el acceso, redirigir al flujo correspondiente y mostrar mensajes comprensibles sin revelar información sensible sobre la cuenta o el sistema.

---

## Notas

- Extiende la autenticación de Supabase que ya existe (`AuthPanel.jsx`, `SetPassword.jsx`, `services/auth.js`); no es un sistema de autenticación nuevo.
- **Precedentes en producción:** activar "Confirm email" provocó `over_email_send_rate_limit` en `/registro` (2026-10-05), y el cierre de sesión global dejó a cuentas compartidas con `session_not_found` (PR #148). E2 toca ambos puntos.
- La cuenta "deshabilitada" de E3 es la misma que desactiva [[HU28-gestion-equipo-inmobiliaria|HU 28]]; acordar una sola columna de estado.
