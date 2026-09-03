# RNF 6 - Experiencia móvil del lead

> **Requisito no funcional.** El lead puede completar su preevaluación, revisar su resultado y seguir su plan de mejora desde un teléfono, sin pérdida de funcionalidad respecto del escritorio.

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

> **Como** lead interesado en comprar vivienda, **quiero** completar mi preevaluación financiera y revisar mi resultado desde el teléfono, **para** conocer mi situación financiera de forma simple y rápida sin depender de un computador.

---

## Criterios de verificación

### E1 - Flujo de preevaluación responsivo

**Dado** que el lead accede desde un dispositivo móvil, **cuando** visualiza la landing, el formulario de preevaluación y la pantalla de resultado, **entonces** el sistema debe adaptar los elementos a la pantalla sin scroll horizontal ni pérdida de información.

### E2 - Formulario móvil usable

**Dado** que el lead completa su evaluación desde el teléfono, **cuando** ingresa datos financieros como ingresos, deudas, ahorro y situación laboral, **entonces** los campos deben ser legibles, fáciles de seleccionar y usar teclados apropiados para cada tipo de dato.

### E3 - Resultado financiero legible en móvil

**Dado** que el lead terminó su preevaluación desde el teléfono, **cuando** visualiza su score, clasificación, capacidad de compra y recomendaciones, **entonces** la información debe mostrarse de forma ordenada, priorizando los elementos más importantes.

### E4 - Plan de mejora accesible desde móvil

**Dado** que el lead tiene un plan de mejora activo, **cuando** accede desde un dispositivo móvil, **entonces** debe poder revisar sus hitos, registrar avances y ver su progreso sin perder funcionalidad respecto de la versión de escritorio.

### E5 - Validación en tamaños de pantalla móviles

**Dado** que se entrega la versión móvil del flujo del lead, **cuando** se ejecutan pruebas de interfaz, **entonces** debe verificarse su comportamiento en resoluciones representativas de teléfono, como 360x800, 390x844 y 430x932.

---

## Notas

- Cubre el flujo completo de [[../UserStories/HU1-ingreso-datos-financieros|HU 1]], [[../UserStories/HU3-scoring-hibrido|HU 3]], [[../UserStories/HU4-plan-de-mejora|HU 4]] y [[../UserStories/HU13-seguimiento-mensual|HU 13]] en pantalla pequeña.
