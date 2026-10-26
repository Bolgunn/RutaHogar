# HU 31 - Radar de oportunidades y alertas por variación de condiciones de mercado

> **🗓 Planificada - Sprint 3.** El lead activa alertas sobre un proyecto favorito y, si la inmobiliaria baja el precio o aplica un bono, RutaHogar recalcula su compatibilidad y se lo avisa en su próximo ingreso.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | *(sin definir en el tablero)* |
| **Puntos de Historia** | 3 |
| **Actor** | Lead |
| **Sprint** | Sprint 3 |
| **Estado** | 🗓 Planificada |
| **Responsable** | Rodrigo — ver [[../Sprint3-Division\|División del Sprint 3]] |

---

## Historia de usuario

> **Como** lead que mantiene guardados proyectos inmobiliarios en seguimiento, **quiero** recibir alertas cuando un proyecto de mi interés reduzca su valor en UF, lance promociones comerciales (bono pie o subsidio a la tasa) o cuando una baja de tasas bancarias vuelva viable una alternativa antes inalcanzable, **para** aprovechar ventanas de oportunidad del mercado inmobiliario y retomar mi compra con mejores condiciones financieras.

---

## Criterios de aceptación

### E1 - Activar alertas sobre un favorito

**Dado** un proyecto guardado como favorito, **cuando** el usuario active la campana de "Notificar cambios", **entonces** el sistema debe registrar el interés y los umbrales de precios actuales.

### E2 - Recalcular y notificar

**Dado** que la inmobiliaria actualice el catálogo reduciendo el precio de las unidades o aplicando un bono pie del 5 % u otro, **cuando** ocurra la actualización, **entonces** el sistema debe recalcular la compatibilidad del lead y notificar en su próximo ingreso.

---

## Notas

- Los criterios no cubren la baja de tasas bancarias que menciona la historia; con dos criterios, esa parte queda fuera del alcance comprometido.
- **Extiende, no rehace, [[HU20-retorno-por-cambio|HU 20]]:** `backend/app/lead_changes/service.py` ya detecta proyectos que pasan a ser compatibles (`_project_compatible_event`) y registra eventos que se muestran al volver.
- La actualización que dispara E2 puede venir de la edición de un proyecto o de la carga masiva de [[HU25-carga-masiva-proyectos|HU 25]]; ambas rutas deben generar el evento.
- Reemplaza el número que tenía la antigua [[HU31-mapa-accesibilidad|HU 31 — Mapa de accesibilidad]], que salió del Sprint 3.
