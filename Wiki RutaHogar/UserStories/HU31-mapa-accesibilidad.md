# HU 31 - Visualización de mapa de accesibilidad inmobiliaria

> **🗓 Planificada - Sprint 3.** Mapa de la Región Metropolitana con proyectos y sectores clasificados según la capacidad financiera del lead, con explicación de por qué cada uno queda accesible, cercano o fuera de alcance.

> ⚠️ **Atención:** esta historia es idéntica a [[HU31-mapa-accesibilidad|HU 31]] (Sprint 2) en el documento fuente del backlog. Ambas se documentan tal como aparecen y ninguna suma o resta SP a su sprint. Pendiente de confirmación del equipo.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Opcional |
| **Puntos de Historia** | *(sin definir en el documento)* |
| **Actor** | Lead |
| **Sprint** | Sprint 3 |
| **Estado** | 🗓 Planificada |

---

## Historia de usuario

> Como usuario que completó su evaluación, quiero visualizar un mapa de la Región Metropolitana con sectores clasificados según mi capacidad financiera, para entender de forma visual dónde podría comprar hoy y dónde estoy fuera de alcance.

---

## Criterios de aceptación

### E1 - Clasificación visual por proyectos inmobiliarios

**Dado** que el usuario completó su evaluación, **cuando** acceda al mapa, **entonces** deben mostrarse los proyectos inmobiliarios en el mapa y si el usuario ya tiene una calificación debe mostrar los proyectos que son accesibles, cercanos o fuera de alcance según su perfil financiero.

### E2 - Explicabilidad de los resultados

**Dado** que un proyecto aparece como cercano o fuera de alcance, **cuando** el usuario lo seleccione, **entonces** el sistema debe mostrar una explicación del resultado.

### E3 - Visualización mapa de calor

**Dado** que el lead abra el mapa térmico, **cuando** el sistema cruza su score con los sectores disponibles, **entonces** debe marcar en verde los sectores de las comunas donde puede y quiere comprar, en amarillo donde es poco probable y en rojo los sectores inalcanzables.

### E4 - Explicación de los resultados obtenidos

**Dado** que el usuario obtuvo un segmento o proyecto en “amarillo” o “rojo”, **cuando** haga clic sobre él, **entonces** el sistema debe explicar cuánto más de renta, ahorro o mejora financiera necesita para poder acceder a ese sector o proyecto y proponer alternativas si es que posible.

> El documento fuente anota sobre este criterio: *“(Esta se puede juntar con la E2 de esta HU)”*.

## Notas

- Requiere la capacidad de compra estimada de [[HU6-simulacion-compatibilidad|HU 6]].
- Duplicada con [[HU31-mapa-accesibilidad|HU 31]]; la actualización dinamica del mapa es [[HU22-actualizacion-mapa-accesibilidad|HU 22]].
