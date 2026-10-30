# ~~HU 27~~ (retirada) - Revisión referencial de antecedentes declarados

> **⛔ Reemplazada.** Esta historia ya no está en el backlog: el tablero del Sprint 3 (octubre 2026) renumeró el sprint y su alcance pasó a [[HU23-documentos-validacion-asistida|HU 23]]. Se conserva como antecedente; el número que tenía ahora pertenece a otra historia.

> **Descripción original.** Genera para el ejecutivo un resumen referencial de riesgo a partir de los antecedentes financieros declarados por el lead, sin consultar fuentes externas.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Deseable |
| **Puntos de Historia** | 5 |
| **Actor** | Ejecutivo comercial |
| **Sprint** | Sprint 3 |
| **Estado** | ⛔ Retirada del backlog |

---

## Historia de usuario

> **Como** ejecutivo comercial, **quiero** revisar de forma referencial los antecedentes financieros declarados por el lead, **para** identificar posibles riesgos antes de avanzar en una gestión comercial.

---

## Criterios de aceptación

### E1

**Dado** que el lead completó su preevaluación, **cuando** el ejecutivo solicite revisar antecedentes, **entonces** el sistema debe generar un resumen referencial basado en los datos declarados.

### E2

**Dado** que existen señales de riesgo, **cuando** se genere la revisión, **entonces** debe clasificarlas como Bajo, Medio, Alto o Crítico.

### E3

**Dado** que la revisión se basa en información declarada, **cuando** se muestre, **entonces** debe aclarar que no corresponde a una consulta oficial a la CMF.

### E4

**Dado** que el lead no posee datos suficientes, **cuando** se intente generar la revisión, **entonces** el sistema debe solicitar completar la información requerida.

---

## Notas

- E3 es lo que mantiene esta historia dentro del alcance: el handbook lista las APIs externas (CMF, Dicom, bancos) como fuera de alcance salvo encargo explícito. La revisión se basa únicamente en datos declarados.
- La salvaguarda S5 exige consentimiento explícito antes de cualquier consulta de datos financieros externos.
