# RNF 9 - Manejo seguro de errores

> **Requisito no funcional.** Ningún error del backend expone trazas técnicas, consultas SQL, tokens ni datos sensibles al usuario.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Importante |
| **Atributo de calidad** | Seguridad |
| **Índice** | [[../AtributosDeCalidad|Atributos de calidad]] |

---

## Enunciado

> **Como** administrador del sistema, **quiero** que los errores del backend se devuelvan de forma controlada, **para** no filtrar detalles internos que faciliten un ataque.

---

## Criterios de verificación

### E1 - Respuesta de error controlada

**Dado** que ocurre un error en el backend, **cuando** el sistema responde al usuario, **entonces** no debe exponer trazas técnicas, consultas SQL, tokens ni datos sensibles.

---

## Notas

- El documento fuente lista este requisito por separado, aunque corresponde al criterio E2 de [[RNF1-seguridad-basica|RNF 1]]. Se documenta aparte por fidelidad al listado y se verifica una sola vez.
