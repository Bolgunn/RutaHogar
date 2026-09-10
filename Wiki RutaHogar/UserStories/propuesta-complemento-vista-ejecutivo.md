# Propuesta — El complemento de renta en la vista del ejecutivo

> **Propuesta sin numerar.** En el dashboard del ejecutivo, el complemento de renta existe como una etiqueta y nada más. El ejecutivo no puede saber si un lead viene con co-deudor, quién es, ni si su renta se computó.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Importante |
| **Puntos de Historia** | 5 |
| **Actor** | Ejecutivo comercial |
| **Sprint** | — *(fuera del backlog numerado)* |
| **Estado** | Propuesta |

---

## Historia de usuario

> **Como** ejecutivo comercial, **quiero** ver si un lead se evaluó con co-deudor y con qué perfil, **para** preparar la derivación bancaria sabiendo quiénes firman y no descubrirlo en la reunión.

---

## Criterios de aceptación

### E1 - Señal y filtro en el panel

**Dado** que el ejecutivo revisa el panel priorizado, **cuando** un lead se haya evaluado con complemento de renta, **entonces** debe distinguirse de los leads evaluados en solitario y debe poder filtrarse la cartera por ese criterio.

### E2 - Perfil del co-deudor y si se computó

**Dado** que el ejecutivo abre el detalle de un lead con complemento, **cuando** revise sus antecedentes, **entonces** debe ver la relación declarada, la renta y deuda del co-deudor, su tipo de contrato, continuidad y morosidad, junto con si esa renta se consideró en el resultado y, si no, por qué.

### E3 - Riesgos propios del co-deudor

**Dado** que la evaluación arrojó riesgos asociados al complemento, **cuando** el ejecutivo revise el lead, **entonces** deben mostrarse junto a los del titular y no mezclados con ellos.

### E4 - Consentimiento del co-deudor

**Dado** que se muestran datos de un tercero, **cuando** el ejecutivo acceda al detalle del co-deudor, **entonces** debe respetarse el alcance del consentimiento declarado por el lead.

---

## Notas

- **Estado actual, verificado:** `DashboardLeads.jsx` menciona el complemento **una sola vez**, en
  `DashboardLeads.jsx:113`, como una etiqueta de un mapa de nombres
  (`complemento_renta: "Renta complementaria"`). No hay señal en el listado, no hay perfil del
  co-deudor, no hay filtro. Un ejecutivo que llama a un lead no sabe si va a haber una o dos firmas.
- **Es información comercialmente decisiva.** Dos leads con el mismo score no son el mismo caso si
  uno califica solo y el otro depende de que su co-deudor firme. E1 existe porque esa
  diferencia hoy es invisible en el momento en que se decide a quién llamar.
- **E3 tiene con qué construirse.** El motor ya emite riesgos separados del co-deudor:
  `complemento_morosidad_alta`, `complemento_deuda_alta`, `complemento_contrato_independiente`,
  `complemento_continuidad_baja`, `complemento_relacion_debil`, `complemento_tarjetas_excesivas`
  (`backend/app/scoring.py:765` y siguientes). Falta la superficie que los muestre, no las reglas.
- **E4 no es adorno.** El co-deudor es un tercero que no usó la plataforma. Mostrar sus datos a un
  ejecutivo es tratamiento de datos de un tercero y se rige por el consentimiento de
  [[HU1-ingreso-datos-financieros|HU 1]] E3 y por la privacidad mínima de los RNF. **Si el alcance
  del consentimiento actual no cubre este caso, se amplía antes de exponer el dato** — no se expone
  primero y se pregunta después. Vale la pena resolverlo en el grill.
- **No incluye contactar al co-deudor.** Esta historia expone antecedentes para preparar la
  derivación; el contacto y la derivación son [[HU12-derivacion-comercial|HU 12]], fuera de alcance.
- El dossier de [[HU25-exportacion-dossier\|HU 25]] hereda naturalmente estos campos cuando exista.

---

## Relación con otras historias

| Historia | Relación |
| :------- | :------- |
| [[HU2-priorizacion-leads\|HU 2]] | La extiende. E1 vive en su panel priorizado. |
| [[propuesta-transparencia-complemento-renta\|Transparencia del complemento de renta]] | La misma verdad contada al lead. Comparten fuente de datos y el mismo defecto de precondición. |
| [[HU27-revision-antecedentes\|HU 27]] | Los antecedentes del co-deudor son declarados, no verificados. La revisión referencial aplica igual a ellos. |
| [[HU25-exportacion-dossier\|HU 25]] | El dossier bancario necesita al co-deudor; sin esta historia no tiene de dónde sacarlo. |

> **⚠️ Precondición de correctitud — defecto §10.1.** La misma que
> [[propuesta-transparencia-complemento-renta|Transparencia del complemento de renta]]: `indicators.py:62` suma la renta del co-deudor
> pero `indicators.py:63` ignora su deuda, de modo que la capacidad de todo lead con complemento
> está sobreestimada. Un ejecutivo priorizando con ese número prioriza mal. **Se corrige antes o
> junto con esta historia.** Ver
> [Spike 1 E4 §10.1](../../docs/research/spike1-e4-lead-project-matching-criteria.md).

---

## Estado frente al código

Historia propuesta, sin implementación.

| Criterio | Estado | Evidencia |
| :------- | :----- | :-------- |
| `E1` | ❌ | `DashboardLeads.jsx:113` es la única mención del complemento; sin filtro. |
| `E2` | ❌ | El detalle no expone campos del co-deudor ni consume `ingreso_complementario_considerado`. |
| `E3` | ❌ | Los códigos `complemento_*` existen en el backend y no se renderizan en el panel. |
| `E4` | ❌ | Sin alcance de consentimiento definido para datos del co-deudor. |
