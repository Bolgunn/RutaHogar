# HU 11 - Checklist de preparación bancaria

> **⚠️ Parcial - Sprint 1.** Lista simple y referencial de antecedentes que el lead debería preparar antes de una evaluación bancaria formal, sin pedir documentos sensibles en esta etapa.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Importante |
| **Puntos de Historia** | 3 |
| **Actor** | Lead |
| **Sprint** | Sprint 1 |
| **Estado** | ⚠️ Parcial |

---

## Historia de usuario

> **Como** lead, **quiero** ver una lista simple de antecedentes que debería preparar antes de una evaluación bancaria formal, **para** entender que información podría necesitar más adelante.

---

## Criterios de aceptación

### E1

**Dado** que el usuario recibe su evaluación, **cuando** revise sus próximos pasos, **entonces** debe ver un checklist referencial de preparación bancaria.

### E2

**Dado** que el usuario tiene un factor determinante identificado, **cuando** se muestre el checklist, **entonces** debe destacar los antecedentes relacionados.

### E3

**Dado** que el usuario revisa el checklist, **cuando** lo visualiza, **entonces** debe aclararse que no debe subir documentos sensibles en esta etapa.

### E4

**Dado** que existe contenido educativo relacionado, **cuando** se muestre un punto del checklist, **entonces** debe enlazar a Academia.

---

## Notas

- E3 es una expresión directa de la salvaguarda S8 del handbook: no se almacenan documentos sensibles.
- La carga real de documentos, cuando exista, es [[HU24-carga-documentos|HU 24]] y llega recien en Sprint 3.

---

## Estado frente al código

Verificación criterio por criterio contra el código entregado. ✅ implementado · ⚠️ parcial · ❌ no implementado.

| Criterio | Estado | Evidencia |
| :------- | :----- | :-------- |
| `E1` | ✅ | `frontend/src/components/BankingChecklist.jsx:4` define `CHECKLIST_DATA`, usado desde `Result.jsx` y `Recommendations.jsx`. |
| `E2` | ✅ | Cada ítem lleva `mitigatesRisks` (`BankingChecklist.jsx:25` y siguientes) y `BankingChecklist.jsx:132` deriva los códigos de riesgo del lead para destacar los antecedentes relacionados. |
| `E3` | ✅ | El aviso de no subir documentos sensibles se muestra en el propio componente. |
| `E4` | ⚠️ | El checklist clasifica por régimen laboral y riesgos, pero no se encontró un enlace directo desde cada punto hacia Academia. |

> Esta tabla se revisa cuando cambia el código de la historia. Un criterio sin evidencia citable
> es un criterio no verificado, no un criterio cumplido.
