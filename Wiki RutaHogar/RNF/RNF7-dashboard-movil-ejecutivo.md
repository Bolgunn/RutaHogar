# RNF 7 - Dashboard móvil del ejecutivo

> **Requisito no funcional.** El ejecutivo comercial puede revisar y gestionar leads desde el teléfono, con las mismas restricciones de permisos que en escritorio.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Esencial |
| **Puntos de Historia** | 5 |
| **Atributo de calidad** | Facilidad de uso |
| **Índice** | [[../AtributosDeCalidad|Atributos de calidad]] |

---

## Enunciado

> **Como** ejecutivo comercial, **quiero** revisar y gestionar leads desde mi teléfono, **para** priorizar prospectos viables y hacer seguimiento comercial sin depender de un computador.

---

## Criterios de verificación

### E1 - Dashboard móvil basado en tarjetas

**Dado** que el ejecutivo accede al dashboard desde el teléfono, **cuando** visualiza la lista de leads, **entonces** el sistema debe mostrar la información como tarjetas adaptadas a pantalla móvil, evitando tablas difíciles de leer.

### E2 - Filtros móviles accesibles

**Dado** que el ejecutivo revisa leads desde el teléfono, **cuando** necesita filtrar por score, estado, prioridad, proyecto o clasificación, **entonces** los filtros deben estar disponibles en una sección colapsable o compacta sin saturar la pantalla.

### E3 - Información clave visible por lead

**Dado** que el ejecutivo visualiza la tarjeta de un lead, **cuando** revisa el dashboard móvil, **entonces** debe poder ver al menos nombre, clasificación, score, capacidad estimada, bloqueador principal y estado comercial.

### E4 - Acciones rápidas del ejecutivo

**Dado** que el ejecutivo revisa un lead desde su teléfono, **cuando** selecciona una tarjeta, **entonces** debe poder ejecutar acciones principales como ver detalle, cambiar estado, marcar seguimiento o reportar inconsistencia.

### E5 - Priorización clara en pantallas pequeñas

**Dado** que existen múltiples leads en el dashboard, **cuando** el ejecutivo accede desde móvil, **entonces** los leads de mayor prioridad deben distinguirse visualmente de los medios, bajos o descartados.

### E6 - Permisos de rol mantenidos

**Dado** que el dashboard móvil muestra información financiera de los leads, **cuando** un usuario accede desde el teléfono, **entonces** el sistema debe mantener las mismas restricciones de acceso y permisos que la versión de escritorio.

### E7 - Pruebas funcionales en dispositivos móviles

**Dado** que se entrega la versión móvil del dashboard, **cuando** se ejecutan las pruebas de aceptación, **entonces** debe validarse que las acciones principales funcionan correctamente en resoluciones móviles representativas.

---

## Notas

- E6 depende de [[RNF3-roles-y-permisos|RNF 3]]: la vista móvil no puede relajar los permisos.
- E4 se conecta con [[../UserStories/HU17-reporte-leads-inconsistentes|HU 17]] para la acción de reportar inconsistencia.
