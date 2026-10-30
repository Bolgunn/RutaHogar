# Propuesta — Precalificación para compra de inversión

> **Propuesta sin numerar.** Hoy todo lead se evalúa como si fuera a vivir en la propiedad. Un
> comprador que busca arrendar recibe un score que ignora el arriendo que va a percibir, le exige el
> pie de una primera vivienda y un plan de mejora que le habla de "tu hogar". Esta historia lo evalúa
> como inversor, sin crear un rol nuevo y sin convertir a RutaHogar en un asesor de inversiones.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Deseable |
| **Puntos de Historia** | 8 *(estimación inicial, la asigna el equipo)* |
| **Actor** | Lead · Ejecutivo comercial |
| **Sprint** | — *(fuera del backlog numerado)* |
| **Estado** | Propuesta |

---

## Historia de usuario

> **Como** lead que quiere comprar una propiedad para arrendarla, **quiero** que mi precalificación
> considere el arriendo esperado, mis propiedades actuales y las exigencias de una compra de
> inversión, **para** saber si estoy en condiciones de comprar y qué me falta, sin recibir un
> resultado pensado para alguien que va a vivir en la propiedad.

---

## Criterios de aceptación

### E1 - Declaración del propósito de compra

**Dado** que un lead completa el onboarding o edita su perfil, **cuando** declare su objetivo,
**entonces** debe poder indicar el propósito de la compra — `vivienda_propia` o `inversion` — y ese
dato debe quedar guardado junto a cada evaluación, en el mismo snapshot de onboarding que ya
acompaña al historial.

> El propósito es un **atributo del lead, no un rol**. El lead inversor sigue siendo
> `role = 'usuario'` y conserva todo su acceso actual.

### E2 - Datos adicionales solo para inversión

**Dado** que el propósito declarado es `inversion`, **cuando** el lead complete el formulario de
precalificación, **entonces** deben pedírsele, además de los datos actuales:

| Campo | Tipo | Obligatorio |
| :---- | :--- | :---------: |
| `arriendo_estimado` | CLP mensual, ≥ 0 | Sí |
| `propiedades_actuales` | entero, ≥ 0 | Sí |
| `dividendos_actuales` | CLP mensual, ≥ 0 | Si `propiedades_actuales` > 0 |

**Y dado** que el propósito es `vivienda_propia` o no está declarado, **entonces** el formulario
debe ser idéntico al de hoy.

### E3 - Reglas de scoring de inversión, versionadas

**Dado** que una evaluación tiene propósito `inversion`, **cuando** el motor calcule el score,
**entonces** debe aplicar el conjunto de reglas de inversión:

- el ingreso considerado suma el arriendo estimado **descontado** por el porcentaje que la banca
  reconoce;
- los dividendos actuales se tratan como deuda, separados de `deuda_mensual`;
- el pie exigido para la compra es el de segunda vivienda;

**y** la evaluación debe registrar la versión de reglas aplicada, distinta de la de vivienda propia.
El score sigue en [0, 100] con los mismos umbrales Alto / Medio / Bajo.

> Los parámetros (porcentaje de arriendo reconocido, pie de segunda vivienda) **no se inventan**:
> los entrega la inmobiliaria antes de implementar. Ver *Preguntas abiertas*.

### E4 - Indicadores de inversión explicados, sin recomendación

**Dado** que el lead inversor recibe su resultado, **cuando** lo revise, **entonces** debe ver,
como información y **sin efecto en el score**:

- rentabilidad bruta referencial (arriendo anual / precio referencial de la comuna);
- cobertura del dividendo estimado con el arriendo;

**acompañados** de un aviso visible de que son cálculos orientativos y no una recomendación de
inversión. La explicación de IA debe redactarse desde los `risk_codes` calculados y **no** puede
recomendar comprar, calificar la propiedad como "buena inversión" ni prometer rentabilidades.

### E5 - Plan de mejora para inversión

**Dado** que el lead inversor tiene riesgos detectados, **cuando** revise su plan de mejora,
**entonces** los pasos deben corresponder a los `risk_codes` de inversión (por ejemplo, pie
insuficiente para segunda vivienda o carga de dividendos actuales) y no a los de primera vivienda.

### E6 - Segmento visible para el ejecutivo

**Dado** que un ejecutivo revisa su dashboard de leads, **cuando** aparezca un lead con propósito
`inversion`, **entonces** debe verse etiquetado como inversor y el ejecutivo debe poder filtrar por
ese segmento, sin que cambie qué leads puede ver según las políticas actuales.

---

## Notas

- **No es un rol nuevo, a propósito.** `normalizeRole()` (`frontend/src/lib/roles.js:21`) convierte
  cualquier rol desconocido en `usuario` sin avisar, y la base filtra por `role = 'usuario'` o por
  listas fijas de roles en varias políticas y RPC (`supabase/schema.sql:299`, `:805`, `:853`). Un
  rol `inversor` obliga a tocar todas ellas, y una sola omitida repite lo que pasó con HU16, cuando
  el staff dejó de ver leads. Un atributo no toca ninguna política.
- **`objetivo_principal` no sirve para esto.** Ya existe en el onboarding
  (`frontend/src/components/Onboarding.jsx:180`), pero sus valores describen el **momento** de
  compra (`comprar_ahora`, `prepararme`, …), no el **propósito**. El propósito es un campo nuevo e
  independiente.
- **El contrato de `POST /score` no se rompe.** Todos los campos nuevos son opcionales en
  `ScoreRequest` (`backend/app/main.py:96`). Una evaluación sin `proposito_compra` se calcula
  exactamente igual que hoy.
- **Versionado.** El motor ya expone `ALGORITHM_VERSION`
  (`backend/app/scoring_engine/constants.py:3`). Las reglas de inversión entran como versión
  propia; ninguna evaluación histórica se recalcula.
- **La IA no decide nada.** Igual que en [[HU3-scoring-hibrido|HU 3]], redacta desde los
  `risk_codes`. Los `risk_codes` nuevos (p. ej. `pie_segunda_vivienda`, `carga_dividendos_actuales`)
  se registran en la explicación y en el plan de mejora, como pide la convención del motor.
- **Límite regulatorio.** Calcular rentabilidad bruta es orientación; recomendar una inversión no
  lo es. E4 dibuja esa línea explícitamente para que el prompt de Groq la respete.
- **Migración.** Una columna nullable. En producción se aplica archivo por archivo con
  `migration repair`, nunca con `db push`, por el drift conocido del historial de migraciones.

---

## Preguntas abiertas

Hay que cerrarlas con Echeverría Izquierdo **antes** de estimar:

1. ¿Qué porcentaje del arriendo estimado reconoce la banca como ingreso? (referencia de mercado:
   70–80 %)
2. ¿Cuál es el pie mínimo que trabajan para segunda vivienda?
3. ¿Hay que distinguir compra en verde (inversión de varias unidades) de compra de una sola unidad?
4. ¿Existe una referencia de arriendo por comuna que se pueda usar para validar el arriendo
   declarado, o el dato queda solo como declaración del lead?
5. ¿La prioridad comercial de un inversor debe ser distinta a la de un comprador de vivienda propia
   con el mismo score?

---

## Relación con otras historias

| Historia | Relación |
| :------- | :------- |
| [[HU1-ingreso-datos-financieros\|HU 1]] | E1 y E2 extienden su formulario y su onboarding. El consentimiento debe cubrir los datos de propiedades actuales. |
| [[HU2-priorizacion-leads\|HU 2]] | E6 agrega un segmento a su dashboard. |
| [[HU3-scoring-hibrido\|HU 3]] | E3 y E4 son un conjunto de reglas más del mismo motor, con la misma regla de que la IA no decide. |
| [[HU4-plan-de-mejora\|HU 4]] | E5 agrega pasos para los `risk_codes` de inversión. |
| [[HU23-parametros-scoring\|HU 23]] | Si se implementa, los parámetros de E3 deberían configurarse desde ahí y no quedar fijos en código. |
| [[propuesta-primera-vivienda-fogaes\|Primera vivienda / FOGAES]] | Caso opuesto: el propósito `inversion` excluye beneficios de primera vivienda. |

---

## Estado frente al código

Historia propuesta, sin implementación.

| Criterio | Estado | Evidencia |
| :------- | :----- | :-------- |
| `E1` | ❌ | No existe `proposito_compra`; `objetivo_principal` (`Onboarding.jsx:180`) mide el momento de compra, no el propósito. |
| `E2` | ❌ | `ScoreRequest` (`main.py:96`) no tiene campos de arriendo ni de propiedades actuales. |
| `E3` | ❌ | `calculate_score()` (`scoring.py:109`) no distingue propósito de compra. |
| `E4` | ❌ | Sin indicadores de rentabilidad en el backend ni en `Result.jsx`. |
| `E5` | ❌ | Sin `risk_codes` de inversión. |
| `E6` | ❌ | `DashboardLeads.jsx` no tiene segmento por propósito de compra. |
