# Historias de usuario — RutaHogar

Backlog aprobado para los Sprints 1 a 3. Cada historia tiene su propia página con la descripción y
los criterios de aceptación transcritos del documento fuente del backlog.

**Estado:** ✅ Implementada · ⚠️ Parcial o pendiente de merge · 🗓 Planificada · 💡 Propuesta sin numerar

> El estado refleja lo que el código hace hoy en `develop`, verificado criterio por criterio con citas a
> `archivo:línea` en la sección **Estado frente al código** de cada página. Un criterio sin
> evidencia citable es un criterio no verificado. Cuando una historia está construida pero su PR
> sigue abierto, su página lo dice y cita la rama.

> **Los Sprints 2 y 3 se renumeraron** con el documento *HUs para Sprint 2* acordado por el equipo.
> Ese documento es la fuente de verdad y reemplaza la numeración anterior; el detalle de qué cambió
> está en [Advertencias del backlog](#advertencias-del-backlog). Sprint 1 y el PMV no se tocaron.

---

## Sprint 1 — 60 SP

| ID | Historia | Categoría | SP | Actor | Estado |
| :- | :------- | :-------- | :-: | :---- | :----- |
| Spike 1 | Investigación financiera, scoring, educación financiera y criterios de priorización comercial | Spike | 13 | Equipo | 🗓 |
| [[HU4-plan-de-mejora\|HU 4]] | Generación de plan de mejora personalizado | Importante | 8 | Lead | ⚠️ |
| [[HU5-academia-financiera\|HU 5]] | Academia financiera contextual | Esencial | 8 | Lead | ✅ |
| [[HU6-simulacion-compatibilidad\|HU 6]] | Simulación de compatibilidad y alternativas accesibles | Esencial | 8 | Lead | ⚠️ |
| [[HU7-catalogo-de-proyectos\|HU 7]] | Gestión del catálogo de proyectos inmobiliarios | Esencial | 5 | Administrador inmobiliario | ⚠️ |
| [[HU8-beneficios-habitacionales\|HU 8]] | Detector de beneficios habitacionales aplicables | Importante | 5 | Lead | 🗓 |
| [[HU9-cotizacion-orientativa\|HU 9]] | Cotización orientativa por proyecto | Esencial | 5 | Lead | ⚠️ |
| [[HU10-matching-lead-proyecto\|HU 10]] | Matching lead-proyecto para ejecutivos comerciales | Importante | 5 | Ejecutivo comercial | ⚠️ |
| [[HU11-checklist-preparacion-bancaria\|HU 11]] | Checklist de preparación bancaria | Importante | 3 | Lead | ⚠️ |

---

## Sprint 2 — 62 SP

| ID | Historia | Categoría | SP | Actor | Estado |
| :- | :------- | :-------- | :-: | :---- | :----- |
| Spike 2 | Validación técnica de privacidad, roles, trazabilidad, datos e integraciones externas | Spike | 13 | Equipo | 🗓 |
| [[HU12-derivacion-comercial\|HU 12]] | Sistema de Derivación e Integración Comercial | Importante | 5 | Ejecutivo · Administrador inmobiliario | 🗓 |
| [[HU13-seguimiento-mensual\|HU 13]] | Seguimiento plan de mejora | Importante | 3 | Lead | ⚠️ |
| [[HU14-analisis-evolucion-comercial-lead\|HU 14]] | Análisis y evolución comercial del lead | Deseable | 5 | Ejecutivo comercial | 🗓 |
| [[HU15-dashboard-conversion-tiempos\|HU 15]] | Dashboard de conversión y tiempos del proceso comercial | Deseable | 8 | Administrador · Ejecutivo | 🗓 |
| [[HU16-gestion-leads-inconsistentes\|HU 16]] | Gestión de leads inconsistentes o sospechosos | Deseable | 8 | Ejecutivo comercial | 🗓 |
| [[HU17-simulacion-financiamiento\|HU 17]] | Simulación configurable de financiamiento hipotecario | Importante | 3 | Lead | 🗓 |
| [[HU18-participacion-consentimiento-codeudor\|HU 18]] | Participación y consentimiento del co-deudor | Importante | 3 | Lead · Co-deudor | 🗓 |
| [[HU19-portal-inmobiliario-rag\|HU 19]] | Portal Inmobiliario Inteligente (RAG) | Importante | 8 | Lead | 🗓 |
| [[HU20-retorno-por-cambio\|HU 20]] | Lo que cambió desde tu última visita | Deseable | 5 | Lead | 🗓 |

> **Los SP declarados suman 61, no 62.** El documento fuente cierra el sprint en 62 SP. El SP que
> falta no se reparte aquí: lo asigna el equipo.
>
> **[[HU19-portal-inmobiliario-rag|HU 19]] es una historia nueva** sin antecedente en este wiki, y
> la única con cinco criterios. Introduce búsqueda vectorial y un origen de propiedades externo al
> catálogo de [[HU7-catalogo-de-proyectos|HU 7]]; de dónde salen esas propiedades y con qué permiso
> es una decisión previa a estimarla.

---

## Sprint 3 — 38 SP

| ID | Historia | Categoría | SP | Actor | Estado |
| :- | :------- | :-------- | :-: | :---- | :----- |
| [[HU22-actualizacion-mapa-accesibilidad\|HU 22]] | Actualización dinámica del mapa de accesibilidad | Opcional | 5 | Lead | 🗓 |
| [[HU23-parametros-scoring\|HU 23]] | Configuración de parámetros de scoring | Opcional | 5 | Administrador inmobiliario | 🗓 |
| [[HU24-carga-documentos\|HU 24]] | Carga de documentos respaldatorios | Deseable | 5 | Ejecutivo comercial | 🗓 |
| [[HU25-exportacion-dossier\|HU 25]] | Exportación de dossier para evaluación bancaria | Opcional | 3 | Ejecutivo comercial | 🗓 |
| [[HU26-simulacion-subsidios\|HU 26]] | Simulación avanzada de subsidios habitacionales | Deseable | 5 | Lead | 🗓 |
| [[HU27-revision-antecedentes\|HU 27]] | Revisión referencial de antecedentes declarados | Deseable | 5 | Ejecutivo comercial | 🗓 |
| [[HU28-gastos-iniciales\|HU 28]] | Estimador de gastos iniciales de compra | Importante | 5 | Lead | 🗓 |
| [[HU29-comparador-costo-credito\|HU 29]] | Comparador de costo total referencial del crédito | Importante | 5 | Lead | 🗓 |
| [[HU30-ranking-proyectos-brecha\|HU 30]] | Ranking de proyectos por brecha mínima | Importante | *(sin definir)* | Lead | 🗓 |
| [[HU31-mapa-accesibilidad\|HU 31]] | Visualización de mapa de accesibilidad inmobiliaria | Opcional | *(sin definir)* | Lead | 🗓 |

> Los 38 SP del sprint son la suma de las ocho historias con puntos asignados.
> [[HU30-ranking-proyectos-brecha|HU 30]] y [[HU31-mapa-accesibilidad|HU 31]] quedan sin puntos en
> el documento fuente, que sobre la primera anota *"Falta HU30 4 SP"*.
>
> **[[HU31-mapa-accesibilidad|HU 31]] está fuera de orden a propósito.** El documento fuente traía
> el mapa de accesibilidad con el número 21, chocando con la carga por tipología. El equipo resolvió
> la colisión moviendo el mapa a HU 31; después retiró la carga por tipología del backlog, así que
> **el número 21 quedó vacante**.

---

## PMV — ya entregado

| ID | Historia | Categoría | SP | Actor | Estado |
| :- | :------- | :-------- | :-: | :---- | :----- |
| [[HU1-ingreso-datos-financieros\|HU 1]] | Ingreso de datos financieros | Compleja | 5 | Lead | ✅ |
| [[HU2-priorizacion-leads\|HU 2]] | Priorización de leads calificados | Compleja | 5 | Ejecutivo comercial | ⚠️ |
| [[HU3-scoring-hibrido\|HU 3]] | Scoring híbrido con explicación inteligente | Muy compleja | 8 | Lead | ✅ |

El documento fuente del backlog no lista HU 1 a HU 3 porque corresponden al PMV ya construido. Sus
números y criterios se mantienen sin cambios.

---

## Propuestas sin numerar

Hallazgos **detectados durante la ejecución de otras historias**, con página escrita y origen
citado, que el documento del equipo no incorporó al backlog. **No tienen número de HU** — así no
compiten con la numeración aprobada — y no suman SP a ningún sprint. Entran al backlog el día que el
equipo las priorice y les asigne número.

| Propuesta | Categoría | Actor | Origen |
| :-------- | :-------- | :---- | :----- |
| [[propuesta-primera-vivienda-fogaes\|Primera vivienda / FOGAES]] | Importante | Lead | Spike 1 E4 §10.5 — vía HU 10 |
| [[propuesta-captura-solicitud-contacto\|Captura de solicitudes de contacto]] | Esencial | Ejecutivo comercial | CATALOGO-UNICO-HU9 — vía HU 9 |
| [[propuesta-matching-nivel-unidad\|Matching a nivel de unidad]] | Deseable | Lead | UNIDADES-PROYECTO — vía HU 10 |
| [[propuesta-carga-proyectos-por-unidad\|Carga de proyectos por unidad y tipología]] | Importante | Administrador inmobiliario | UNIDADES-PROYECTO — vía HU 7 |
| [[propuesta-importacion-masiva-catalogo\|Importación masiva del catálogo]] | Deseable | Administrador inmobiliario | Detectada con HU 21 — vía HU 7 |
| [[propuesta-transparencia-complemento-renta\|Transparencia del complemento de renta]] | Importante | Lead | Spike 1 E4 §10.1 — vía HU 1 / HU 3 |
| [[propuesta-complemento-vista-ejecutivo\|Complemento en la vista del ejecutivo]] | Importante | Ejecutivo comercial | Spike 1 E4 §10.1 — vía HU 2 |

> **Dos propuestas de este grupo sí entraron al backlog** y por eso ya no figuran aquí: el retorno
> por cambio es [[HU20-retorno-por-cambio|HU 20]] y la participación del co-deudor es
> [[HU18-participacion-consentimiento-codeudor|HU 18]]. La carga por unidad y tipología llegó a
> estar en Sprint 2 y el equipo la retiró; vuelve a esta tabla.
>
> **[[propuesta-matching-nivel-unidad|Matching a nivel de unidad]] sigue bloqueada por su
> precondición**, que es [[propuesta-carga-proyectos-por-unidad|Carga de proyectos por unidad y tipología]]. Ninguna de las dos
> está en el backlog numerado, así que se priorizan juntas o no se priorizan.
>
> **Dos de ellas comparten una precondición de correctitud que ninguna historia numerada recogió:**
> el defecto §10.1 del Spike 1 — `indicators.py` suma la renta del co-deudor e ignora su deuda, así
> que toda capacidad con complemento está sobreestimada hoy. Afecta también a
> [[HU18-participacion-consentimiento-codeudor|HU 18]], que sí está comprometida en Sprint 2.

---

## Advertencias del backlog

- **Los Sprints 2 y 3 fueron renumerados** por el documento *HUs para Sprint 2* del equipo. El
  documento es la fuente de verdad: donde difería del wiki, se impuso el documento. Sprint 1, el PMV
  y los RNF no cambiaron.
- **La duplicación HU 14 / HU 21 quedó resuelta.** El backlog anterior traía el mapa de accesibilidad
  dos veces con texto idéntico, una en Sprint 2 y otra en Sprint 3. El documento nuevo lo deja una
  sola vez, en Sprint 3, y esa página es [[HU31-mapa-accesibilidad|HU 31]]. La página duplicada de
  Sprint 2 se eliminó.
- **Los cupos reservados HU 20 y HU 30 dejaron de estar vacíos.** HU 20 pasó a ser "Lo que cambió
  desde tu última visita" y HU 30 el ranking de proyectos por brecha mínima, que además se movió de
  Sprint 2 a Sprint 3.
- **El número 21 quedó vacante.** El documento fuente lo asignaba a dos historias a la vez; el
  equipo movió el mapa de accesibilidad a HU 31 y después retiró la carga por unidad y tipología del
  backlog. Ningún número se reutiliza para no alterar la numeración ya acordada.
- **Los criterios de HU 20 llegaron aparte.** El documento fuente los traía equivocados — un
  copy-paste de los de la carga por tipología — y el equipo entregó los correctos por separado. La
  página tiene los criterios reales y la historia es planificable.
- **Dos historias no traen puntos de historia** en el documento fuente: HU 30 y HU 31. Los totales
  de sprint se calculan sin ellas y las páginas lo declaran.
- **Ninguna historia de seguimiento genera retorno por sí sola.** HU 4, HU 13 y HU 20 se leen juntas:
  HU 4 produce el plan, HU 13 la mecánica de registro y proyección, HU 20 el motivo para volver.
  Comprometer HU 13 sin HU 20 deja el ciclo abierto por el lado del usuario ausente.

---

## Requisitos no funcionales

Diez requisitos que antes eran historias viven ahora en [[../RNF/RNF1-seguridad-basica|RNF/]],
indexados por [[../AtributosDeCalidad|Atributos de calidad]]: seguridad básica, privacidad mínima,
roles y permisos, auditoría técnica, historial inmutable, experiencia móvil del lead, dashboard
móvil del ejecutivo, disponibilidad y escalabilidad, manejo seguro de errores y validación de
entradas.

El documento del equipo confirma esta lista y la mantiene fuera de las historias numeradas.

---

## Spikes

| Spike | Nombre | SP | Sprint |
| :---- | :----- | :-: | :----- |
| Spike 1 | Investigación financiera, scoring, educación financiera y criterios de priorización comercial | 13 | Sprint 1 |
| Spike 2 | Validación técnica de privacidad, roles, trazabilidad, datos e integraciones externas | 13 | Sprint 2 |

**Entregable de Spike 1:** [E4 — Criterios de matching lead-proyecto](../../docs/research/spike1-e4-lead-project-matching-criteria.md) — modelo de capacidad y contrato congelado para [[HU10-matching-lead-proyecto|HU 10]].

**Spike 2** cubre seis frentes en el documento nuevo: permisos por rol y consentimiento, auditoría e
historial versionado, integración comercial y servicios externos, fuentes de datos externas, flujos
y experiencia de usuario, y el ecosistema de corredores inmobiliarios.

El documento anota además un frente de investigación **para Sprint 3**: validación de datos y
viabilidad técnica para la visualización inmobiliaria, insumo de
[[HU31-mapa-accesibilidad|HU 31]].

---

## Actores

| Actor | Descripción |
| :---- | :---------- |
| **Lead** | Persona interesada en comprar su primera vivienda. Completa el formulario, recibe su score y sigue un plan de mejora personalizado. |
| **Ejecutivo comercial** | Profesional de venta inmobiliaria. Gestiona el dashboard priorizado de leads y cierra negocios. |
| **Administrador inmobiliario** | Representante de la inmobiliaria contratante. Asigna roles de ejecutivo, gestiona el catálogo de proyectos y los parámetros de scoring. |
| **Administrador desarrollador** | Miembro del equipo de desarrollo. Se hace cargo de trazabilidad, logs, seguridad y ajustes manuales de score. |
| **Co-deudor** *(nuevo)* | Tercero cuya renta complementa la del lead. Aporta y confirma sus propios datos y otorga su propio consentimiento; no navega la plataforma. Lo introduce [[HU18-participacion-consentimiento-codeudor\|HU 18]]. |

Detalle completo en [[../Actores\|Actores / Roles]].

---

## Páginas relacionadas

- [[../Distribucion\|Distribución / Sprints]] — plan de sprints y totales de SP.
- [[../Riesgos\|Riesgos técnicos]] — riesgos con su fórmula de prioridad.
- [[../AtributosDeCalidad\|Atributos de calidad (RNF)]] — índice de la carpeta `RNF/`.
- [[../Actores\|Actores / Roles]] — los actores del sistema en detalle.
