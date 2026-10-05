# Spike 2 · E2 — Validación técnica de auditoría e historial versionado

**Fecha de consulta:** 2026-09-18. **Estado:** investigación terminada; el modelo propuesto está pendiente de revisión del equipo. No es un diseño aprobado ni autoriza migraciones, cambios de políticas ni cambios de código.

## 1. Objetivo

Documentar el criterio **E2 — Validación técnica de auditoría e historial versionado** del [Spike 2](<../../Wiki RutaHogar/UserStories/spike2-validacion-tecnica.md>):

> Dado que el sistema debe mantener trazabilidad sobre evaluaciones, cambios de score y acciones relevantes, cuando el equipo analice los distintos campos y representaciones de los datos de los que se desea mantener una trazabilidad, entonces debe definir cómo se registran los eventos, actores responsables, fechas, versiones de evaluación, motivo del cambio y relación entre evaluaciones anteriores y nuevas.

El documento sigue la ubicación, la nomenclatura y la estructura del [precedente E4](spike2-e4-external-data-sources.md). Primero reconcilia lo que **ya existe** en el repositorio y en la base, y después propone el modelo. Las decisiones del §5 se tomaron en una sesión de trabajo del 2026-09-18 y quedan sujetas a revisión del equipo.

**Vocabulario usado en este documento.** Para no mezclar dos conceptos distintos:

| Término | Significado |
| --- | --- |
| **Versión** | Solo la **versión del algoritmo de scoring** que produjo un resultado (`algorithm_version`, por ejemplo `1.1.0`). |
| **Recálculo** | Cada ejecución del scoring sobre un lead, la haya iniciado una persona o el sistema. |
| **Entrada de historial** | Un resultado conservado en `scoring_history`. No todo recálculo genera una (§5.3). |
| **Evento** | Una acción registrada en `audit_events` (§5.5), sea o no de scoring. |

## 2. Alcance y nivel de evidencia

- **Dentro del alcance:** las tablas `scoring_history`, `evaluations` y `arco_requests`; la columna `events`; RNF 4 y RNF 5; y las historias de **Sprint 2** que dependen de la trazabilidad (HU 12, 13, 14, 15, 16, 17, 18 y 20).
- **Fuera del alcance:** [HU 23](<../../Wiki RutaHogar/UserStories/HU23-parametros-scoring.md>) (Sprint 3), cuya contradicción con RNF 5 se deja registrada en el §10. También quedan fuera la política de privacidad y retención (corresponde a **E1**), el código, las migraciones, los cambios de RLS y las dependencias.

Niveles de evidencia:

- **Verificado en base:** consultas de solo lectura (metadatos del catálogo y conteos, sin datos personales) que el equipo ejecutó en el editor SQL de Supabase del proyecto `adgnxtjkqedtvkwcizzn` el **2026-09-18**. Las consultas se listan en el §11.
- **Repositorio:** lectura del código y las migraciones del commit base de esta rama.
- **Oficial:** textos normativos o documentación del fabricante, enlazados en el §11.
- **Secundaria:** fuentes no oficiales usadas solo en la comparación del §7.
- **Recomendación:** propuesta técnica para RutaHogar, no requisito aprobado.
- **Pendiente:** comprobación no realizada o decisión del equipo, marcada expresamente.

## 3. Situación actual

### 3.1 Cómo se persiste hoy una evaluación

1. El navegador envía los datos a `POST /score`. El backend calcula el resultado y lo **devuelve al navegador**. El backend no tiene acceso a la base: [requirements.txt](../../backend/requirements.txt) no incluye cliente de Supabase ni de Postgres, y sus únicos endpoints son `/score`, `/score/explain` y `/interest`.
2. **El navegador** inserta una fila en `evaluations` y **luego**, en una segunda llamada, una fila en `scoring_history` ([evaluationService.js:179](../../frontend/src/services/evaluationService.js)).
3. `evaluations` es la **copia de trabajo mutable**: después se le actualizan el plan de vivienda, el contenido de IA y la aceptación del plan, y su dueño puede borrarla.
4. `scoring_history` es la **copia congelada** (relación 1:1 con `evaluations`): contiene `snapshot` de entradas y resultado, `component_scores`, `algorithm_version`, `channel` y `created_at`.
5. Las acciones posteriores del usuario (`no_viable_shown`, `simulate_success`, `register_savings`) se **agregan a la columna `events`** de la fila de historial mediante `UPDATE` ([getScoringHistory.js:183](../../frontend/src/services/getScoringHistory.js), [getScoringHistory.js:222](../../frontend/src/services/getScoringHistory.js)).

### 3.2 Hallazgos

| # | Hallazgo | Evidencia | Nivel |
| --- | --- | --- | --- |
| H1 | **El dueño puede editar su historial.** La política `Scoring history update own` permite actualizar cualquier columna de las filas propias, y no existe ningún trigger que proteja columnas. Desde las herramientas del navegador, un lead puede reescribir `score`, `classification` y `snapshot` de todo su historial, y los ejecutivos lo verían así (`Scoring history select staff`). | Consultas 2 y 5 | Verificado en base |
| H2 | **La vía de edición se usa en producción.** 30 de las 205 filas de historial (15 %) tienen `events`, es decir, fueron modificadas después de su inserción. | Consulta 9 | Verificado en base |
| H3 | **Es posible falsificar resultados.** `Scoring history insert own` solo comprueba `user_id`. Como es el navegador el que inserta, un lead puede crear una fila con `score: 100, classification: "Alto"` que el motor nunca calculó. Hacer la tabla de solo inserción no corrige esto. | Consulta 2; §3.1 | Verificado en base |
| H4 | **El 43 % de las evaluaciones no tiene historial** (155 de 360). La escritura no es atómica: si falla la segunda inserción, la evaluación queda igual y solo se marca `financial_data.score_traceability.scoring_history_insert_failed` ([evaluationService.js:222-235](../../frontend/src/services/evaluationService.js)). Otra causa probable es que haya evaluaciones anteriores a la tabla. La proporción entre ambas causas está **pendiente** (consulta de seguimiento A). | Consulta 7 | Verificado en base (causa: pendiente) |
| H5 | **El registro de eventos descarta eventos.** `shouldSkipEvent()` omite un segundo `no_viable_shown` o un `register_savings` con el mismo total ([getScoringHistory.js:158](../../frontend/src/services/getScoringHistory.js)). Sirve como estado de interfaz, pero no como registro de auditoría. | Repositorio | Repositorio |
| H6 | **No hay linaje ni motivo útil.** Ninguna columna enlaza una entrada con la anterior del mismo lead; el orden solo se infiere por `(user_id, created_at)`. El motivo vive dentro de `snapshot.calculation_reason`, y ningún llamador lo informa: hay 122 filas con `new_evaluation` (todas de la versión `1.1.0`) y 83 sin motivo (versiones anteriores). | Consulta 8; [evaluationService.js:43](../../frontend/src/services/evaluationService.js) | Verificado en base |
| H7 | **La versión del algoritmo es ambigua.** Hay dos constantes: `SCORING_VERSION = "1.1.0"` en [scoring.py:20](../../backend/app/scoring.py), que es la que se guarda, y `ALGORITHM_VERSION = "1.1.0-prep"` en [scoring_engine/constants.py:6](../../backend/app/scoring_engine/constants.py). Además, 2 filas tienen `algorithm_version = ''`: `NOT NULL` no rechaza la cadena vacía y el código usa `""` como respaldo ([getScoringHistory.js:97](../../frontend/src/services/getScoringHistory.js)). Valores presentes: `1.1.0` (122), `1.0.1` (79), `1.0.0` (2) y vacío (2). | Consultas 3 y 8 | Verificado en base |
| H8 | **No existe el actor.** `user_id` identifica al **sujeto** de la evaluación, no a quien actuó. No hay dónde registrar a un ejecutivo o administrador que actúe sobre un lead (HU 16, HU 15), ni al sistema cuando recalcula (HU 20). | Consulta 3 | Verificado en base |
| H9 | **La solicitud de supresión no suprime nada.** Existe 1 solicitud `cancelacion` en estado `procesado`. Procesarla solo cambia `estado` ([arcoService.js:123](../../frontend/src/services/arcoService.js)). Si quedan datos del titular está **pendiente** de verificar (consulta de seguimiento B). | Consulta 7 | Verificado en base (efecto: pendiente) |
| H10 | **El consentimiento no se registra como un hecho.** Solo viaja dentro del payload de cada evaluación (`financial_data.consentimiento`). | Repositorio | Repositorio |
| H11 | **Hay desalineación entre el esquema, las migraciones, la base y el wiki.** La columna `events` y la política de UPDATE existen en la base y en la migración [20260807000000_scoring_events.sql](../../supabase/migrations/20260807000000_scoring_events.sql), pero no en [schema.sql](../../supabase/schema.sql). El check `scoring_history_channel_check` existe en `schema.sql:108` pero **no** en la base. [Database/evaluations](<../../Wiki RutaHogar/Database/evaluations.md>) documenta `algoritmo_version` y `component_breakdown`, que **no existen**, y omite `executive_summary`, `commercial_guidance` y `housing_plan`. `scoring_history` no tiene página en el wiki. | Consultas 3 y 4 | Verificado en base |
| H12 | **`anon` y `authenticated` tienen todos los privilegios** (incluido `TRUNCATE`) sobre las tres tablas. Es el valor por defecto de Supabase, y deja las políticas RLS como única barrera. `TRUNCATE` no está sujeto a RLS ([T1](#11-fuentes)), aunque la API REST no lo expone. | Consulta 6 | Verificado en base |
| H13 | **Los borrados tienen un comportamiento incierto.** `deleteEvaluation()` ([evaluationService.js:313](../../frontend/src/services/evaluationService.js)) probablemente falla siempre que exista historial, porque la FK `evaluation_id` es `ON DELETE RESTRICT`. Al borrar una cuenta, `auth.users` propaga el borrado en cascada tanto a `scoring_history` como a `profiles → evaluations`, y la segunda ruta choca con el `RESTRICT`. Si el borrado se completa o falla depende del orden de procesamiento. Se debe probar en un entorno de prueba, no en la base viva. | Consulta 4 | Pendiente |
| H14 | **Traspaso a E1:** el SELECT del personal sobre `evaluations` y `scoring_history` se filtra solo por rol, así que cualquier ejecutivo o administrador de **cualquier** inmobiliaria lee todos los historiales, aunque [HU 7](<../../Wiki RutaHogar/UserStories/HU7-catalogo-de-proyectos.md>) hizo multi-tenant el catálogo. Además, `evaluations` tiene dos políticas SELECT redundantes. | Consulta 2 | Verificado en base |

**Severidad.** Ningún hallazgo permite leer ni dañar datos **de otra persona**. H1 y H3 son problemas de **integridad**: el registro que debía ser a prueba de manipulación puede ser reescrito o fabricado por la persona a la que se refiere, y en ese caso la auditoría no prueba nada. H4 significa que RNF 5 hoy no se cumple para casi la mitad de las evaluaciones.

## 4. Contradicciones documentales

| Contradicción | Tratamiento |
| --- | --- |
| La página del Spike marca E2 como "sin definición de modelo de eventos ni de versionado", pero `scoring_history` existe y se usa al menos desde junio de 2026 (migración `20260611`). | Este documento parte de lo existente (§3). |
| [RNF 5](<../../Wiki RutaHogar/RNF/RNF5-historial-inmutable.md>) E2 exige "sin UPDATE ni DELETE", pero la migración `20260807` añadió `Scoring history update own`. | Se resuelve en el §5.2. |
| RNF 5 E1 cuenta el "cambio de configuración en HU 23" como disparador de una nueva entrada, mientras que HU 23 E3 dice que los parámetros aplican solo a "evaluaciones posteriores". | **Fuera de alcance** (Sprint 3). Se registra en el §10. |
| RNF 5 (nada se borra) frente al derecho de supresión, art. 7 de la Ley 21.719 ([L1](#11-fuentes)). | Se resuelve en el §5.8. |
| [HU 20](<../../Wiki RutaHogar/UserStories/HU20-retorno-por-cambio.md>) indica que todo recálculo del sistema "debe producir una evaluación versionada nueva". | Es compatible si se precisa con la regla R2 (§5.3): todo recálculo queda registrado como evento, y solo los relevantes generan una entrada de historial. |
| El wiki de la base de datos no refleja las columnas reales (H11). | Corrección propuesta en el §9. |

## 5. Modelo propuesto

> Todo el §5 es **recomendación técnica**. Los nombres de columnas y tipos son provisionales, y los bloques SQL son **ilustrativos: no son migraciones**.

### 5.1 Tres registros separados

| Registro | Qué guarda | Cuándo se escribe | Quién escribe |
| --- | --- | --- | --- |
| `evaluations` | Copia de trabajo mutable (plan, contenido de IA, estado del plan). No cambia de naturaleza. | Al evaluar y en su uso posterior | Como hoy |
| `scoring_history` | **Resultados que vale la pena conservar**: snapshot de entradas, resultado, componentes, **versión del algoritmo**, enlace a la entrada anterior y motivo. **Solo inserción.** | Según las reglas R1 y R2 (§5.3) | Solo el backend |
| `audit_events` (nueva) | **Quién hizo qué, a quién, cuándo y por qué**, incluido un evento `rescore` por **cada** recálculo, se genere o no una entrada de historial. **Solo inserción.** | En cada acción | Backend, o el navegador si la actúa la propia persona (§5.6) |

La columna `events` se **retira** de `scoring_history` y su contenido pasa a `audit_events`. Esa columna era la única razón de la política de UPDATE (H1), y la propia documentación de Supabase recomienda usar una tabla dedicada antes que privilegios por columna ([T3](#11-fuentes)).

### 5.2 `scoring_history`: columnas y garantías

Se mantienen: `id`, `evaluation_id`, `user_id`, `score`, `classification`, `snapshot`, `component_scores`, `algorithm_version`, `channel` y `created_at`.

Se añaden:

| Columna | Propósito | Criterio E2 |
| --- | --- | --- |
| `previous_id` | Entrada anterior **del mismo lead**. Es `null` en la primera. | Relación entre evaluaciones anteriores y nuevas |
| `sequence` | Número de entrada por lead (1, 2, 3…). No es una versión del algoritmo. | Orden reconstruible |
| `reason` | Motivo del recálculo, tomado de una lista cerrada (§5.4). Se saca del `snapshot`. | Motivo del cambio |
| `reason_detail` | Subcausa, por ejemplo `continuidad_cumplida`. | Motivo del cambio |
| `trigger_source` | `persona` o `sistema`: indica qué regla (R1 o R2) generó la entrada. | Actor |

Garantías:

- **Sin UPDATE ni DELETE para los roles del navegador:** se eliminan las políticas y además se revocan los privilegios (`REVOKE UPDATE, DELETE, TRUNCATE … FROM anon, authenticated`), como segunda barrera (H12).
- **Un trigger `BEFORE UPDATE OR DELETE` que rechace la operación**, con una sola excepción: el procedimiento de supresión del §5.8. ISO 27001 A.8.15 y OWASP exigen proteger los registros contra modificación ([R2](#11-fuentes), [R3](#11-fuentes)).
- **`algorithm_version` no vacío** (`check (algorithm_version <> '')`), y una **única constante autoritativa** en el backend (H7; la decisión de cuál queda está pendiente, §10).
- **Se restaura el check de `channel`** (H11).
- **Escritura atómica:** el backend inserta la evaluación, la entrada de historial y el evento `rescore` **en una sola transacción**. Esto corrige H4 para las evaluaciones futuras.

### 5.3 Cuándo un recálculo genera una entrada de historial

Todo recálculo registra un evento `rescore` en `audit_events` con su disparador, la versión del algoritmo y si generó una entrada. Además:

- **R1. Si lo inició una persona, siempre genera una entrada.** Aplica cuando el lead completa el formulario, reporta un avance (HU 13) o actualiza un dato (HU 20 E4), y cuando el co-deudor confirma sus datos (HU 18 E3). La entrada se genera **aunque el score no cambie**, porque lo que la persona declaró forma parte del registro.
- **R2. Si lo inició el sistema, solo genera una entrada si el resultado cambió de forma relevante** respecto de la última entrada del lead. Aplica a los recálculos de HU 20 E1: variación de UF, continuidad cumplida o un proyecto nuevo en el catálogo.

**Cambio relevante** es cualquiera de estos:

1. Cambió la **clasificación** (Bajo / Medio / Alto).
2. Apareció o desapareció algún **bloqueador**.
3. Cambió la **compatibilidad con el proyecto objetivo** (Compatible / cercano / requiere ajuste).

No bastan por sí solos: un movimiento del score que no cruza un umbral (72 → 74), un cambio de versión del algoritmo con el mismo resultado ni un proyecto nuevo compatible que no sea el objetivo. Este último sí queda en el evento `rescore`, y HU 20 E2 puede notificar a partir de él.

Ejemplo de un lead durante tres meses:

| Fecha | Qué pasó | `audit_events` | `scoring_history` |
| --- | --- | --- | --- |
| 1 jun | Completa el formulario: 58, Medio, bloqueador por continuidad | `rescore` | Entrada 1, `nueva_evaluacion` |
| 2 jun – 14 jul | La UF varía a diario; sigue en 58, Medio | ≈ 43 × `rescore` | — |
| 15 jul | Reporta que pagó una deuda; sigue en 58, Medio | `rescore` | Entrada 2, `avance_plan` (R1) |
| 1 sep | Cumple la continuidad: se levanta el bloqueador y queda en 73, Alto | `rescore` | Entrada 3, `cambio_entorno / continuidad_cumplida` (R2) |

La línea de tiempo de HU 14 y el "qué cambió desde tu última visita" de HU 20 E3 leen **3 entradas** en lugar de unas 92. Los recálculos descartados siguen siendo demostrables mediante `rescore`.

### 5.4 Motivos (`reason`): lista propuesta

| `reason` | Disparador | Regla | Historia |
| --- | --- | --- | --- |
| `nueva_evaluacion` | Primera evaluación del lead | R1 | HU 1 |
| `reevaluacion` | El lead vuelve a completar el formulario | R1 | HU 1 |
| `avance_plan` | El lead reporta un avance de su plan | R1 | HU 13 |
| `actualizacion_rapida` | El lead actualiza un dato con un toque | R1 | HU 20 E4 |
| `confirmacion_codeudor` | El co-deudor confirma valores | R1 | HU 18 E3 |
| `cambio_entorno` + `reason_detail` (`continuidad_cumplida`, `variacion_uf`, `catalogo`) | Recálculo del sistema | R2 | HU 20 E1 |

La revocación del co-deudor (HU 18 E4) se registra como evento. El recálculo siguiente usa el motivo de su propio disparador. **Pendiente** que el equipo confirme si la revocación debe recalcular de inmediato.

### 5.5 `audit_events`: columnas y lista de eventos

| Columna | Contenido | OWASP ([R3](#11-fuentes)) |
| --- | --- | --- |
| `id`, `occurred_at` | Identificador y marca de tiempo | Cuándo |
| `actor_id`, `actor_role` | Quién actuó: `lead`, `ejecutivo`, `admin`, `codeudor` o `sistema` (con `actor_id` nulo) | Quién |
| `subject_user_id` | El lead afectado. Es nulo en eventos globales. | Quién (sujeto) |
| `event_type` | Tipo, tomado de una lista cerrada | Qué |
| `entity_type`, `entity_id` | Sobre qué registro (entrada de historial, solicitud ARCO, escenario…) | Qué |
| `before`, `after` | Estado anterior y posterior, cuando se trata de un cambio de estado | Qué |
| `reason` | Motivo informado por una persona (HU 16 E2) | Qué |
| `source` | `web`, `backend` o `job` | Dónde |
| `details` | Contexto breve (identificadores, conteos, versión del algoritmo). **Nunca valores financieros ni datos personales en bruto.** | — |

Lista inicial para Sprint 2 (**propuesta**):

| `event_type` | Actor | Escribe | Historia |
| --- | --- | --- | --- |
| `consentimiento_otorgado`, `consentimiento_revocado` | lead | navegador | HU 1, RNF 4 E5 |
| `rescore` | lead / co-deudor / sistema | backend | RNF 5, HU 20 E1 |
| `no_viable_shown`, `simulate_success`, `register_savings` (migrados desde `events`) | lead | navegador | Actual |
| `simulation_saved` | lead | navegador | HU 17 E4 |
| `codeudor_invited`, `codeudor_consent_granted`, `codeudor_consent_revoked` | lead / co-deudor | navegador | HU 18 |
| `lead_viewed` | ejecutivo / admin | navegador | RNF 4 E1 ("se revisa") |
| `lead_reported`, `lead_status_changed` | ejecutivo / admin | navegador | HU 16 E2, E4 |
| `commercial_stage_changed` | ejecutivo | navegador | HU 15 E1, E2 |
| `crm_sync_sent`, `crm_sync_failed` | sistema | backend | HU 12 |
| `notification_sent` | sistema | backend | HU 20 E2 |
| `notifications_disabled` | lead | navegador | HU 20 E2 |
| `datos_suprimidos` | admin global | backend | §5.8, Ley 21.719 art. 11 |

Para qué sirve cada consumidor:

- **RNF 4 E2–E4:** es la vista de registros, en orden cronológico, con el responsable y la fecha.
- **HU 16 E4:** su historial de confiabilidad es un filtro sobre `lead_status_changed`.
- **HU 15 E2:** el tiempo hasta "Venta Cerrada" es la diferencia entre dos `commercial_stage_changed`.
- **HU 20 E2:** el tope de frecuencia cuenta los `notification_sent`, y la desactivación es el último `notifications_disabled`.
- **HU 14 E2:** "qué cambio produjo la oportunidad" es el evento `rescore` asociado a la entrada que llevó al lead a Alto.

La deduplicación de `shouldSkipEvent()` (H5) pasa a ser responsabilidad de la **interfaz**, por ejemplo "no mostrar de nuevo el aviso". El registro guarda todo.

### 5.6 Quién escribe

> **Quien calcula un hecho lo escribe; una persona solo puede registrar sus propias acciones.**

- **Backend:** `scoring_history`, `rescore` y los eventos del sistema. Usa la clave de servicio de Supabase desde una **variable de entorno** (nunca en el código ni en el navegador; esa clave omite RLS, [T2](#11-fuentes)).
- **Navegador:** solo `INSERT` en `audit_events`, con una política del tipo:

```sql
-- Ilustrativo, no es una migración
create policy "Audit insert own actions" on public.audit_events for insert
with check (
  actor_id = auth.uid()
  and event_type = any (public.allowed_event_types(public.get_my_role()))
);
```

- **Sin UPDATE ni DELETE** sobre `audit_events` para ningún rol del navegador.
- **Lectura:** el lead ve sus propios eventos, y el personal ve lo que E1 defina (ver H14).

Consecuencias:

- **Nueva dependencia de backend** (un cliente de Supabase o de Postgres). La justifica HU 20 E1: un recálculo nocturno no tiene navegador abierto.
- **Sin Supabase configurada, el escritor del backend no hace nada** y `POST /score` sigue funcionando en local (guardrail 3 de CLAUDE.md).
- **Riesgo aceptado:** un lead puede fabricar **sus propios** eventos de bajo impacto (por ejemplo `no_viable_shown`), pero no resultados de scoring ni acciones de otros.

### 5.7 Consentimiento

La Ley 21.719 asigna al responsable la carga de **probar** que contó con el consentimiento (art. 12, [L1](#11-fuentes)). Por eso se propone:

- Registrar `consentimiento_otorgado` y `consentimiento_revocado` como eventos propios, independientes del payload.
- **Sin consentimiento no hay eventos** (RNF 4 E5). La navegación previa al consentimiento no se registra, y ningún evento puede tener como sujeto a un lead sin `consentimiento_otorgado` vigente.

### 5.8 Supresión: anonimizar al sujeto y conservar la estructura

El art. 7 de la Ley 21.719 otorga el derecho de supresión con excepciones (obligación legal, fines estadísticos, contratos, entre otras). Además, define la **anonimización** como un procedimiento **irreversible** por el cual el dato no puede vincularse a una persona ([L1](#11-fuentes)).

**Propuesta:** un **procedimiento único en el backend**, la única excepción al trigger del §5.2, que al aprobarse una `cancelacion`:

1. **Vacía el contenido personal:** el `snapshot` de entradas, `evaluations.financial_data`, `email`, las comunas y los datos de `details` que identifiquen al titular.
2. **Conserva la estructura:** fechas, `reason`, `classification`, `score`, `algorithm_version`, el enlace `previous_id`, las etapas comerciales y las acciones del personal.
3. **Reemplaza el `user_id` / `subject_user_id` por un identificador aleatorio sin tabla de correspondencia**, para que sea irreversible.
4. **Registra `datos_suprimidos`** (quién aprobó, cuándo y qué solicitud), sin datos personales. El art. 11 exige conservar los respaldos de la respuesta.

Con esto se cumple el derecho del titular, las métricas agregadas de HU 15 siguen siendo correctas y queda auditado lo que hizo el personal. Se recomienda **reemplazar el `ON DELETE CASCADE`** de `scoring_history.user_id` por esta vía (H13).

**Límite:** con pocos datos, una estructura conservada (fechas, comuna, etapa) podría permitir reidentificar a alguien. Qué campos se conservan exactamente es una decisión de **E1** (§10).

## 6. Matriz de cumplimiento del criterio E2

| Exigencia de E2 | Hoy | Propuesta | Sección |
| --- | --- | --- | --- |
| Cómo se registran los **eventos** | Se agregan con `UPDATE` a `events`, con deduplicación (H1, H5) | `audit_events` de solo inserción, con lista cerrada de tipos y separación por escritor | §5.5, §5.6 |
| **Actores responsables** | No existe (H8) | `actor_id` y `actor_role`, con el sistema como actor explícito; el actor del navegador queda forzado a `auth.uid()` | §5.5, §5.6 |
| **Fechas** | `created_at`, y el timestamp de los eventos dentro de JSON | `occurred_at` en cada evento y `created_at` en cada entrada | §5.2, §5.5 |
| **Versiones de evaluación** | `algorithm_version` presente, pero con dos constantes y valores vacíos (H7) | Versión del algoritmo en cada entrada y en cada `rescore`, con una sola constante y check de no vacío | §5.2, §5.3 |
| **Motivo del cambio** | Dentro del `snapshot`, siempre `new_evaluation` (H6) | Columnas `reason` y `reason_detail` con lista cerrada; `reason` humano en eventos de estado | §5.2, §5.4 |
| **Relación entre evaluaciones anteriores y nuevas** | Solo inferible por fecha (H6) | `previous_id` y `sequence` por lead | §5.2 |

## 7. Referencias comparadas

La comparación contrasta cada decisión con prácticas externas. Donde hay diferencias, se señalan para el equipo; no se modificó ninguna decisión.

| Referencia | Qué hace | Qué se adopta | Divergencia |
| --- | --- | --- | --- |
| Versiones de FICO ([C1](#11-fuentes)) | FICO 2, 4, 5, 8, 9, 10 y 10T coexisten, y cada prestamista usa una versión distinta. Un score solo tiene sentido junto con su versión. | La versión del algoritmo acompaña a cada resultado, y los resultados antiguos no se recalculan con reglas nuevas. | Ninguna. |
| Consultas al informe de crédito ([C2](#11-fuentes)) | Las agencias guardan **quién consultó** el informe, en una sección separada del informe mismo (consultas *hard* y *soft*). | Un registro de recálculos (`rescore`) separado del historial, y `lead_viewed` para las consultas del personal. | Ninguna. |
| `supa_audit` de Supabase ([C3](#11-fuentes)) | Captura cambios de fila guardando la fila completa antes y después. | No se adopta. | No registra al actor; copia filas completas con datos personales, lo que choca con la supresión del §5.8; y el repositorio está **archivado desde febrero de 2025**. |
| `pgaudit` ([C4](#11-fuentes)) | Auditoría de sentencias a nivel de base, escrita en el log de Postgres, orientada a certificaciones. | Podría complementar a futuro, a nivel de infraestructura. | Solo conoce el rol de base de datos, no al usuario de la aplicación; no resuelve RNF 4 E2. |
| *Event sourcing* ([C5](#11-fuentes)) | Todo cambio es un evento, y el estado se reconstruye reproduciéndolos. Advierte que, si cambian las reglas, cada evento debe procesarse con las reglas de su momento. | Eventos de solo inserción, y versión del algoritmo en cada resultado (la advertencia de Fowler). | **Deliberada:** `scoring_history` no es una fuente de eventos completa, porque la regla R2 descarta resultados irrelevantes. Esa completitud la aporta `rescore`, pero sin el resultado íntegro. |
| PCI DSS 10.2.2 ([R1](#11-fuentes)) | Cada registro debe incluir usuario, tipo, fecha y hora, **éxito o fallo**, y origen. | `actor_id`, `event_type`, `occurred_at` y `source`. | **Para revisar:** el éxito o fallo se codifica en el tipo (`crm_sync_failed`) en lugar de en una columna `outcome`. Decidir si se agrega esa columna. |
| ISO 27001 A.8.15 ([R2](#11-fuentes)) | Los registros se protegen contra modificación o borrado no autorizados. | Revocación de privilegios y trigger en ambas tablas. | Ninguna. |
| OWASP Logging ([R3](#11-fuentes)) | Registrar cuándo, dónde, quién y qué; no registrar datos sensibles, o desidentificarlos; incorporar **detección de manipulación**. | Columnas del §5.5 y `details` sin datos financieros. | **Para revisar:** no se propone detección de manipulación, como una cadena de hashes, para Sprint 2. Queda en el §10. |

## 8. Impacto en las historias de Sprint 2

| Historia | Qué obtiene del modelo | Condición |
| --- | --- | --- |
| [HU 13](<../../Wiki RutaHogar/UserStories/HU13-seguimiento-mensual.md>) | E1 y E4: cada avance genera una entrada `avance_plan` (R1) y la evolución se lee de la cadena. | Informar `reason` al llamar al scoring. |
| [HU 14](<../../Wiki RutaHogar/UserStories/HU14-analisis-evolucion-comercial-lead.md>) | E1: línea de tiempo de entradas relevantes. E2: el `rescore` indica qué cambio produjo la oportunidad. | Requiere `previous_id` y `sequence`. |
| [HU 15](<../../Wiki RutaHogar/UserStories/HU15-dashboard-conversion-tiempos.md>) | E1, E2 y E4: embudo y tiempos a partir de `commercial_stage_changed`. | Las métricas se mantienen correctas tras una supresión (§5.8). |
| [HU 16](<../../Wiki RutaHogar/UserStories/HU16-gestion-leads-inconsistentes.md>) | E2 y E4: responsable, motivo y estado anterior y posterior en `lead_status_changed`. | La lista de tipos por rol (§5.6) define quién puede reportar y quién revisa. |
| [HU 18](<../../Wiki RutaHogar/UserStories/HU18-participacion-consentimiento-codeudor.md>) | E2: el consentimiento propio del co-deudor queda como evento. E3: el recálculo `confirmacion_codeudor` genera una entrada. | Decidir el efecto inmediato de la revocación (§5.4). |
| [HU 20](<../../Wiki RutaHogar/UserStories/HU20-retorno-por-cambio.md>) | E1: recálculos del sistema con `rescore` y la regla R2. E2: el tope de frecuencia se basa en `notification_sent`. E3: el delta se calcula entre las dos últimas entradas. | Requiere que el backend escriba en la base (§5.6). |
| [HU 12](<../../Wiki RutaHogar/UserStories/HU12-derivacion-comercial.md>) | Rastro de sincronizaciones y fallos. | — |
| [HU 17](<../../Wiki RutaHogar/UserStories/HU17-simulacion-financiamiento.md>) | Un escenario guardado es un evento, **no** una entrada de historial. | — |
| [RNF 4](<../../Wiki RutaHogar/RNF/RNF4-auditoria-tecnica.md>) | E1 a E5 cubiertos por `audit_events` y el §5.7. E6 (analítica) puede apoyarse en la misma tabla. | — |
| [RNF 5](<../../Wiki RutaHogar/RNF/RNF5-historial-inmutable.md>) | E1 a E4 cubiertos por el §5.2 y el §5.3. | Ajustar la redacción de E1 (§9). |

## 9. Cambios propuestos a la documentación

No se aplican en esta rama. Se aplican después de que el equipo apruebe este documento.

1. **[RNF 5](<../../Wiki RutaHogar/RNF/RNF5-historial-inmutable.md>):** en E1, reemplazar "cambio de configuración (HU 23)" por una referencia al §10 e incorporar las reglas R1 y R2. En E3, nombrar `reason` como columna. Agregar la excepción de supresión del §5.8.
2. **[RNF 4](<../../Wiki RutaHogar/RNF/RNF4-auditoria-tecnica.md>):** nombrar `audit_events`, distinguir actor de sujeto y enlazar la lista de eventos.
3. **Nueva página `Wiki RutaHogar/Database/scoring_history.md`**, y una futura `audit_events.md`.
4. **[Database/evaluations](<../../Wiki RutaHogar/Database/evaluations.md>):** quitar `algoritmo_version` y `component_breakdown`, que no existen, y agregar `executive_summary`, `commercial_guidance` y `housing_plan` (H11).
5. **[deuda-tecnica](<../../Wiki RutaHogar/deuda-tecnica.md>):** agregar H1, H3, H4, H7, H9, H11 y H13.
6. **[HU 20](<../../Wiki RutaHogar/UserStories/HU20-retorno-por-cambio.md>):** precisar en su nota que un recálculo del sistema genera una entrada de historial solo según la regla R2.

## 10. Riesgos y decisiones pendientes del equipo

| Pendiente | Decisión o evidencia requerida |
| --- | --- |
| Revisión del spike | Aprobar las decisiones del §5 y la lista de motivos y eventos. |
| Seguimiento en base | Ejecutar las consultas A, B y C del §11 para explicar el 43 % sin historial (H4) y el efecto de la supresión procesada (H9). |
| **HU 23 (Sprint 3)** | Decidir si un cambio de parámetros recalcula a los leads existentes. Recomendación preliminar: no; registrar el cambio una vez en `audit_events` y aplicarlo en el siguiente recálculo, para no disparar oportunidades falsas en HU 14 E2. |
| Constante de versión | Elegir entre `SCORING_VERSION` y `ALGORITHM_VERSION` (H7). |
| Datos existentes | Decidir si se migran las 30 filas con `events` a `audit_events`, y si las 155 evaluaciones sin historial se completan (marcadas como reconstruidas) o se dejan documentadas. |
| Supresión (E1) | Definir qué campos se conservan, la retención y el riesgo de reidentificación (§5.8). |
| Lectura entre inmobiliarias (E1) | H14. |
| Vigencia de la Ley 21.719 | Las fuentes secundarias indican el **1 de diciembre de 2026** ([L2](#11-fuentes)). No se pudo leer el artículo transitorio en la fuente oficial. E1 debe confirmarlo. Esto es una lectura técnica y **no constituye asesoría legal**. |
| Borrados | Probar en un entorno de prueba `deleteEvaluation()` y el borrado de una cuenta (H13). |
| Éxito o fallo, y detección de manipulación | Resolver las dos divergencias del §7. |
| Revocación del co-deudor | Decidir si recalcula de inmediato (§5.4). |

## 11. Fuentes

**Consultas a la base (2026-09-18, solo lectura).** Se ejecutaron nueve consultas sobre las tablas `scoring_history`, `evaluations` y `arco_requests`:

1. `pg_class`: estado de RLS.
2. `pg_policies`: políticas.
3. `information_schema.columns`: columnas.
4. `pg_constraint`: restricciones y FKs.
5. `information_schema.triggers`: triggers.
6. `information_schema.role_table_grants`: privilegios de `anon` y `authenticated`.
7. Conteos de evaluaciones, historial, evaluaciones sin historial y cancelaciones.
8. `algorithm_version × calculation_reason`.
9. Filas con `events`.

Consultas de seguimiento **pendientes**:

- **A:** evaluaciones sin historial por mes, y cuántas registraron el fallo.
- **B:** datos restantes de la cancelación procesada (solo conteos).
- **C:** uso de `deleted_at`, `user_id` nulo y fecha de la primera fila de historial.

**Normativa (oficial)**

- **L1:** [Ley 21.719, texto en BCN LeyChile](https://www.bcn.cl/leychile/navegar?idNorma=1209272). Art. 2 (definiciones de anonimización y seudonimización), art. 7 (supresión), art. 11 (plazo de 30 días y respaldos de la respuesta), art. 12 (carga de probar el consentimiento) y art. 14 quinquies (acreditar las medidas de seguridad). Consultado mediante el servicio de LeyChile el 2026-09-18.
- **L2 (secundaria):** [Prey — Ley 21.719: obligaciones y plan de cumplimiento](https://preyproject.com/es/blog/ley-de-proteccion-de-datos-en-chile) y [Lawwwing — Ley 21.719](https://lawwwing.com/la-nueva-era-de-la-proteccion-de-datos-en-chile-que-cambia-con-la-ley-21-719/): publicación el 13-12-2024 y vigencia el 01-12-2026.

**Técnica (oficial)**

- **T1:** [PostgreSQL — Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html): comandos cubiertos, `TRUNCATE` excluido, denegación por defecto y combinación con OR.
- **T2:** [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security): la clave de servicio omite RLS y no debe exponerse en el navegador; roles `anon` y `authenticated`.
- **T3:** [Supabase — Column Level Security](https://supabase.com/docs/guides/database/postgres/column-level-security): "no recomendado para la mayoría"; se prefieren tablas dedicadas.

**Estándares**

- **R1 (secundaria):** [PCI DSS Requirement 10 explicado](https://pcidssguide.com/pci-dss-requirement-10/): atributos de 10.2.2.
- **R2 (secundaria):** [ISMS.online — ISO 27001:2022 A.8.15](https://www.isms.online/iso-27001/annex-a-2022/8-15-logging-2022/).
- **R3:** [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html).

**Comparación**

- **C1 (secundaria):** [myFICO — FICO Score versions](https://www.myfico.com/credit-education/credit-scores/fico-score-versions).
- **C2 (secundaria):** [Experian — quién puede obtener tu informe de crédito (FCRA)](https://www.experian.com/blogs/ask-experian/fcra-restricts-who-can-get-your-credit-report/).
- **C3:** [supabase/supa_audit](https://github.com/supabase/supa_audit), repositorio archivado el 16-02-2025.
- **C4:** [pgaudit/pgaudit](https://github.com/pgaudit/pgaudit).
- **C5:** [Martin Fowler — Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html).

Las fuentes internas están enlazadas junto a cada hallazgo (§3). Los números de línea corresponden al commit base de esta rama.

## 12. Conclusión respecto del cumplimiento de E2

La investigación cubre las seis exigencias del criterio en la matriz del §6: eventos, actores, fechas, versiones, motivo y relación entre evaluaciones. El punto de partida es el estado **verificado en la base**, no uno supuesto. Además deja registrados problemas que el criterio no pedía pero que condicionan a las historias de Sprint 2: el historial es editable y falsificable (H1, H3), el 43 % de las evaluaciones no tiene historial (H4) y las supresiones no tienen efecto (H9).

Lo que se da por cumplido es el **criterio de investigación**, y queda sujeto a la revisión del equipo. No se afirma que la trazabilidad esté implementada ni que el Sprint esté aceptado. Solo se crea este documento y se actualiza la fila E2 de la página del Spike. **No hay cambios en el código del producto, frontend, backend, Supabase, scoring, contratos, migraciones, políticas ni dependencias.**
