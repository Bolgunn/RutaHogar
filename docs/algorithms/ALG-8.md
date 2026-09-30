# ALG-8 — Detector de beneficios habitacionales

| Field | Value |
| :---- | :---- |
| **Version** | matches `ALGORITHM_VERSION` in `backend/app/scoring_engine/constants.py` |
| **Runs on / implemented in** | backend · `scoring_engine/housing_benefits.py` |
| **Cases** | `docs/algorithms/ALG-8-cases.json` |
| **Open assumptions** | 6 — see the log below |
| **Last changed** | 2026-08-31 · PR HU8 · rewrote to real ALG-8; FOGAES tope 6000 + aviso 3000 con subsidio |

## Purpose

`detect_housing_benefits(data, indicators)` evalúa de forma **automática y referencial** si el
perfil de un lead podría ser compatible con seis rutas de beneficio habitacional: **FOGAES, DS49,
PADHI, DS1, Leasing Habitacional y Ley N° 21.748**. Se invoca como parte de la evaluación
financiera (HU8) y su salida alimenta la sección de **subsidios** del frontend.

**Por qué es así:** RutaHogar **no aprueba créditos ni garantiza subsidios** (ver alcance
funcional). Cada detector devuelve un veredicto de compatibilidad inicial con la evidencia
declarada por el lead, un listado de condiciones cumplidas y pendientes, un texto `notes`
explicativo y un `disclaimer`. El resultado **no modifica el score** del lead: es independiente de
`components.py`/`blockers.py`/`orchestrator`.

**Qué se rechazó:** convertir la salida en una "aprobación" (prohibido por UX/legales), y cruzar la
elegibilidad con datos externos reales en tiempo de ejecución (RSH, SERVIU o subsidios previos se
toman como **autoinformados** — ver assumptions log).

## Inputs → outputs

### Inputs
Campos del perfil del lead (`data`) y de la evaluación financiera (`indicators`):

- `edad` — integer (años).
- `rsh_tramo` — integer (%), autoinformado, opcional. 0 = no declarado.
- `propiedad_previa` — boolean. `True` = ya es propietario de vivienda.
- `beneficio_previo` — boolean. `True` = ya recibió subsidio habitacional estatal.
- `ahorro_uf` — decimal (UF) en cuenta de ahorro para la vivienda.
- `ahorro_antiguedad_meses` — integer (meses de antigüedad del ahorro).
- `vivienda_nueva` — boolean. `True` = propiedad objetivo nueva.
- `es_empresa` — boolean. `True` = persona jurídica (no persona natural).
- `grupo_familiar_rsh` — boolean. `True` = postula con grupo familiar conformado en el RSH.
- `registro_rui` — boolean. `True` = inscrito en el Registro Único de Inscritos del SERVIU.
- `deuda_hipotecaria_vigente` — boolean. `True` = mantiene morosidad hipotecaria vigente.
- `indicators.property_value_uf` — decimal (UF), valor de la propiedad objetivo.
- `indicators.pie_ratio` — decimal (ratio 0-1), pie real del lead sobre el valor.

Si un campo está ausente se usa su valor "no declarado" (ausente → falsy / 0), lo que suele
volver al beneficio `eligible = False`.

### Outputs
```python
{
  "applicable_benefits": [ { ... }, ... ],   # SIEMPRE los 6 detectores, en orden fijo
  "summary": str,
  "disclaimer": str,
}
```
Cada detector devuelve:
```python
{
  "type": "FOGAES" | "DS49" | "PADHI" | "DS1" | "LEASING" | "LEY_21748",
  "name": str,
  "eligible": bool,
  "conditions_met": [str],      # etiquetas legibles de condiciones cumplidas
  "conditions_not_met": [str],  # etiquetas legibles de condiciones no cumplidas
  "notes": str,
  "academy_module": str,        # módulo de la Academia Financiera vinculado
}
```

`applicable_benefits` contiene **siempre los 6 detectores** (incluso los no elegibles); el
frontend filtra con `eligible`. `disclaimer` es un texto fijo e incondicional (E2 de HU8).

## Rules

### FOGAES — `_detect_fogaes`
Financiamiento para vivienda nueva (garantiza el 10% del pie). Elegible si **todas**:

| Condición | Efecto | Código | Mensaje mostrado |
| :-------- | :----- | :----- | :--------------- |
| `vivienda_nueva == true` | requisito | `conditions_met/not_met` "vivienda nueva" | — |
| `0 < property_value_uf <= 6000` | requisito | `FOGAES_MAX_PROPERTY_UF` | "precio dentro del límite" |
| `pie_ratio >= 0.10` | requisito | `FOGAES_MIN_PIE_RATIO` | "pie suficiente" |
| siempre | informative | `FOGAES_MAX_UF_CON_SUBSIDIO` | "si FOGAES se combina con subsidio, el valor máximo es 3000 UF" |

**Fuentes:** MINVU / kickoff HU8 (Spike 1). ⚠️ El kickoff indicaba 4.500 UF y la versión previa
4.000 UF; por decisión del producto se fijó en **6.000 UF** como tope general (ver assumptions
log). El tope de **3.000 UF con subsidio** es un aviso informativo, no cambia la elegibilidad.

### DS49 — `_detect_ds49`
Fondo Solidario de Elección de Vivienda. Elegible si **todas**:

| Condición | Efecto | Código | Mensaje mostrado |
| :-------- | :----- | :----- | :--------------- |
| `edad >= 18` | requisito | `DS49_MIN_EDAD` | "edad mínima" |
| `0 < rsh_tramo <= 40` | requisito | `DS49_RSH_VULNERABLE_MAX` | "vulnerabilidad RSH" |
| `propiedad_previa == false` | requisito | — | "sin propiedad previa" |
| `ahorro_uf >= 10` | requisito | `DS49_MIN_AHORRO_UF` | "ahorro mínimo" |
| `grupo_familiar_rsh == true` | requisito | — | "grupo familiar" |

**Fuentes:** MINVU DS49, kickoff HU8. **Sin excepción adulto mayor**: se exige siempre
`rsh <= 40` (decisión de producto; ver assumptions log). No valida edad `>= 60` para postular solo.

### PADHI — `_detect_padhi`
Programa de Acompañamiento a Deudores Hipotecarios. Elegible si **ambas**. Es orientación
educativa (redirige a la Academia Financiera), no nueva ruta de financiamiento:

| Condición | Efecto | Código | Mensaje mostrado |
| :-------- | :----- | :----- | :--------------- |
| `deuda_hipotecaria_vigente == true` | requisito | — | "deuda hipotecaria vigente" |
| `beneficio_previo == true` | requisito | — | "beneficio previo" |

**Fuentes:** kickoff HU8, MINVU (programa de acompañamiento).

### DS1 — `_detect_ds1` (Subsidio Clase Media para Compra de Viviendas)
Precondiciones comunes (elegible requiere **todas** las comunes **y** un tramo):

| Condición (común) | Efecto | Código | Mensaje mostrado |
| :---------------- | :----- | :----- | :--------------- |
| `propiedad_previa == false` | requisito | — | "sin propiedad previa" |
| `ahorro_antiguedad_meses >= 12` | requisito | `DS1_MIN_AHORRO_MESES` | "antigüedad del ahorro" |

Asignación de tramo (se evalúa I → II → III; **exige `rsh_tramo > 0` y `property_value_uf > 0`**):

| Tramo | RSH | RSH (adulto mayor ≥60) | Ahorro mínimo | Tope vivienda | Códigos |
| :---- | :-- | :--------------------- | :------------ | :------------ | :------ |
| **I** | `<= 60` | `<= 90` | `>= 30 UF` | `<= 1100 UF` | `DS1_TRAMO_I_*` |
| **II** | `<= 80` | `<= 90` | `>= 40 UF` | `<= 1600 UF` | `DS1_TRAMO_II_*` |
| **III** | `> 0` (inscrito) | igual | `>= 80 UF` | `<= 2200 UF` | `DS1_TRAMO_III_*` |

Elegible = comunes cumplidas **y** se asignó un tramo. Nota del Tramo III: basta con estar
inscrito en el RSH dentro del 90%; si el RSH **supera el 90%**, se remite al MINVU para el límite
de renta máxima (periódico y según integrantes del hogar) — **no se valida la renta**.

**Fuentes:** MINVU DS1 (Región Metropolitana y zona central), kickoff HU8. Tope RSH adulto mayor
**90** (no 100) por decisión de producto.

### LEASING — `_detect_leasing`
Subsidio para contrato de arrendamiento con promesa de compraventa. Elegible si **todas**:

| Condición | Efecto | Código | Mensaje mostrado |
| :-------- | :----- | :----- | :--------------- |
| `edad >= 18` | requisito | `LEASING_MIN_EDAD` | "edad mínima" |
| `registro_rui == true` | requisito | — | "inscrito en RUI" |
| `propiedad_previa == false` | requisito | — | "sin propiedad previa" |
| `beneficio_previo == false` | requisito | — | "sin beneficio previo" |

**Fuentes:** kickoff HU8, MINVU/SERVIU (arrendamiento con promesa de compraventa).

### Ley N° 21.748 — `_detect_ley_21748`
Subsidio al dividendo para viviendas nuevas (reducción de la tasa del crédito hipotecario).
Elegible si **todas**:

| Condición | Efecto | Código | Mensaje mostrado |
| :-------- | :----- | :----- | :--------------- |
| `vivienda_nueva == true` | requisito | — | "vivienda nueva" |
| `es_empresa == false` | requisito | — | "persona natural" |
| `0 < property_value_uf <= 4000` | requisito | `LEY_21748_TOPE_UF` | "valor dentro del límite" |
| — | informative | `LEY_21748_TASA_REDUCCION_PB` | "reducción de 60 puntos base" |

**Fuentes:** Ley N° 21.748, kickoff HU8. La reducción se muestra como **60 puntos base**
(`int(0.60 * 100)`), sin cambiar la constante.

## Invariants and edge cases

**Invariants** (verdaderas para todo input, aseguradas por tests):

- `applicable_benefits` contiene **siempre los 6** detectores, en orden fijo (FOGAES, DS49, PADHI,
  DS1, LEASING, LEY_21748). `test_returns_all_six_benefits`.
- El `disclaimer` (E2) está **siempre** presente, sin importar la elegibilidad.
- El detector es **determinista**: mismos inputs ⇒ mismos outputs (sin tiempo, aleatoriedad ni IA).
- Cada detector tiene un `academy_module` no vacío (`_has_academy_modules`).
- Un detector nunca *asigna* condiciones pendientes a condiciones cumplidas; cada condición cae en
  exactamente un lado (met / not_met), y `eligible = (len(conditions_not_met) == 0)` — salvo PADHI,
  que computa `eligible = deuda_and_beneficio`.

**Edge cases:**

- **Sin datos** (`data=None`, `indicators=None`): `safe_data={}`, `safe_indicators={}`. Todo campo
  ausente → falsy/0. Resultado: los 6 beneficios no elegibles, `summary` "no se detectaron...",
  disclaimer presente. `test_empty_data_returns_all_benefits_not_eligible`.
- **RSH no declarado** (`rsh_tramo = 0`): DS49 y DS1 tramos I/II/III no se cumplen (fuera de rango
  o exige `> 0`), → no elegibles. No es error, es "faltan antecedentes".
- **Valor de propiedad ausente o `0`**: DS1, DS49 no aplica, FOGAES `property_value_uf > 0`
  falla, Ley 21.748 `> 0` falla. → no elegibles.
- **Adulto mayor** (edad ≥ 60): solo relaja el RSH de DS1 tramos I/II (límite 90). **No** relaja
  DS49.
- **`es_empresa == true`**: Ley 21.748 `persona_natural = False` → falla `persona_natural`.

## Assumptions log

| Assumption | Made by | Date | Would be wrong if | Status |
| :--------- | :------ | :--- | :---------------- | :----- |
| FOGAES tope general = 6000 UF | Producto | 2026-08-31 | el tope oficial MINVU difiere de 6.000 UF | open |
| FOGAES+subsidio tope = 3000 UF (solo aviso informativo, no cambia elegibilidad) | Producto | 2026-08-31 | el matiz de subsidio debe modificar la elegibilidad | open |
| DS49 sin excepción adulto mayor; exige siempre RSH ≤ 40 | Producto | 2026-08-31 | DS49 permite excepciones de RSH por grupo familiar/adulto mayor | open |
| DS1 tramos I/II RSH adulto mayor = 90 (no 100) | Producto | 2026-08-31 | el MINVU usa un tope distinto para adultos mayores | open |
| DS1 Tramo III: no se valida renta; solo "inscrito" + aviso a MINVU si RSH > 90% | Producto | 2026-08-31 | el producto decide validar el límite de renta visible | open |
| RSH, ahorro, RUI, grupo familiar, deuda y subsidios previos se toman **autoinformados** | Producto | 2026-08-31 | se integra consulta externa (RSH/SERVIU/BCI) en tiempo real | open |
