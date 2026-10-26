# HU 28 - Gestión de equipo de la inmobiliaria

> **🗓 Planificada - Sprint 3.** El administrador invita ejecutivos por correo, les asigna funciones y proyectos y activa o desactiva su acceso sin borrar su historial, con trazabilidad de cada cambio y sin poder tocar ejecutivos de otra inmobiliaria.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | *(sin definir en el tablero)* |
| **Puntos de Historia** | 5 |
| **Actor** | Administrador inmobiliario |
| **Sprint** | Sprint 3 |
| **Estado** | 🗓 Planificada |
| **Responsable** | Benjamín — ver [[../Sprint3-Division\|División del Sprint 3]] |

---

## Historia de usuario

> **Como** administrador inmobiliario, **quiero** gestionar a los ejecutivos que forman parte de mi organización, **para** controlar quién puede acceder a RutaHogar, qué función cumple y qué recursos comerciales tiene asignados.

---

## Criterios de aceptación

### E1 - Invitación y estado de incorporación

**Dado** que el administrador gestiona su equipo, **cuando** incorpore o modifique un miembro, **entonces** debe poder invitarlo por correo, consultar su estado de incorporación y administrar los datos organizacionales necesarios del ejecutivo.

### E2 - Funciones, proyectos y acceso

**Dado** que existen distintos ejecutivos dentro de una inmobiliaria, **cuando** el administrador gestione uno de ellos, **entonces** debe poder modificar las funciones permitidas, asignar o retirar proyectos según corresponda y activar, desactivar o reactivar su acceso sin eliminar su historial previo.

### E3 - Trazabilidad y aislamiento entre inmobiliarias

**Dado** que se realizan cambios sobre los ejecutivos, **cuando** se cree una invitación, cambie una asignación, rol o estado de acceso, **entonces** el sistema debe conservar quién realizó la acción, cuándo ocurrió y cuál fue el cambio, impidiendo además que un administrador gestione ejecutivos pertenecientes a otras inmobiliarias.

---

## Notas

- Parte de las cuentas de ejecutivo existentes (`supabase/migrations/20260731_executive_accounts.sql`, `inmobiliaria_id`) y del rol `admin_inmobiliario`.
- La desactivación de E2 la hace cumplir [[HU27-gestion-acceso-cuentas|HU 27]] al iniciar sesión; la bitácora de E3 es la misma que necesitan [[HU21-configuracion-comercial-priorizacion|HU 21]], [[HU22-centro-exportacion-dossier|HU 22]] y HU 27.
- E3 exige que las políticas RLS filtren por inmobiliaria. Ver el antecedente de políticas de `evaluations` rotas en producción antes de crear políticas nuevas.
