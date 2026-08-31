# HU 9 - Cotización orientativa por proyecto

> **⚠️ Parcial - Sprint 1.** Permite al lead seleccionar un proyecto del catálogo y revisar si es compatible con su situación financiera, con la brecha principal y el ajuste mínimo sugerido.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Esencial |
| **Puntos de Historia** | 5 |
| **Actor** | Lead |
| **Sprint** | Sprint 1 |
| **Estado** | ⚠️ Parcial |

---

## Historia de usuario

> **Como** lead, **quiero** seleccionar un proyecto inmobiliario y revisar si es compatible con mi situación financiera, **para** saber si puedo avanzar, si estoy cerca o si debo ajustar mi objetivo.

---

## Criterios de aceptación

### E1

**Dado** que el usuario selecciona un proyecto del catálogo, **cuando** lo evalue, **entonces** el sistema debe mostrar su compatibilidad financiera.

### E2

**Dado** que el proyecto no sea compatible, **cuando** se muestre el resultado, **entonces** debe indicar la principal brecha: ingreso, pie, deuda o plazo.

### E3

**Dado** que el proyecto sea cercano, **cuando** se muestre el resultado, **entonces** debe indicar el ajuste mínimo sugerido para acercarse.

### E4

**Dado** que el proyecto sea compatible, **cuando** el usuario revise el resultado, **entonces** debe poder guardar interes o solicitar contacto.

---

## Notas

- Depende del catálogo de [[HU7-catalogo-de-proyectos|HU 7]] para saber qué proyectos existen.
- La lógica de compatibilidad vive en `backend/app/scoring_engine/project_fit.py`; la brecha principal de E2 se apoya en `blockers.py`.
- El ranking de alternativas ordenadas por brecha es [[HU19-ranking-proyectos-brecha|HU 19]].

---

## Estado frente al código

Verificación criterio por criterio contra el código entregado. ✅ implementado · ⚠️ parcial · ❌ no implementado.

| Criterio | Estado | Evidencia |
| :------- | :----- | :-------- |
| `E1` | ⚠️ | `backend/app/scoring_engine/project_fit.py` calcula la compatibilidad financiera, pero contra el catálogo mock; no hay selección de proyecto real por parte del usuario. |
| `E2` | ⚠️ | La brecha principal se apoya en `scoring_engine/blockers.py`; falta la superficie de UI que la presente por proyecto. |
| `E3` | ❌ | No se encontró cálculo ni despliegue del ajuste mínimo sugerido por proyecto. |
| `E4` | ❌ | No existe guardar interés ni solicitar contacto. |

**Nota de dependencia.** El catálogo del que depende esta historia ya está construido en `feature/sprint1/HU7` ([PR #69](https://github.com/nonmeeeeeeeeeeeeeee/RutaHogar/pull/69)); las citas de arriba describen `develop`, donde todavía no está.

> Esta tabla se revisa cuando cambia el código de la historia. Un criterio sin evidencia citable
> es un criterio no verificado, no un criterio cumplido.
