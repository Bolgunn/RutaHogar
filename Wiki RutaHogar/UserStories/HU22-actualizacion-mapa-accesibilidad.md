# HU 22 - Actualización dinamica del mapa de accesibilidad

> **🗓 Planificada - Sprint 3.** Refresca automáticamente el mapa de accesibilidad cuando el lead cambia sus condiciones financieras o sus preferencias de compra.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Opcional |
| **Puntos de Historia** | 5 |
| **Actor** | Lead |
| **Sprint** | Sprint 3 |
| **Estado** | 🗓 Planificada |

---

## Historia de usuario

> **Como** usuario que modifica sus condiciones financieras o preferencias de compra, **quiero** que el mapa de accesibilidad se actualice automáticamente, **para** comparar como cambian mis opciones de vivienda según mi score, renta, plazo o tipo de vivienda.

---

## Criterios de aceptación

### E1 - Reevaluación cuando se modifica el score/renta

**Dado** que un usuario ha mejorado su score o renta, **cuando** vuelva a ingresar al mapa, **entonces** el sistema debe volver a calcular los segmentos o proyectos y modificar los colores del mapa según corresponda.

### E2 - Actualización por palancas

**Dado** que el usuario ajusta plazo, tipo de vivienda o condición de primera vivienda, **cuando** modifica esos parámetros, **entonces** el mapa debe actualizar el resultado de accesibilidad.

---

## Notas

- Depende del mapa base ([[HU21-mapa-accesibilidad|HU 21]] / [[HU14-mapa-accesibilidad|HU 14]]).
