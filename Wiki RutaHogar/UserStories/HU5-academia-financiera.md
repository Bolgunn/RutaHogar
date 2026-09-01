# HU 5 - Academia financiera contextual

> **✅ Implementada - Sprint 1.** Sección de contenido educativo sobre crédito hipotecario, pie, subsidios, tasas y tipos de vivienda, enlazada contextualmente desde el resultado y el plan de mejora.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Esencial |
| **Puntos de Historia** | 8 |
| **Actor** | Lead |
| **Sprint** | Sprint 1 |
| **Estado** | ✅ Implementada |

---

## Historia de usuario

> **Como** usuario interesado en comprar una vivienda, **quiero** acceder a contenido educativo sobre crédito hipotecario, pie, subsidios, tasas y tipos de vivienda, **para** comprender mejor mis opciones y prepararme antes de comprar.

---

## Criterios de aceptación

### E1 - Catálogo educativo

**Dado** que el usuario accede a la sección Academia, **cuando** visualiza el módulo, **entonces** el sistema debe mostrar artículos o cápsulas organizadas por tema.

### E2 - Contenido según situación del usuario

**Dado** que el usuario tiene un bloqueador financiero identificado, **cuando** revise su resultado o plan de mejora, **entonces** el sistema debe sugerir contenido educativo relacionado.

### E3 - Enlaces contextuales

**Dado** que el usuario visualiza conceptos como pie, tasa, subsidio o plazo, **cuando** aparezcan en resultado, plan o mapa, **entonces** el sistema debe ofrecer acceso directo al contenido correspondiente.

---

## Notas

- La detección de bloqueadores que alimenta E2 reutiliza los `risk_codes` del motor de scoring ([[HU3-scoring-hibrido|HU 3]]) y del plan de mejora ([[HU4-plan-de-mejora|HU 4]]).
- La selección y organización del contenido es un producto del **Spike 1**.
- Varias historias enlazan de vuelta a Academia: [[HU8-beneficios-habitacionales|HU 8]], [[HU11-checklist-preparacion-bancaria|HU 11]], [[HU26-simulacion-subsidios|HU 26]].

---

## Estado frente al código

Verificación criterio por criterio contra el código entregado. ✅ implementado · ⚠️ parcial · ❌ no implementado.

| Criterio | Estado | Evidencia |
| :------- | :----- | :-------- |
| `E1` | ✅ | `frontend/src/constants/academyContent.js:15` define `ACADEMY_TOPICS` y `:93` `ACADEMY_ARTICLES`; `AcademiaFinanciera.jsx` los agrupa por tema. |
| `E2` | ✅ | `academyContent.js:1281` expone `classifyRiskText`, que mapea el texto de riesgo del resultado al contenido educativo correspondiente. |
| `E3` | ✅ | `GlossaryTerm.jsx` enlaza los conceptos en línea contra `ACADEMY_GLOSSARY` (`academyContent.js:922`), y se usa desde `Recommendations.jsx`. |

> Esta tabla se revisa cuando cambia el código de la historia. Un criterio sin evidencia citable
> es un criterio no verificado, no un criterio cumplido.
