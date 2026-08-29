# Reglas de scoring — RutaHogar

Este documento es el punto central para registrar reglas financieras, criterios de scoring, umbrales, formulas y decisiones de negocio asociadas al motor de evaluacion.

## Estado actual

No se modifica el scoring implementado. Este documento registra reglas vigentes para que las HUs que simulan compatibilidad no inventen umbrales durante la implementacion.

## Reglas vigentes referenciadas por HU6

Para HU6, la simulacion debe usar estas reglas ya documentadas en el proyecto:

- Pie minimo referencial: 10% del valor de vivienda.
- Pie recomendado referencial: 20% del valor de vivienda.
- Dividendo prudente referencial: hasta 25% del ingreso usado para capacidad.
- Carga alta de deuda: deuda mensual superior al 40% del ingreso mensual.

Estas reglas se usan para orientar compatibilidad de escenarios y no crean un scoring nuevo.

## Uso esperado

Actualizar este archivo solo cuando el equipo trabaje una HU o cambio que afecte:

- scoring financiero;
- clasificacion del lead;
- bloqueadores financieros;
- simulaciones de compatibilidad;
- matching lead-proyecto;
- beneficios habitacionales usados como regla o recomendacion;
- cambios al contrato `POST /score`.

## Guardrails

- No inventar umbrales financieros durante la implementacion.
- No reemplazar reglas auditables por decisiones de IA.
- La IA puede explicar resultados calculados, pero no decidir el score.
- Todo resultado financiero debe mantenerse como referencial.
- Cualquier regla nueva debe indicar fuente, justificacion y alcance.
