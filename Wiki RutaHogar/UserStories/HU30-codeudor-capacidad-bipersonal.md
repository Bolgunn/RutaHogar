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

> La historia y los criterios de arriba son la **transcripción del tablero**. El alcance operativo
> vigente está en la sección siguiente.

---

## Alcance operativo vigente

El equipo acordó una ampliación de HU 30 en el plan de trabajo
`docs/stories/HU30-capacidad-bipersonal/PLAN.md` (rama `feat/hu30-capacidad-bipersonal`). No agrega
un E3: precisa cómo se cumplen E1 y E2. **El plan es la fuente de las reglas**; aquí se resumen.

- **Qué significa "consideró válidamente".** `ingreso_complementario > 0` no basta. Una evaluación es
  **bipersonal confirmada** solo si registra la procedencia de la confirmación del co-deudor que
  usó **esa misma evaluación** y el motor consideró un ingreso complementario mayor que cero. Una
  confirmación posterior no reclasifica evaluaciones anteriores.
- **Lo que no es bipersonal confirmado.** Un complemento declarado por el titular y no confirmado
  (`lead_declared` / `not_confirmed`, que HU 18 admite) o de origen no verificable **no recibe el
  badge** ni se presenta como individual comprobado. En el filtro de E2 aparece solo en "Todos".
- **Aporte cero o negativo.** El aporte se calcula contra el mismo titular sin complemento. Puede ser
  positivo, cero ("Sin aumento de capacidad") o negativo ("Reducción de capacidad"); la tarjeta de E1
  no afirma siempre una capacidad "ganada".
- **Participación con cuenta y revisiones.** El co-deudor confirma desde una cuenta autenticada y
  puede confirmar revisiones sucesivas; el recálculo de la evaluación es siempre explícito.
- **Revocación y reemplazo.** Excluyen de inmediato los antecedentes de evaluaciones futuras. La
  consulta del desglose histórico se mantiene **30 días** desde el primer hecho que cerró el acceso
  y después se oculta, **sin borrar ni reescribir snapshots**.

Esto no rehace [[HU18-participacion-consentimiento-codeudor|HU 18]]: reutiliza su invitación,
consentimiento y estados.

---

## Notas

- **El título y la historia repiten los de [[HU18-participacion-consentimiento-codeudor|HU 18]].** Conviene que el equipo ajuste el título en el tablero (p. ej. "Capacidad bipersonal del co-deudor") para no confundirlas.
- Absorbe dos propuestas sin numerar: [[propuesta-transparencia-complemento-renta|Transparencia del complemento de renta]] (E1) y [[propuesta-complemento-vista-ejecutivo|Complemento en la vista del ejecutivo]] (E2).
- **La deuda del co-deudor ya se descuenta.** `calculate_financial_scope()` en `scoring_engine/indicators.py` suma `deuda_principal + deuda_complementaria_considerada`, y `purchase_capacity.py` usa ese total. El defecto §10.1 del Spike 1 es un antecedente histórico, no un prerrequisito de esta historia.
- Puntos de integración: la tarjeta de E1 va en `Recommendations.jsx` junto a `CoDebtorSection.jsx`, que es la pantalla de resultados activa (`Result.jsx` no está montado en el flujo actual). E2 toca `DashboardLeads.jsx`, `LeadDetailModal.jsx` y `ExecutiveCoDebtorSection.jsx`; el filtro comparte bloque con [[HU21-configuracion-comercial-priorizacion|HU 21]] y [[HU22-centro-exportacion-dossier|HU 22]].
