# HU 20 - Lo que cambió desde tu última visita

> **🗓 Planificada - Sprint 2.** El sistema detecta que la situación del lead cambió — con o sin
> acción suya —, se lo avisa fuera de la plataforma con un número concreto, y cuando vuelve le
> muestra el delta, no el estado.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Deseable |
| **Puntos de Historia** | 5 |
| **Actor** | Lead |
| **Sprint** | Sprint 2 |
| **Estado** | 🗓 Planificada |

---

## Historia de usuario

> **El documento fuente deja la descripción de esta historia en blanco.** No se transcribe ninguna,
> porque no hay ninguna que transcribir.

La formulación que traía la propuesta previa, conservada aquí como antecedente y **no** como
criterio aprobado:

> **Como** lead que ya se evaluó una vez, **quiero** enterarme cuando algo relevante cambia en mi
> situación o en lo que puedo alcanzar, **para** volver a la plataforma cuando hay una novedad real
> y no solo cuando alguien me lo recuerda.

---

## Criterios de aceptación

> **⚠️ Los criterios que siguen son los del documento fuente, transcritos literalmente, y no
> corresponden a esta historia.** Son un duplicado exacto de los criterios de
> [[HU21-carga-proyectos-por-unidad|HU 21]] — hablan de tipologías, dormitorios, baños y superficie,
> no de detectar y comunicar cambios en la situación del lead. Se transcriben sin corregir porque el
> documento del equipo es la fuente de verdad y un criterio no se inventa. **Esta historia no se
> puede planificar hasta que el equipo corrija el documento.**

### E1

**Dado** que el administrador edita un proyecto de su catálogo, **cuando** agregue, modifique, marque como no disponible o elimine una tipología, **entonces** debe poder declarar su nombre, dormitorios, baños, superficie en m², precio en UF y disponibilidad, y el rango del proyecto debe recalcularse sin intervención manual.

### E2

**Dado** que un proyecto tiene al menos una tipología disponible, **cuando** se consulte el proyecto, **entonces** su precio mínimo y máximo deben derivarse de las tipologías disponibles y dejar de ser campos digitados; y dado que un proyecto no tiene tipologías cargadas, cuando el administrador lo edite o un consumidor lo lea, entonces debe seguir funcionando exactamente como hoy, con su rango de precio ingresado a mano.

### E3

**Dado** que un administrador accede a las tipologías, **cuando** consulte o modifique cualquiera, **entonces** solo debe alcanzar las de proyectos de su propia inmobiliaria.

### E4

**Dado** que un proyecto tiene tipologías cargadas, **cuando** el lead revise el proyecto, **entonces** debe ver el desglose de tipologías con su precio, y no solo el rango agregado.

---

## Antecedente — criterios de la propuesta original

Los criterios que la propuesta traía antes de entrar al documento del equipo. **No son el contrato
vigente**; se conservan porque son el material con el que el equipo puede corregir el documento.

| # | Criterio propuesto |
| :- | :----------------- |
| E1 | Cambio detectado sin acción del usuario — el sistema recalcula y registra el cambio como evento asociado al lead, sin que el lead intervenga. |
| E2 | Motivo de retorno entregado fuera de la plataforma — el aviso lleva el dato concreto que cambió y el proyecto objetivo por su nombre, con tope de frecuencia y opción de desactivar. |
| E3 | Aterrizaje que muestra el delta, no el estado — al volver, lo primero es qué cambió desde la última visita. |
| E4 | Actualización en un tap — reportar el avance propio con un solo dato desde esa misma pantalla. |

---

## Por qué existe esta historia

*Análisis de la propuesta original, previo al documento del equipo.*

El objetivo del sprint es que el lead **vuelva** después de crear su cuenta y ver su score por
primera vez. Las historias de seguimiento existentes ([[HU4-plan-de-mejora|HU 4]],
[[HU13-seguimiento-mensual|HU 13]]) están todas formuladas como *"cuando el usuario registre…"*,
*"cuando el usuario actualice…"*, *"cuando el usuario consulte…"*: **recompensan al que vuelve, pero
ninguna lo hace volver.** Un lead que salió con "te falta ahorro" no tiene motivo para entrar a
digitar cuánto ahorró este mes — eso es tarea, no valor.

El patrón que resuelve esto en productos financieros de uso poco frecuente (Fintual, Racional, donde
el usuario **no** es un day trader) tiene tres piezas, y las tres son aplicables acá:

| Mecánica | En Fintual / Racional | En RutaHogar |
| :------- | :-------------------- | :----------- |
| **El número se mueve solo** | El portafolio rinde sin que el usuario haga nada; siempre hay algo que contar. | La continuidad laboral sube sola, la UF cambia, el catálogo suma proyectos. **El score puede subir sin que el lead toque nada.** |
| **La meta, no la métrica** | No muestra "rentabilidad 4,2%", muestra "llegas a tu meta en marzo de 2028". | No "score 62", sino "tu departamento en Ñuñoa se adelantó dos meses". Lo que engancha no es la fecha: es que la fecha **se mueva**. |
| **Fricción de entrada casi cero** | Actualizar no exige entender el producto. | Reportar el avance del mes debe ser **un número y un tap**, no un formulario de hitos. |

**El activo que ya tenemos y no estamos usando:** el motor penaliza `menos_6_meses` con −30 en el
componente de estabilidad laboral y `entre_6_y_12_meses` con −15
(`backend/app/scoring_engine/components.py:120`), y `menos_6_meses` además levanta el bloqueador
`continuidad_laboral_baja` (`backend/app/scoring_engine/blockers.py:128`). Es decir: **un lead
bloqueado hoy deja de estarlo en unos meses sin haber hecho absolutamente nada, y gana 15 puntos de
componente solo por esperar.** Hoy nadie se lo dice. Ese es el "tu score subió mientras no estabas"
más barato que tiene el producto.

---

---

## Notas de la propuesta original

- **El bucle completo es:** el mundo cambia → E1 genera el evento → E2 lo entrega con un número →
  E3 muestra el delta al volver → E4 recoge un dato nuevo → vuelve a E1. La propuesta original de
  seguimiento cubría solo el último tramo de ese bucle.
- **No hay canal de salida hoy.** `NotificationToast.jsx` es un aviso **in-app** dirigido al
  ejecutivo comercial ("Leads con Score Alto"), no al lead, y no existe infraestructura de correo ni
  de mensajería en `backend/app`. **E2 no se puede cumplir sin decidir el canal** — es la decisión
  bloqueante de esta historia.
- **El supuesto de UF ya existe:** `ESTIMATED_ANNUAL_UF_INCREASE = 0.04` en
  `frontend/src/services/financialTracking.js:9`, con su nota de que es referencial y no una
  predicción oficial (`financialTracking.js:272`). E1 debe usar ese mismo supuesto, no uno nuevo.
- **El recálculo de E1 debe producir una evaluación versionada nueva, no mutar la anterior.** Ver
  [[../RNF/RNF5-historial-inmutable|RNF 5]], igual que el recálculo de
  [[HU13-seguimiento-mensual|HU 13]] E4.
- **La IA no decide nada aquí.** Redacta el texto del aviso a partir del evento y del código de
  riesgo ya calculado por reglas, igual que en [[HU3-scoring-hibrido|HU 3]]. No determina si el
  evento es relevante ni recalcula el score.
- **Métrica de la historia:** % de leads que abren la plataforma al menos una vez **más de 7 días
  después** de su primera evaluación. Hoy no se mide. Sin esa medición la historia no se puede dar
  por cumplida, porque su entregable es un comportamiento, no una pantalla.

---

## Relación con otras historias

*Las referencias `E1`–`E4` de esta sección y de las anteriores son a los criterios del **antecedente**.*

| Historia | Relación |
| :------- | :------- |
| [[HU13-seguimiento-mensual\|HU 13]] | **Complementaria, no duplicada.** HU 13 tiene la mecánica de registro, el semáforo adelantado/en plazo/atrasado y la proyección de elegibilidad; HU 20 aporta lo que HU 13 no tiene: el disparo sin acción del usuario y la salida fuera de la app. HU 20 **no re-implementa** el plan mensual: E4 escribe en las mismas estructuras (`monthlyPlanService.js:73`, `improvement_goals`). |
| [[HU4-plan-de-mejora\|HU 4]] | El plan es el contenido del que hablan los eventos. Sin plan activo, E1 solo puede reportar cambios del entorno. |
| [[HU5-academia-financiera\|HU 5]] | Fuente natural del contenido de un evento cuando no hay cambio financiero que contar. |
| [[HU10-matching-lead-proyecto\|HU 10]] | "Se desbloqueó un proyecto compatible" (E1, E2) es matching corriendo de nuevo sobre un catálogo o una capacidad que cambió. |
| [[HU14-analisis-evolucion-comercial-lead\|HU 14]] | El mismo hecho contado al otro actor: HU 15 E3 pide detectar el avance del lead como oportunidad de contacto comercial. **Los eventos de E1 son la fuente de ambas.** |

---

## Decisiones pendientes antes de comprometerla

1. **Canal de E2.** Correo (Resend / Supabase) es lo más directo dado el stack. Si el sprint no
   puede incorporar canal externo, E2 queda sin cumplir y **la historia no alcanza la meta del
   sprint**: hay que decidirlo antes de estimar, no después.
2. **Frecuencia máxima.** Propuesta: un evento por semana como techo por lead, con E2 filtrando los
   cambios no materiales.
3. **Qué cuenta como "cambio relevante".** El umbral debe ser una constante del motor, revisable
   junto con los parámetros de [[HU23-parametros-scoring|HU 23]], no un número disperso en el
   código.

---

## Estado frente al código

Historia sin implementación. **La tabla verifica los criterios del antecedente, no los del documento
fuente**, porque los del documento pertenecen a [[HU21-carga-proyectos-por-unidad|HU 21]] y ya se
verifican en esa página.

| Criterio | Estado | Evidencia |
| :------- | :----- | :-------- |
| `E1` | ❌ | El recálculo solo ocurre cuando el lead envía el formulario; no hay entidad de evento ni proceso que corra sin el usuario. |
| `E2` | ❌ | No existe canal saliente. `NotificationToast.jsx` es in-app y está dirigido al ejecutivo comercial. |
| `E3` | ❌ | No hay comparación contra la última visita; `Result.jsx` muestra estado, no delta. |
| `E4` | ⚠️ | `RegisterMilestone.jsx` y `monthlyPlanService.js:73` permiten registrar avance, pero exigen entender metas e hitos — no es el único dato en un tap que pide el criterio. |

> Esta tabla se revisa cuando cambia el código de la historia. Un criterio sin evidencia citable
> es un criterio no verificado, no un criterio cumplido.
