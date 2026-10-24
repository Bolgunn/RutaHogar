# HU 30 - Participación y consentimiento de co-deudor

> **🗓 Planificada - Sprint 3.** Cuando el co-deudor sí sumó a la evaluación, el lead ve una tarjeta de "Capacidad Bipersonal" con el aporte de cada uno, y el ejecutivo identifica, filtra y revisa en paralelo a titular y co-deudor.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | *(sin definir en el tablero)* |
| **Puntos de Historia** | 3 |
| **Actor** | Lead · Ejecutivo comercial |
| **Sprint** | Sprint 3 |
| **Estado** | 🗓 Planificada |
| **Responsable** | Isaías — ver [[../Sprint3-Division\|División del Sprint 3]] |

---

## Historia de usuario

> **Como** lead que se evalúa con complemento de renta, **quiero** invitar a mi co-deudor a completar y confirmar sus propios datos, **para** que la evaluación se apoye en información que esa persona entregó y autorizó, y no en lo que yo supuse de ella.

---

## Criterios de aceptación

### E1 - Tarjeta de Capacidad Bipersonal

**Dado** que la evaluación consideró válidamente los ingresos del co-deudor (`ingreso_complementario > 0`), **cuando** el titular visualice la pantalla de resultados, **entonces** el sistema debe exhibir una tarjeta de "Capacidad Bipersonal" que desglose:

- ingreso del titular vs. ingreso aportado por el co-deudor;
- carga de deuda individual y deuda total consolidada;
- capacidad adicional en UF y pesos ganada gracias al complemento de renta;
- relación de parentesco o afinidad declarada (cónyuge, conviviente, padres, etc.).

### E2 - Co-deudor en la bandeja del ejecutivo

**Dado** que el ejecutivo comercial consulta la bandeja de leads priorizados, **cuando** revise el listado de prospectos, **entonces** debe contar con:

- un badge visual "Bipersonal" o "Con Co-deudor" visible;
- un filtro para aislar "Todos", "Titular Individual" o "Con Co-deudor";
- en el panel al abrir el expediente del lead, el desglose financiero en paralelo: titular (ingreso, deuda, contrato) vs. co-deudor (ingreso, deuda, contrato, morosidad), explicitando si el complemento sumó a la capacidad y qué riesgos específicos aporta.

---

## Notas

- **El título y la historia repiten los de [[HU18-participacion-consentimiento-codeudor|HU 18]]**, pero los criterios son otros: HU 18 construyó la invitación y el consentimiento; esta HU 30 **muestra** el resultado al lead y al ejecutivo. Conviene que el equipo ajuste el título en el tablero (p. ej. "Capacidad bipersonal del co-deudor") para no confundirlas.
- Absorbe dos propuestas sin numerar: [[propuesta-transparencia-complemento-renta|Transparencia del complemento de renta]] (E1) y [[propuesta-complemento-vista-ejecutivo|Complemento en la vista del ejecutivo]] (E2).
- La "deuda total consolidada" de E1 depende de que el cálculo descuente la deuda del co-deudor (defecto §10.1 del Spike 1). Verificar `scoring_engine/indicators.py` y `co_debtor_inputs.py` antes de mostrar el número.
- Toca `Result.jsx`, `DashboardLeads.jsx`, `LeadDetailModal.jsx` y `ExecutiveCoDebtorSection.jsx`. El filtro de E2 comparte bloque con [[HU21-configuracion-comercial-priorizacion|HU 21]] y [[HU22-centro-exportacion-dossier|HU 22]].
