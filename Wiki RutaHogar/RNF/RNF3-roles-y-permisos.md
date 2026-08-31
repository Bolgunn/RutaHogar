# RNF 3 - Roles y permisos

> **Requisito no funcional.** El acceso a cada funcionalidad queda controlado por el rol del usuario.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Deseable |
| **Puntos de Historia** | 3 |
| **Atributo de calidad** | Seguridad |
| **Índice** | [[../AtributosDeCalidad|Atributos de calidad]] |

---

## Enunciado

> **Como** administrador desarrollador, **quiero** gestionar roles y permisos dentro de la plataforma, **para** controlar el acceso a las funcionalidades según el perfil de cada usuario.

---

## Criterios de verificación

### E1 - Asignación de rol

**Dado** que el administrador accede a la gestión de usuarios, **cuando** asigna un rol a una cuenta, **entonces** el sistema debe guardar el rol correctamente.

### E2 - Restricción de acceso

**Dado** que un usuario intenta acceder a una funcionalidad que no tiene permitida, **cuando** el sistema valida sus permisos, **entonces** debe bloquear el acceso.

### E3 - Vista según rol

**Dado** que un usuario inicia sesión, **cuando** accede a la plataforma, **entonces** debe ver solo las funcionalidades correspondientes a su rol.

---

## Notas

- Se relaciona con la salvaguarda S6 del handbook: los leads están acotados a su inmobiliaria y toda tabla con datos de lead o perfil necesita su política RLS.
- Los roles vigentes (`user`, `sales`, `admin`) se definen en `frontend/src/services/auth.js`.
