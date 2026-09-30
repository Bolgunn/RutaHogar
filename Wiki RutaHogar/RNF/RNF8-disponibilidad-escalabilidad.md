# RNF 8 - Disponibilidad y escalabilidad

> **Requisito no funcional.** El sistema se monitorea en producción y se valida bajo carga, garantizando al menos 95% de disponibilidad sin pérdida de datos.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Deseable |
| **Puntos de Historia** | 5 |
| **Atributo de calidad** | Disponibilidad / Escalabilidad |
| **Índice** | [[../AtributosDeCalidad|Atributos de calidad]] |

---

## Enunciado

> **Como** equipo de desarrollo / DevOps, **quiero** monitorear la disponibilidad del sistema y validar su comportamiento bajo carga, **para** garantizar un uptime mayor o igual a 95% y soportar al menos 100 evaluaciones sin pérdida de datos durante el período de prueba.

---

## Criterios de verificación

### E1 - Monitoreo de uptime

**Dado** que el sistema está desplegado en staging o producción, **cuando** transcurre el período de prueba, **entonces** debe existir un mecanismo de monitoreo que registre la disponibilidad evidenciando un uptime mayor o igual a 95%, con alertas ante caídas.

### E2 - Smoke tests posteriores al despliegue

**Dado** que se ejecuta un despliegue, **cuando** termina el pipeline, **entonces** deben correr smoke tests que verifiquen que los endpoints críticos (incluido `POST /score`) responden correctamente.

### E3 - Prueba de carga

**Dado** que se simulan al menos 100 evaluaciones, **cuando** se ejecuta la prueba de carga contra Supabase, **entonces** el sistema debe procesarlas sin pérdida de datos ni degradación que impida mostrar el score dentro del límite definido.

---

## Notas

- El límite de tiempo referido en E3 es el de [[../UserStories/HU3-scoring-hibrido|HU 3]] E1: 60 segundos.
