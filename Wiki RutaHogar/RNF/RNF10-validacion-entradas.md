# RNF 10 - Validación de entradas

> **Requisito no funcional.** Toda entrada inválida, incompleta o fuera de rango se rechaza en el borde del sistema con un mensaje controlado.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Importante |
| **Atributo de calidad** | Seguridad |
| **Índice** | [[../AtributosDeCalidad|Atributos de calidad]] |

---

## Enunciado

> **Como** administrador del sistema, **quiero** que toda entrada se valide en el borde del sistema, **para** impedir que datos inconsistentes lleguen al motor de scoring o a la base de datos.

---

## Criterios de verificación

### E1 - Rechazo de entradas inválidas

**Dado** que un usuario completa formularios o consume endpoints, **cuando** envía datos inválidos, incompletos o fuera de rango, **entonces** el sistema debe rechazar la solicitud y mostrar un mensaje controlado.

---

## Notas

- El documento fuente lista este requisito por separado, aunque corresponde al criterio E1 de [[RNF1-seguridad-basica|RNF 1]]. Se documenta aparte por fidelidad al listado y se verifica una sola vez.
- El handbook lo fórmula como norma de arquitectura: validar en el borde y confiar en el interior.
