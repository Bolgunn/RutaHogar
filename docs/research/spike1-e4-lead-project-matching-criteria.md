# Spike 1 · E4 — Lead–Project Matching Criteria

Reviewed: 2026-08-16
Scope: definition of the criteria, variables, thresholds and frozen contract for matching a lead against the real estate project catalog. Chilean mortgage underwriting norms as of August 2026.
Deliverable status: **criteria definition + frozen contract. No production code written.** Implementation is owned by [[UserStories/HU10-matching-lead-proyecto\|HU 10]].

Research tracks: independent desk research (Banco Central, CMF Educa, FOGAES, bank published terms) plus a parallel agent review of the existing `scoring_engine` against those norms. Where the two tracks disagreed, the divergence and its resolution are recorded in §11.

---

## Estado del documento

| | |
| :-- | :-- |
| **§1–§3** | **Historia.** El razonamiento y las fuentes tal como se investigaron el 2026-08-16. No se tocan. |
| **§4–§8** | **Enmendado.** Conserva el razonamiento; las reglas y los números viven ahora en `ALG-9` y `ALG-10`. Cada cambio está fechado y atribuido a su HU en el cuerpo. |
| **§9–§12** | **Historia.** Ejemplos, hallazgos y fuentes originales. §9 usa la aritmética previa a las enmiendas — ver la nota al inicio de esa sección. |

**Fuente normativa viva:** [`ALG-9` — capacidad de compra](../algorithms/ALG-9-purchase-capacity.md)
y [`ALG-10` — afinidad lead–proyecto](../algorithms/ALG-10-lead-project-affinity.md), con sus
`ALG-9-cases.json` y `ALG-10-cases.json` aseverados por el build. Donde este documento y un ALG
discrepen, **gobierna el ALG**. Este spike es el registro de por qué se decidió lo que se decidió.

> **Nota de rama.** El enlace a `ALG-8` (detector de beneficios, HU 8) resuelve recién cuando
> `develop` se mergea a `feature/sprint1/HU10` — paso 0 del plan. Sus tres constantes FOGAES tampoco
> existen en `constants.py` en esta rama todavía.

### Registro de cambios

| Fecha | HU | Sección | Qué cambió |
| :---- | :- | :------ | :--------- |
| 2026-08-16 | Spike 1 · E4 | — | Documento original: criterios, umbrales y contrato congelado |
| 2026-08-31 | HU 10 | §4.4 | Las constantes FOGAES pasan a reutilizarse de `ALG-8` (HU 8, PR #80) en vez de declararse aquí; se incorpora `FOGAES_MAX_UF_CON_SUBSIDIO = 3000` |
| 2026-08-31 | HU 10 | §4.5 | `plazo_efectivo < 5` deja de ser `requires_info` y pasa a ser el flag `plazo_bajo_minimo`; se agrega `plazo_efectivo <= 0` → `sin_capacidad` |
| 2026-08-31 | HU 10 | §5.1 | La compuerta de asequibilidad pasa a banda de cercanía (`UMBRAL_CERCANIA = 0,80`), con inclusión por capacidad asistida condicionada a `vivienda_nueva` |
| 2026-08-31 | HU 10 | §5.2 | La holgura pasa de rampa a U invertida de cuatro anclas; el peso de −45 estaba inerte en 8 de 10 proyectos del catálogo |
| 2026-08-31 | HU 10 | §5.2 · §7 | La comuna se evalúa contra `comunas_declaradas` (principal ∪ alternativa), resolviendo una contradicción con el filtro ya entregado de HU 2 |
| 2026-08-31 | HU 10 | §6.1 | Tercera regla de `precio_ref_uf` para pares en `matches` bajo `precio_min` |
| 2026-08-31 | HU 10 | §8.1 | Seis claves nuevas en `capacidad_supuestos`; `alcanza_precio_min` en `evidencia`; se registran dos inconsistencias del bloque de ejemplo original |
| 2026-08-31 | HU 10 | §8.2 · §8.3 | Ruta del módulo: `services/` → `lib/matching/`. Renumeración de historias: HU 13 → HU 10, HU 17 → HU 7 |
| 2026-08-31 | HU 10 | §8.4 | Se suma HU 8 como dependencia real |

---

---

## 1. What this document decides

**Source criterion** — Spike 1, E4, from [[informes_entregas/E4 - GPI Plan de Proyecto 2026|E4 — Plan de Proyecto 2026]]:

> **E4 – Definición de criterios para matching lead-proyecto.** Dado que el sistema debe recomendar leads compatibles con proyectos inmobiliarios, cuando el equipo investigue los criterios de compatibilidad comercial, entonces debe definir variables como capacidad estimada, comuna de interés, rango de precio, pie disponible, clasificación del lead y bloqueador principal.

| E4 variable | Resolved as | Section |
| :---------- | :---------- | :------ |
| Capacidad estimada | `capacidad_compra_estimada_uf` — preference-independent ceiling | §3, §4 |
| Comuna de interés | Soft affinity signal, never a gate | §5.2 |
| Rango de precio | `precio_min_uf` gate + holgura scorer against `precio_max_uf` | §5.1, §5.2 |
| Pie disponible | Savings anchor of the capacity ceiling at 20%; 10% as assisted-route flag | §4.3 |
| Clasificación del lead | Minority scorer (15 pts), deliberately outweighed by capacity | §5.2 |
| Bloqueador principal | Pair-specific, with a fixed resolution order | §6 |

### What this document does **not** decide

- **Scoring engine changes.** The financial score, its weights, and `classification` are untouched. E4 consumes them.
- **The `/score` contract.** Capacity is added as *new keys inside the existing* `financial_indicators` dict — additive only. No field removed, no type changed, no endpoint added (guardrail #5).
- **`PRECIOS_REFERENCIA_UF`.** Untouched (guardrail #7). The capacity model is preference-independent and does not read it.
- **Rate / UF / term scenarios.** Owned by [[UserStories/HU18-simulador-escenarios-hipotecarios\|HU 18]] and [[UserStories/HU29-comparador-costo-credito\|HU 29]]. Matching uses one base scenario (§8.2).
- **Subsidy eligibility rules.** Owned by Spike 1 E2 / [[UserStories/HU26-simulacion-subsidios\|HU 26]]. E4 only emits a flag (§4.4).
- **UI.** The lead card layout is HU 13's.

### What this document claims for reuse

`capacidad_compra_estimada_uf` is defined here but is **also the primitive Spike 1 E2 needs** for [[UserStories/HU6-simulacion-compatibilidad\|HU 6]] ("comparar capacidad de compra, valor de vivienda, ahorro, deuda y ajustes mínimos"). Whoever writes E2 must consume this definition rather than introduce a second capacity formula.

---

## 2. The reframing

The existing engine is **preference-anchored**. `property_value.py` resolves a single target property value from the lead's declared `comuna_objetivo` (or a declared value), and `project_fit.py` then asks *"can they afford this one thing?"*

That primitive cannot rank a catalog, and it cannot answer E4. Matching needs the inverse:

```
preference-anchored (today):   lead + declared objective  ->  fit verdict
preference-independent (E4):   lead                       ->  capacity ceiling  ->  ranked against N projects
```

**Consequence:** comuna and tipo are demoted from *inputs to the target* to *soft affinity signals*. A lead is matched on what they can afford first, and on what they said they wanted second. This is also what makes HU 13 E4 (re-orientable lead) computable at all — you cannot detect "they can buy something other than what they asked for" from a model that only evaluates what they asked for.

Both models coexist. `project_fit.py` keeps answering "does their own plan work", and its verdict is reused as an input to the re-orientable rule (§7).

---

## 3. Normative assumptions

Every constant carries provenance. Rows are split by **kind**, because market values go stale on a calendar while policy values only change when the team decides. Refreshing a rate must never silently overwrite a policy choice.

### 3.1 Market-sourced (goes stale)

| Constant | v1 value | Source | Consulted | Review |
| :------- | :------- | :----- | :-------- | :----- |
| `TASA_REFERENCIA_UF_ANUAL` | `0.040` | [Banco Central, serie F022.VIV.TIP.MA03.UF.Z.M](https://si3.bcentral.cl/siete/ES/Siete/Cuadro/CAP_TASA_INTERES/MN_TASA_INTERES_09/TSF_27?idSerie=F022.VIV.TIP.MA03.UF.Z.M) — jul-2026 = 4,00% (pub. 2026-08-07). Trajectory: 4,12% ene-26 → 3,96% may-26 → 3,97% jun-26 → ~4,06% jul-26 | 2026-08-16 | Quarterly |
| `PIE_RATIO_BASE` | `0.20` | LTV 80% is the standard, unconditional path across Chilean banks | 2026-08-16 | Annual |
| `PIE_RATIO_ASISTIDO` | `0.10` | [FOGAES — requisitos](https://fogaes.cl/sitio/requisitos/): 90% LTV, primera vivienda, tope UF 4.500. Bill approved ago-2026 raises the cap to UF 6.000, +30.000 cupos, validity extended to 31-may-2028 | 2026-08-16 | On legal change |
| `VALOR_UF_CLP` | repo: `40695` · actual 2026-08-16: `40854` | SII / Banco Central | 2026-08-16 | See §3.3 |

### 3.2 ScoreLeads policy (changes only by team decision)

| Constant | v1 value | Basis | Consulted | Review |
| :------- | :------- | :---- | :-------- | :----- |
| `RATIO_DIVIDENDO_MAX` | `0.30` | Internal consistency with `blockers.py:95` (`dividendo_exigente` fires *above* 0.30) and Bci's published FAQ criterion | 2026-08-16 | Only with the blocker |
| `RATIO_CARGA_TOTAL_MAX` | `0.45` | [CMF Educa](https://www.cmfchile.cl/educa/621/w3-article-27502.html) + `blockers.py:106` (`carga_total_alta`) | 2026-08-16 | Only with the blocker |
| `RATIO_DIVIDENDO_SALUDABLE` | `0.25` | CMF Educa; BancoEstado/Enlace Inmobiliario; Scotiabank. **Copy only — never used in calculation** | 2026-08-16 | — |
| `PLAZO_REFERENCIA_ANIOS` | `30` | Most commonly offered term (Bci, Scotiabank, BancoEstado 8–30). Overridable by a declared `plazo_credito_hipotecario` | 2026-08-16 | — |
| `EDAD_MAX_FIN_CREDITO` | `70` | ScoreLeads policy: `blockers.py:173` + [[UserStories/HU29-comparador-costo-credito\|HU 29]] E2. **More conservative than the market** (Renta Nacional 76a364d; Scotiabank up to 79 with insurance) — deliberately kept | 2026-08-16 | — |
| `PLAZO_MINIMO_VIABLE_ANIOS` | `5` | Below this the quote is not meaningful → `requires_info` | 2026-08-16 | — |

### 3.3 Canonical unit: UF

Projects are priced in UF (`precio_min_uf` / `precio_max_uf`) and the mortgage rate is UF-denominated, so **capacity is stored in UF** and CLP is a display conversion carrying the UF value and its date.

This makes the hardcoded `VALOR_UF_CLP = 40695` (0,39% stale vs. $40.854 on 2026-08-16) a **display-precision** issue, not a matching-correctness one — the ranking is computed entirely in UF. It still drifts and should eventually be injected daily rather than hardcoded, but that is not E4's to fix.

### 3.4 The 25% / 30% question, resolved

The two research tracks disagreed here, and the resolution is deliberate:

- **25%** is the published prudential norm (CMF Educa, BancoEstado, Scotiabank) and is what `project_fit.py`'s `required_income = dividendo_estimado * 4` already implies.
- **30%** is what `blockers.py` actually enforces — `dividendo_exigente` only fires *above* 0.30.

A capacity ceiling built at 25% would declare leads unable to afford projects that the engine's own blocker rules consider unproblematic. Two thresholds inside one engine disagreeing about the same ratio undermines the "auditable, versioned rules" mandate.

**Resolution:** `0.30` is the calculation ceiling; `0.25` is retained as UX language only.

| Band | Label shown |
| :--- | :---------- |
| ≤ 25% | Holgado |
| 25–30% | Viable pero exigente |
| > 30% | Fuera de política ScoreLeads |
| deuda + dividendo > 45% | No avanzar sin revisión |

---

## 4. The capacity model

> **⚠️ Enmendado — 2026-08-31 · HU 10.** Esta sección definía las reglas; ahora las **referencia**.
> La fuente normativa viva es [`ALG-9`](../algorithms/ALG-9-purchase-capacity.md). Lo que sigue
> conserva el razonamiento del spike y marca dónde HU 10 cambió una regla y por qué. Los números
> viven en ALG-9 y en `constants.py`, no aquí — dos copias normativas del mismo número es
> exactamente lo que se desincroniza.

Chilean banks underwrite against two independent gates — what you can service, and what you can put
down. Capacity is the lesser of the two, and **which side binds is itself a first-class output**.
Ese encuadre sobrevive intacto: es `ALG-9` R1–R3.

| Sub-sección | Estado | Dónde vive ahora |
| :---------- | :----- | :--------------- |
| §4.1 Dividendo máximo sostenible | **Vigente sin cambios** | `ALG-9` R1 |
| §4.2 Plazo efectivo | **Vigente sin cambios** | `ALG-9` R2 |
| §4.3 Techo de capacidad | **Vigente sin cambios** | `ALG-9` R3 |
| §4.4 Ruta asistida (FOGAES) | **Vigente**, con constantes reasignadas | `ALG-9` R4 · constantes de `ALG-8` |
| §4.5 Casos borde | **Enmendado en una fila** | `ALG-9` "Invariants and edge cases" |

### 4.4 — constantes reasignadas · 2026-08-31 · HU 10

El spike especificaba `PIE_RATIO_ASISTIDO` y un tope FOGAES propios. **HU 8 (PR #80) ya los tenía**:
`FOGAES_MIN_PIE_RATIO`, `FOGAES_MAX_PROPERTY_UF` y `FOGAES_MAX_UF_CON_SUBSIDIO` viven en
`constants.py` bajo [`ALG-8`](../algorithms/ALG-8.md). HU 10 los **reutiliza**; declarar copias
propias habría dado dos versiones de un mismo número regulatorio. Ver `ALG-9` A7.

`FOGAES_MAX_UF_CON_SUBSIDIO = 3000` es información que el spike no tenía: el tope se reduce a la
mitad si FOGAES se combina con un subsidio habitacional. `ALG-10` lo transporta pero **no lo aplica**
— nada en el contrato de `/score` dice si un lead tiene subsidio (`ALG-10` A9).

### 4.5 — `plazo_efectivo < 5` deja de ser un rechazo · 2026-08-31 · HU 10

**El spike decía:** `plazo_efectivo < PLAZO_MINIMO_VIABLE_ANIOS` → `capacidad_status =
"requires_info"`, capacidad `null`.

**Ahora:** se calcula igual, con `capacidad_supuestos.plazo_bajo_minimo = true`. `requires_info`
queda reservado a **datos faltantes de verdad**: `ingreso_total <= 0`, o un snapshot histórico que el
backfill no puede completar.

Tres razones, desarrolladas en `ALG-9` R2 y A4:

1. **No es una brecha de datos.** Están todos los campos; calculamos un plazo y no nos gustó.
   `requires_info` le pide al ejecutivo que vaya a buscar información que ya existe.
2. **El spike se contradecía.** §10.3 dice que la copia para el tope de edad debe leerse *"requiere
   revisión de plazo/seguro"* y no *"no viable"* — o sea, blando y accionable. §4.5 lo volvía un
   `null` duro.
3. **Creaba un acantilado de un año que el motor no comparte.** `blockers.py:173` levanta
   `edad_plazo_riesgoso` con severidad **media** por este mismo hecho. Un lead de 65 que pide 30 años
   se capa a 5, calcula y rankea; uno de 66 se capa a 4 y, bajo §4.5, desaparecía de todos los
   proyectos.

Se agrega además la fila `plazo_efectivo <= 0` (edad ≥ 70) → `capacidad_por_renta_uf = 0`, capacidad
`0`, `sin_capacidad`. No existe hipotecario a cero años; el lado pie, que es independiente del plazo,
se sigue reportando.

---

## 5. Matching criteria

> **⚠️ Enmendado — 2026-08-31 · HU 10.** Las dos sub-secciones cambiaron. Fuente normativa viva:
> [`ALG-10`](../algorithms/ALG-10-lead-project-affinity.md) R1 y R2.

El reencuadre de §2 se mantiene y es lo que sostiene todo lo demás: **comuna, tipo y clasificación
financiera nunca son compuertas.** Se puntúan.

### 5.1 — la compuerta de asequibilidad pasa a ser una banda · 2026-08-31 · HU 10

**El spike decía:** `capacidad_compra_estimada_uf < proyecto.precio_min_uf` → par excluido.

**Ahora** (`ALG-10` R1): el par se excluye solo bajo `UMBRAL_CERCANIA × precio_min_uf` (0,80), y la
prueba de inclusión puede usar `capacidad_asistida_uf` cuando el lead **declaró `vivienda_nueva`** y
el proyecto cae bajo el tope FOGAES con el pie ya cubierto. **El ranking sigue usando siempre la
capacidad conservadora** — la ruta asistida decide *si el lead aparece*, nunca *qué tan alto*.

El motivo es que la capacidad de `ALG-9` es un piso, no un techo: asume 20% de pie donde el mínimo
regulatorio con FOGAES es 10%, tope de edad 70 donde la banca llega a 76–79 con seguro, y solo el
ahorro declarado. Un lead un UF bajo `precio_min` no es incapaz de comprar; es incapaz *bajo tres
capas de pesimismo deliberado*. El caso concreto: perfil de entrada con capacidad 1.474 UF y
capacidad asistida 2.574 UF frente a un proyecto de 2.100 UF — el segmento primera vivienda, que la
compuerta dura descartaba entero.

**Consecuencia que la UI debe cargar:** `matches` ahora contiene pares que el lead no puede pagar
*bajo los supuestos declarados*. `evidencia.alcanza_precio_min` es `false` exactamente en esas filas
y el panel **debe** distinguirlas.

Las compuertas que sí quedan son dos: bloqueador crítico (`commercial_priority.py` ya se niega a
derivarlos) y capacidad genuinamente fuera de alcance. Se suma una **precondición**, no una
compuerta: `capacidad_status = "requires_info"` no es rankeable (`ALG-10` A2).

### 5.2 — la holgura pasa de rampa a U invertida · 2026-08-31 · HU 10

**El spike decía:** penalización lineal desde −45 en `precio_min` hasta **0 en/sobre `precio_max`**.

**El problema, medido contra el catálogo real:** de los 10 proyectos disponibles de la inmobiliaria
demo, **8 son de precio único** (`precio_min_uf == precio_max_uf`, seed CATALOGO-UNICO). En un
proyecto de precio único la rampa no interpola nunca: o la capacidad no alcanza y el par se excluye,
o alcanza y la penalización es exactamente 0. **El peso de −45 — el que carga E2 — quedaba inerte en
el 80% del catálogo**, y el ranking colapsaba a comuna + tipo + clasificación, es decir, exactamente
el re-ordenamiento del panel de HU 2 que este spike existe para evitar.

**Ahora** (`ALG-10` R2.1): cuatro anclas, continua, de un solo pico —
`UMBRAL_CERCANIA × precio_min` → −60 · `precio_min` → −45 · `precio_max` → −12 ·
`PEAK_RATIO × precio_max` → **0** · `≥ SOBRECALCE_SATURACION × precio_max` → −20.

Tres razones que el spike no podía ver:

- **El pico no va en `precio_max`.** La capacidad se calcula a `RATIO_DIVIDENDO_MAX = 0,30`, y la
  propia tabla de bandas de §3.4 llama a 30% *"viable pero exigente"* — solo ≤25% es *"holgado"*.
  Poner el pico ahí haría que la primera recomendación del panel en todo proyecto de precio único
  fuera el lead que el motor mismo califica de exigente. El desplazamiento es **derivado, no
  inventado**: `RATIO_DIVIDENDO_MAX / RATIO_DIVIDENDO_SALUDABLE = 0,30 / 0,25 = 1,20`. Le da además
  un trabajo a `RATIO_DIVIDENDO_SALUDABLE`, que §3.2 define y luego declara "copy only".
  **Limitación conocida:** la derivación es exacta solo para leads limitados por renta (`ALG-10` A7).
- **`precio_max` cuesta −12, no 0.** El modelo ignora gastos operacionales (escritura, notaría,
  conservador, tasación, impuesto al mutuo: 2–3% del precio). Un lead con margen cero llega corto a
  la firma.
- **La saturación va en 3,0 y no en 2,0.** Un lead con 2× el precio del proyecto no es una
  distracción: es el perfil inversionista estándar — comprar barato, arrendar, dividendo bajo — más
  padres comprando para un hijo. Penalizarlo como "está mirando otra cosa" descarta uno de los
  mejores segmentos en un proyecto económico.

**E2 acota el extremo superior matemáticamente:** un `Medio` saturado puntúa
`100 − SOBRECALCE_MAX − 8` contra un `Alto` en `precio_min` que puntúa 55,0. E2 se rompe en
`SOBRECALCE_MAX >= 37`. Queda como invariante 8 de `ALG-10` para que un re-calibrado futuro no lo
cruce en silencio.

### 5.2 / §7 — la comuna alternativa es una segunda declaración · 2026-08-31 · HU 10

**El spike decía:** penalizar −15 cuando `comuna_objetivo` fue declarada y ≠ `proyecto.comuna`.
Ignora `comuna_alternativa`.

**El problema:** `DashboardLeads.jsx:225-227` — código en producción, HU 2 — filtra con
`if (main !== filterCommune && alt !== filterCommune) return false`, y `DashboardLeads.jsx:196-204`
arma el desplegable de comunas con **ambas**. La pantalla del ejecutivo ya trata la alternativa como
coincidencia plena. Bajo la regla del spike, el *mismo componente* lista al lead bajo Macul y, un
clic después, le descuenta 15 puntos por no querer Macul y lo marca "reorientable" hacia una comuna
que el lead escribió en el formulario.

**Ahora** (`ALG-10` R2.2): `comunas_declaradas = {principal} ∪ {alternativa}`. La penalización y la
rama 3a de reorientable leen el mismo conjunto. Cero constantes nuevas. La señal que esto aplana —
que la principal *sí* se prefiere — se recupera en `ALG-10` R6 como **desempate**, no como peso.

Los pesos de comuna (−15) y tipo (−10) **no cambian**. Quedó registrada una discrepancia: la
intuición comercial dice que el tipo es la preferencia más rígida (se transa comuna por precio todo
el tiempo — para eso existe `reorientable` — pero una familia que quiere casa rara vez acepta
departamento). No se invirtió porque dos fuentes independientes ya ordenan comuna > tipo: este spike
y el desempate de `compatibility.js:545-546`. Es una pregunta barata y nítida para HU 16.

---

## 6. Bloqueador principal

> **⚠️ Enmendado — 2026-08-31 · HU 10.** Una fila nueva en §6.1. Fuente normativa viva:
> [`ALG-10`](../algorithms/ALG-10-lead-project-affinity.md) R3.

El razonamiento se mantiene entero: el bloqueador es **por par, no por lead**. Un lead que despeja un
proyecto de 2.500 UF pero está bloqueado por pie en uno de 4.000 tiene bloqueadores *distintos* en
las dos tarjetas, y mostrar uno genérico a nivel de lead no le dice nada accionable al ejecutivo.

También se mantiene, sin cambios, la guarda que sostiene todo: **`brecha_valor_uf > 0` en los pasos
2–3**. `restriccion_vinculante` siempre está definida cuando la capacidad calcula, así que sin la
guarda los pasos 2–3 dispararían para todo par y un lead cómodamente sobre `precio_max` vería un
`pie_insuficiente_para_proyecto` fabricado.

### 6.1 — tercera regla de `precio_ref_uf` · 2026-08-31 · HU 10

El spike tenía dos casos: par en `matches` → `precio_max_uf`; par en `excluidos` → `precio_min_uf`.
La banda de cercanía de §5.1 creó un tercero: **un par en `matches` que está bajo `precio_min`**. Usa
`precio_min_uf`. Con la regla vieja se le cotizaría la brecha hasta el *techo* del rango antes de
haber alcanzado el piso — sobreestimando lo que necesita por el ancho completo del proyecto.

---

## 7. Re-orientable opportunity

> **⚠️ Enmendado — 2026-08-31 · HU 10.** Solo la rama 3a, por §5.2. Fuente normativa viva:
> [`ALG-10`](../algorithms/ALG-10-lead-project-affinity.md) R4.

La regla se mantiene: un par es `reorientable` si pasa las compuertas, tiene `afinidad >= 45`, y hay
al menos una divergencia. **`commercial_priority.py` sigue intacto** — el panel de HU 2 no cambia y
ninguna ruta de `/score` ya entregada necesita re-verificación.

**Cambio en la rama 3a:** ahora dispara cuando `proyecto.comuna` está **fuera de
`comunas_declaradas`** (§5.2), no solo cuando difiere de la principal. Un proyecto en una comuna que
el lead nombró explícitamente no es una reorientación bajo ninguna lectura: ya apuntó ahí.

La consecuencia declarada del spike se mantiene y sigue siendo intencional: un lead sin comuna
declarada no puede disparar la rama 3a, y si `property_value` no resuelve, su `project_fit.status` es
`requires_info` y no `out_of_reach`, así que la rama 3b tampoco. **Nunca es reorientable.** No se
puede reorientar a alguien que nunca declaró una dirección.

---

## 8. Frozen contract

> **⚠️ Enmendado — 2026-08-31 · HU 10.** El contrato **creció de forma aditiva** y la ruta del módulo
> frontend cambió. Fuente normativa viva: [`ALG-9`](../algorithms/ALG-9-purchase-capacity.md)
> "Inputs → outputs" y [`ALG-10`](../algorithms/ALG-10-lead-project-affinity.md) "Inputs → outputs".
> Ninguna clave del spike fue eliminada, renombrada ni cambió de tipo.

### 8.1 — claves nuevas en `capacidad_supuestos` · 2026-08-31 · HU 10

Las nueve claves aditivas dentro de `financial_indicators` se mantienen exactamente como estaban.
`capacidad_supuestos` suma seis: `ratio_dividendo_max`, `ratio_dividendo_saludable`,
`fogaes_tope_uf`, `fogaes_tope_con_subsidio_uf`, `fogaes_pie_ratio` y `plazo_bajo_minimo`.

Todas por una sola razón: **§8.3 prohíbe que el frontend re-declare constantes de capacidad**, y la
matemática por par de `ALG-10` necesita varias — `RATIO_DIVIDENDO_MAX` para la brecha de recurso,
`RATIO_DIVIDENDO_SALUDABLE` para derivar el pico de holgura, y los tres topes FOGAES más el pie
asistido para la prueba por proyecto. Viajando dentro de `capacidad_supuestos`, `ALG-10` re-declara
**solo los pesos de afinidad**, que es justo el presupuesto de duplicación que §8.3 permite — y cada
valor queda auditado junto al número que produjo. Ver `ALG-9` A6.

`MatchRow.evidencia` suma `alcanza_precio_min` (§5.1). `capacidad_supuestos` **no** lleva
`vivienda_nueva`: es un campo declarado de intake, no un supuesto de cálculo, y `ALG-10` lo lee del
snapshot.

**Nota sobre el bloque de ejemplo original de §8.1.** Sus números estaban calculados a UF = 40.854
mientras el mismo bloque registraba `uf_value_clp: 40695`, y mostraba
`capacidad_compra_estimada_uf = 3060.4` junto a `capacidad_por_pie_uf = 3059.6` cuando el invariante
2 de `ALG-9` exige que sean iguales si el pie es la restricción. Ambas son inconsistencias del
ejemplo ilustrativo, no reglas. `ALG-9-cases.json` las resuelve pasando `uf_value_clp` explícito en
cada caso.

### 8.2 / 8.3 — la ruta del módulo · 2026-08-31 · HU 10

**El spike decía:** `frontend/src/services/leadProjectMatching.js`.

**Ahora:** `frontend/src/lib/matching/leadProjectMatching.js`. El handbook reserva `lib/` para lógica
pura y la llama "el único lugar donde puede implementarse un algoritmo". La razón que el spike daba
para "frontend" era el guardrail #5 (sin endpoints FastAPI nuevos) — un argumento frontend/backend
que `lib/` honra igual. Precedente: `lib/simulation/compatibility.js`.

El resto de §8.3 se mantiene: el backend calcula la capacidad, el frontend hace el join contra el
catálogo, y el costo conocido — dos fuentes de constantes — sigue confinado a los pesos de afinidad.

**Corrección de numeración.** Este documento fue escrito cuando las historias tenían otra numeración.
Donde §8 decía "HU 13" léase **HU 10**; donde decía "HU 17" léase **HU 7**.

### 8.4 Dependency status — actualizado · 2026-08-31 · HU 10

HU 7 sigue siendo prerrequisito y su contrato congelado se consume tal cual (`precio_min_uf`,
`precio_max_uf`, `comuna`, `tipo`, `estado`, `ejecutivos`). Se suma **HU 8 (PR #80, mergeado)** como
dependencia real: HU 10 reutiliza sus tres constantes FOGAES y la forma de su regla `_detect_fogaes`,
re-evaluada por proyecto en lugar de contra el objetivo declarado (`ALG-10` R5).

Las dos notas de consumo del contrato siguen siendo determinantes, y la segunda más que antes:

- **`getAvailableProjects()` excluye solo `agotado`.** `en_construccion` sigue en el feed y `estado`
  viaja; no es una tercera compuerta.
- **`precio_min_uf == precio_max_uf` es válido.** Ya no es solo un caso borde a no romper: es la
  forma de **8 de los 10 proyectos disponibles** del catálogo demo, y fue lo que dejó inerte la
  rampa de holgura del spike (§5.2).

---

## 9. Worked examples

> **Historia — aritmética previa a las enmiendas de 2026-08-31 (HU 10).** Los perfiles de capacidad
> de §9.1 siguen siendo válidos (§4.1–§4.3 no cambiaron). Los de afinidad de §9.2 **ya no** — usan la
> rampa de holgura anterior y la regla de comuna anterior. Los equivalentes vigentes, recalculados y
> aseverados por el build, están en `ALG-10-cases.json`. Se conservan porque muestran el
> razonamiento con el que se eligieron los pesos originales.

UF = $40.854,01 (2026-08-16) · tasa 4,0% · pie 20% · LTV 80%

### 9.1 Capacity

**Perfil 1 — entrada.** Ingreso $1.500.000 · deuda $100.000 · ahorro $12.000.000 · edad 32 · plazo 30

```
min(0,30 × 1.500.000 ; 0,45 × 1.500.000 − 100.000) = min(450.000 ; 575.000) = $450.000 = 11,01 UF
principal            = 11,01 × 209,466 = 2.307 UF
capacidad_por_renta  = 2.307 / 0,80    = 2.884 UF
capacidad_por_pie    = (12.000.000 / 0,20) / 40.854 = 1.468 UF
capacidad            = 1.468 UF ($60,0 MM)   restriccion_vinculante = "pie"
```

**Perfil 2 — medio.** Ingreso $2.500.000 · deuda $300.000 · ahorro $25.000.000 · edad 38 · plazo 30

```
min(750.000 ; 825.000) = $750.000 = 18,36 UF
principal            = 3.845 UF
capacidad_por_renta  = 4.807 UF
capacidad_por_pie    = 3.060 UF
capacidad            = 3.060 UF ($125,0 MM)  restriccion_vinculante = "pie"
```

**Perfil 3 — alto.** Ingreso $5.500.000 · deuda $500.000 · ahorro $80.000.000 · edad 42 · plazo declarado 25

```
min(1.650.000 ; 1.975.000) = $1.650.000 = 40,39 UF
principal            = 7.652 UF
capacidad_por_renta  = 9.565 UF
capacidad_por_pie    = 9.791 UF
capacidad            = 9.565 UF ($390,7 MM)  restriccion_vinculante = "renta"
```

**Plausibility.** 1.468 UF only reaches very economical housing, peripheral comunas, or a subsidised route. 3.060 UF is plausible for entry/mid projects in Puente Alto, San Bernardo, Cerrillos, La Florida, Estación Central — but not Ñuñoa/Providencia/Las Condes. 9.565 UF reaches upper-segment Ñuñoa, Providencia, lower Las Condes, but not upper Vitacura/Lo Barnechea.

### 9.2 Affinity

Perfil 2 (capacidad 3.060 UF, `Medio`, `comuna_objetivo = Ñuñoa`, blocker `pie_insuficiente` high) vs. **Altos de Macul** — Macul, departamento, 2.400–3.200 UF:

```
gates:      3.060 >= 2.400 OK  ·  no critical blocker  OK
holgura:    (3.060-2.400)/(3.200-2.400) = 0,825  ->  -45 × (1-0,825)  = -7,9
comuna:     Ñuñoa != Macul                                            = -15,0
tipo:       departamento == departamento                              =   0,0
clasif.:    Medio                                                     =  -8,0
blockers:   pie_insuficiente (high)                                   =  -7,0
                                                              afinidad = 62,1  -> "Cercano"

reorientable = true            (gates OK · 62,1 >= 45 · comuna diverges)

precio_ref      = precio_max = 3.200 UF        (pair is in `matches`)
brecha_valor    = max(0 ; 3.200 − 3.060) = 140,4 UF     > 0  -> step 2 fires
bloqueador      = pie_insuficiente_para_proyecto        (restriccion = "pie")
brecha_recurso  = 140,4 × 0,20 × 40.854 ≈ $1,15 MM in additional savings
```

That gap figure is the deliverable's payoff: the executive is told the lead needs roughly **$1,15 MM more in savings** to reach the top of this project's range — not merely that they are "Medio".

**Contrast — same lead vs. Parque Lo Espejo** (Lo Espejo, departamento, 1.800–2.600 UF), which demonstrates the §6.2 guard:

```
gates:      3.060 >= 1.800 OK  ·  no critical blocker  OK
holgura:    capacidad 3.060 >= precio_max 2.600  ->  no penalty          =   0,0
comuna:     Ñuñoa != Lo Espejo                                           = -15,0
tipo:       departamento == departamento                                 =   0,0
clasif.:    Medio                                                        =  -8,0
blockers:   pie_insuficiente (high, lead-level)                          =  -7,0
                                                                afinidad = 70,0  -> "Compatible"

precio_ref      = 2.600 UF
brecha_valor    = max(0 ; 2.600 − 3.060) = 0            -> steps 2-3 SKIPPED
bloqueador      = pie_insuficiente                       (step 4: lead-level blocker)
brecha_recurso  = null
```

The lead clears this project's entire price range, so no pair-scoped shortfall is reported. Without the `brecha_valor_uf > 0` guard the card would have claimed `pie_insuficiente_para_proyecto` here — a blocker that does not exist for this pair. The same lead legitimately shows **different** main blockers on the two cards, which is the whole reason §6 is pair-scoped.

### 9.3 Sensitivity — why no band is carried

`capacidad_por_renta_uf` for Perfil 2 across the plausible rate/term grid:

| | 20 años | 25 años | 30 años |
| :-- | --: | --: | --: |
| **3,5%** | 3.956 | 4.584 | 5.110 |
| **4,0%** | 3.787 | 4.347 | **4.807** |
| **5,0%** | 3.477 | 3.925 | 4.275 |

`capacidad_por_pie_uf` = **3.060 UF** in every cell. Since capacity is the `min()`, **Perfil 2's capacity is 3.060 UF regardless of rate or term.** For Perfil 3 (income-bound) the same grid moves capacity 8.636–9.791 UF, about ±6%.

So the rate assumption is worth ~0–6% while the pie ratio choice (10% vs 20%) is worth **2×**. A displayed band would imply precision the self-declared inputs do not support, and ranking needs a total order anyway — collapsing a band back to one number just relocates the decision into HU 13 undocumented. Scenarios belong to HU 20; matching uses one base case.

---

## 10. Findings on existing code

Raised by this research, **outside E4's scope to fix**. Recorded so they are decided rather than inherited silently.

### 10.1 Complementary debt is dropped — capacity inflation

`indicators.py` adds validated complementary *income* to `ingreso_total`, but `deuda` remains `deuda_mensual` alone. `_valid_complement_income()` **requires** `deuda_mensual_complementario` to be declared, then discards it.

Every ratio and every capacity figure for a lead with a complemento is therefore **overstated**. §4.1 specifies `deuda_total` including the complementary side; if `indicators.py` is not corrected, the capacity model inherits the inflation. **Recommend routing to HU 3 / HU 15 as a defect.**

### 10.2 `project_fit.py` vs `blockers.py` — 25% vs 30%

Not a bug; two policies. Resolved in §3.4 (30% calculates, 25% speaks). If `project_fit.py` is ever revised, `required_income = dividendo_estimado * 4` should be reconciled with the total-burden rule rather than left as a lone 25% ratio.

### 10.3 `edad_fin_credito > 70` is conservative — intentionally

The market allows 76–79 with insurance. HU 26 E2 independently specifies 70. **Keep it**, but the commercial copy should read *"requiere revisión de plazo/seguro"* rather than *"no viable"*.

### 10.4 `VALOR_UF_CLP` hardcoded

0,39% stale today; drifts. Mitigated for matching by making UF canonical (§3.3). Should eventually be injected daily with its date recorded.

### 10.5 No `primera_vivienda` field

FOGAES eligibility cannot be verified from current intake, which is why §4.4 emits a flag rather than a capacity multiplier. **If the client's catalog sits mostly under UF 4.500–6.000, FOGAES is the normal case rather than the exception**, and adding `primera_vivienda` to HU 1's form (a small change) would let capacity branch on `PIE_RATIO_ASISTIDO` directly. Flagged as the single highest-value follow-up.

---

## 11. Open items for the team

| # | Item | Owner | Blocking? |
| - | :--- | :---- | :-------- |
| 1 | UF price range of the client's real projects (Echeverría Izquierdo) — decides whether FOGAES is edge case or norm (§10.5) | Commercial | No — changes a default, not the model |
| 2 | Complementary-debt defect (§10.1) | HU 3 / HU 15 | No — capacity spec already accounts for it |
| 3 | Affinity weights are uncalibrated (§5.2) | HU 27 | No — v1 ships, revisit with data |
| 4 | HU 17 implemented on branch `HU17`, not merged (§8.4) | HU 17 | **Yes for HU 13** |
| 5 | Spike 1 E5 consolidation must reference this document rather than restate it | Spike 1 | No |

---

## 12. Sources

**Regulatory / official**
- [CMF Educa — ¿Tengo capacidad de pago para contratar un crédito hipotecario?](https://www.cmfchile.cl/educa/621/w3-article-27502.html)
- [CMF Educa — Carga financiera](https://www.cmfchile.cl/educa/621/w3-propertyvalue-48398.html)
- [Banco Central — tasa promedio vivienda UF > 3 años (F022.VIV.TIP.MA03.UF.Z.M)](https://si3.bcentral.cl/siete/ES/Siete/Cuadro/CAP_TASA_INTERES/MN_TASA_INTERES_09/TSF_27?idSerie=F022.VIV.TIP.MA03.UF.Z.M)
- [Banco Central — tasas de interés](https://www.bcentral.cl/areas/estadisticas/tasas-de-interes)
- [FOGAES — requisitos](https://fogaes.cl/sitio/requisitos/)
- [Gob.cl — nuevo Fogaes](https://www.gob.cl/noticias/nuevo-fogaes-compra-vivienda-credito-hipotecario-ley-subsidio-dividendo/)
- [MINVU — subsidio al crédito hipotecario](https://www.minvu.gob.cl/nuevo-subsidio-al-credito-hipotecario/)
- [SII — valor UF 2026](https://www.sii.cl/valores_y_fechas/uf/uf2026.htm)

**Bank published terms** (LTV, carga financiera, plazo, edad)
- [BancoEstado / Enlace Inmobiliario — FAQ](https://bancoestado.enlaceinmobiliario.cl/preguntas-frecuentes/contratar-credito-hipotecario) · [Bci](https://www.bci.cl/personas/credito-hipotecario) · [Santander](https://banco.santander.cl/personas/credito-hipotecario) · [Scotiabank](https://www.scotiabankchile.cl/credito-hipotecario) · [Itaú](https://www.itau.cl/personas/creditos/credito-hipotecario) · [Coopeuch](https://www.coopeuch.cl/personas/credito-hipotecario.html) · [Renta Nacional — mutuos hipotecarios](https://mutuoshipotecarios.rentanacional.cl/)

**Internal**
- `backend/app/scoring_engine/` — `indicators.py`, `project_fit.py`, `blockers.py`, `commercial_priority.py`, `constants.py`
- [[research/scoring_improvement_recommendations|Scoring Improvement Recommendations]] · [[research/competitor_prequalification_audit|Competitor Prequalification Audit]]
- `docs/project-catalog-contract.md` — project catalog frozen contract (HU 17)
