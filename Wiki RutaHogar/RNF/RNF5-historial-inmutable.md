# RNF 5 - Historial de evaluaciones inmutable y versionado

> **Requisito no funcional.** Cada recálculo genera una evaluación nueva, versionada y enlazada a la anterior; ningún registro previo se modifica ni se borra.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Deseable |
| **Puntos de Historia** | 5 |
| **Atributo de calidad** | Trazabilidad |
| **Índice** | [[../AtributosDeCalidad|Atributos de calidad]] |

---

## Enunciado

> **Como** administrador inmobiliario, **quiero** que todo recálculo o ajuste de scoring genere una evaluación nueva, versionada e inmutable, enlazada a la anterior, **para** preservar un historial fiel y trazable que no pueda alterarse.

---

## Criterios de verificación

### E1 - Nueva versión por recálculo

**Dado** que ocurre un recálculo o ajuste de score (pago de deuda en [[../UserStories/HU13-seguimiento-mensual|HU 13]], cambio de configuración en [[../UserStories/HU23-parametros-scoring|HU 23]], simulación de subsidio en [[../UserStories/HU26-simulacion-subsidios|HU 26]]), **cuando** el sistema actualiza la evaluación, **entonces** debe crear un registro de evaluación versionado nuevo en vez de modificar el existente.

### E2 - Inmutabilidad y linaje

**Dado** que existe una evaluación previa, **cuando** se genera su sucesora, **entonces** el registro anterior debe permanecer inmutable (sin UPDATE ni DELETE) y quedar enlazado a la nueva versión.

### E3 - Trazabilidad del registro

**Dado** que una evaluación se persiste, **cuando** se guarda, **entonces** debe incluir fecha y hora, `scoring_version`, snapshot de los datos de entrada y el motivo del recálculo.

### E4 - Consistencia con la auditoría

**Dado** que un ejecutivo o administrador consulta el historial mediante [[RNF4-auditoria-tecnica|RNF 4]], **cuando** revisa una evaluación, **entonces** debe poder reconstruir la cadena de versiones en orden cronológico con su motivo.

---

## Notas

- Corresponde a la tabla [[../Database/evaluations|evaluations]], con sus columnas de versión y desglose por componente.
- Es la contraparte de [[../UserStories/HU3-scoring-hibrido|HU 3]] E5.
