# Survey de Cobertura de Requisitos — RutaHogar

> Fecha: 2026-06-24 (actualizado con `hus_24-06-26_v2.md`)
> Insumos: `RutaHogar Blueprint.md` (requisitos funcionales y no funcionales) y el set de historias acordado por el equipo `hus_24-06-26_v2.md` (HU4–HU33 + 2 HU móviles) + las historias base HU1–HU3 (= HdU 1–3 originales: formulario, priorización, scoring híbrido con explicación IA).
> Objetivo: medir qué requisitos del blueprint estamos cubriendo como grupo, cuáles no, y qué requisitos nuevos crearon o insinuaron las HU acordadas. **No** crea historias nuevas.
>
> **Escala de cobertura:** 3 = Cubierto · 2 = Parcial (falta algo, se detalla) · 1 = No cubierto.
>
> **Novedades de la v2 (respecto de la v1 del survey):** se agregaron HU24 (estimación de postulación a crédito), HU25 (consulta simulada CMF), HU26 (simulación de subsidios DS19), HU27 (simulación de plazos), HU29 (dashboard de conversión de ventas), HU32 (derecho al olvido + anonimización), HU33 (visualización demográfica) y **dos HU móviles** (experiencia del lead y dashboard ejecutivo). Esto cambia tres cosas clave del survey: (1) la **app móvil** deja de ser hueco total y pasa a Parcial; (2) aparece la primera HU que **mide el objetivo de negocio** (ciclo de venta a 3 meses, HU29); (3) crece una **familia de simuladores** y una **familia de analítica** con solapamientos que conviene consolidar.

---

## 1. Resumen ejecutivo

**Lo que está bien cubierto (3):** formulario, scoring + clasificación, explicación IA, capacidad de compra, plan de mejora, matching lead-proyecto, catálogo de proyectos, integración CRM, Academia financiera, RBAC, seguridad y privacidad. El núcleo del producto está representado en historias.

**Los huecos más grandes (1 — sin ninguna HU):**
- **Notificaciones multicanal (WhatsApp / email / push).** El blueprint las comprometió (Meta WhatsApp Cloud API + Resend + Expo Push) y **sigue sin HU dedicada**. Solo aparecen *insinuadas* (HU24 E2 "notificar al usuario por sus medios de contacto"). Sin esto no hay notificación de lead Alto, ni re-engagement, ni avisos al usuario.
- **Agendamiento lead ↔ ejecutivo.** Comprometido en el blueprint (M3), **sin HU**.

**Coberturas parciales peligrosas (2 — "creemos que está, pero falta la mitad"):**
- **App móvil (FR21):** las dos nuevas HU móviles resuelven la **experiencia responsive** (lead + dashboard ejecutivo), pero **no representan el track nativo React Native + Expo** del blueprint. Mobile-web ≠ app nativa.
- **OCR:** HU18 solo sube/almacena/visualiza documentos. No hay extracción OCR del contenido.
- **Engagement / compromiso del usuario:** HU22 registra eventos y HU17 muestra evolución, pero **nadie computa el score de compromiso** ("usuario más comprometido, venta más rápida"). La señal se captura; el diferenciador no se construye.
- **Historial inmutable de evaluaciones:** HU15 es un log de auditoría; el blueprint (HdU 3 E5) exige un **registro inmutable**. Auditoría ≠ inmutabilidad. Agravante: HU8 E11, HU14, HU25 E4 y HU26 E2 **recalculan/ajustan el scoring** — hay que definir cómo conviven recálculo dinámico e inmutabilidad/versionado.
- **Integración CMF/Dicom:** HU25 ofrece una **consulta *simulada*** (reglas internas), no la integración real comprometida en el blueprint (M3). Útil como puente, pero no es la integración.
- **Re-engagement:** HU17 es el lado ejecutivo; falta el **nudge automático al usuario**.

**Avance nuevo y valioso:** **HU29 (Dashboard de conversión de ventas)** es la **primera historia que mide un objetivo de negocio del blueprint** (reducir el ciclo de venta de ~12 a ~3 meses). Conviene protegerla y darle prioridad real.

**Deriva de prioridades (riesgo estratégico):** el **mapa de accesibilidad**, diferenciador estrella del blueprint (Milestone 1, ningún competidor lo tiene), sigue marcado como **HU10 — Opcional (13 SP)**. En la práctica no se construirá. Ver §4.

**Estimación incompleta:** casi todas las HU nuevas (HU24, HU25, HU26, HU27, HU29, HU32, HU33 y las móviles) están sin categoría ni Story Points (marcadas "CALCULAR"/"RECALCULAR"). No se pueden planificar sprints con esto. Ver §4.

**Requisitos nuevos que aparecieron en las HU (no estaban en el blueprint):** configuración de scoring por el cliente (HU14), gestión/reporte de fraude (HU23), dossier bancario (HU20), comparador de evaluaciones (HU17 E4), analítica de logs con explicabilidad IA (HU22), recuperación de contraseña (HU7 E4), reportes descargables (HU21), **estimación de postulación a crédito (HU24)**, **consulta simulada CMF + ajuste de scoring (HU25)**, **simulación de subsidios DS19 (HU26)**, **simulación de plazos (HU27)**, **dashboard de conversión (HU29)**, **anonimización para métricas históricas (HU32/HU33)**, **visualización demográfica/socioeconómica (HU33)**. Ver §5.

---

## 2. Requisitos Funcionales — cobertura

| # | Requisito funcional (blueprint) | HU que lo cubre | Score | Qué falta / nota |
|:-:|:--------------------------------|:----------------|:-----:|:-----------------|
| FR1 | Formulario de preevaluación guiado | HU1 (HdU1) | 3 | — |
| FR2 | Motor de scoring híbrido (reglas + IA) | HU6, HU3, HU14 | 3 | HU6 no explicita bandas v2 (dividend ratio, total burden, pie escalonado). Nota "*mejorar el scoring* + spike" confirma pendiente. |
| FR3 | Explicación asistida por IA del scoring | HU3, HU12 E3 | 3 | Cubierto para usuario y evidencia al ejecutivo. |
| FR4 | Clasificación y gestión de leads por rol del ejecutivo | HU12, HU16, HU4, HU17 | 3 | Matching por capacidad absoluta (HU12 E2) + catálogo (HU16) alineados. |
| FR5 | Plan de mejora personalizado | HU8 | 3 | 12 CAs; requiere recálculo de SP. |
| FR6 | Educación financiera (módulo) | HU11 | 3 | Academia con catálogo + contenido contextual + enlaces. |
| FR7 | Mapa de accesibilidad de la RM | HU10 | 3 | Cubierto a nivel de CAs **pero Opcional** → deriva §4. |
| FR8 | Estimación de capacidad de compra absoluta | HU6 E2, HU9 E4 | 3 | Concepto "capacidad absoluta" elevado a FR de primera clase. |
| FR9 | Simulador hipotecario / de estrés (UF, tasas) | HU19, HU9, HU27 | 3 | Cubierto y reforzado (HU27 plazos). **HU19 = Opcional 1 SP** (irreal) → §4. |
| FR10 | Seguimiento financiero del usuario | HU8 (E2, E3) | 3 | Avance mensual + proyección de elegibilidad. |
| FR11 | Re-engagement (incentivar volver a actualizar datos) | HU17 (parcial) | 2 | Falta nudge automático al usuario. |
| FR12 | Memoria de compromiso (engagement scoring) | HU22, HU17 (parcial) | 2 | Se registran eventos y se ve evolución, pero **no se computa el score de compromiso**. |
| FR13 | Notificaciones multicanal (WhatsApp/email/push) | HU24 E2 (insinuado) | 1 | **Sin HU dedicada.** Solo insinuado. Bloquea notificación de lead Alto y re-engagement. |
| FR14 | Asignación de leads + métricas comerciales | HU12, HU21, HU17, HU29 | 3 | Pool compartido + métricas (HU21) + embudo de conversión (HU29). |
| FR15 | Agendamiento lead ↔ ejecutivo | — | 1 | **Sin ninguna HU.** Comprometido (M3). |
| FR16 | Integración con CRM | HU4 | 3 | — |
| FR17 | OCR de documentos | HU18 (parcial) | 2 | Solo carga/almacena/visualiza. **Falta extracción OCR.** |
| FR18 | Historial inmutable de evaluaciones | HU15, HU17 (parcial) | 2 | Log de auditoría ≠ inmutabilidad (HdU 3 E5). Tensión con recálculo dinámico (HU8 E11/HU14/HU25/HU26). |
| FR19 | Gestión de usuarios y roles (RBAC) | HU13 | 3 | — |
| FR20 | Trazabilidad de consentimiento y auditoría de datos | HU7, HU15, HU22 E3, HU32 | 3 | Panel de privacidad + audit log + logging condicionado + anonimización (HU32). |
| FR21 | App móvil (React Native + Expo) | HU móvil lead, HU móvil dashboard (parcial) | 2 | Resuelven experiencia **responsive**; **no** el track nativo RN+Expo del blueprint. |
| FR22 | Integración CMF / Dicom | HU25 (parcial — simulada) | 2 | HU25 es consulta **simulada** con reglas internas, no la integración real (M3). |

---

## 3. Requisitos No Funcionales — cobertura

| # | NFR (blueprint) | HU / mecanismo | Score | Qué falta / nota |
|:-:|:----------------|:---------------|:-----:|:-----------------|
| NFR1 | Seguridad | HU5 | 3 | Validación de entradas, no exponer trazas/SQL/tokens, queries parametrizadas. |
| NFR2 | Privacidad | HU7, HU18 E2, HU22 E3, HU32 | 3 | Consentimiento, descarga/rectificación, eliminación irrecuperable, **anonimización para métricas** (HU32). |
| NFR3 | Trazabilidad | HU15, HU17, HU22 | 3 | Registro de acciones, responsable, orden cronológico. Caveat: inmutabilidad (FR18). |
| NFR4 | Rendimiento (<60 s mostrar score) | HU9 E5 (sim. ≤30 s) | 2 | HU9 fija 30 s para la **simulación**; **falta** fijar el <60 s del **scoring** en una HU. |
| NFR5 | Usabilidad (≥80% completa <10 min) | HU móvil (E5 prueba en resoluciones) | 2 | Las HU móviles introducen pruebas de UI en resoluciones reales; **falta** la meta de completitud/tiempo del blueprint. |
| NFR6 | Disponibilidad (≥95% uptime) | — | 1 | Sin HU ni monitoreo asociado. |
| NFR7 | Escalabilidad (≥100 evaluaciones) | — | 1 | Sin HU ni prueba de carga asociada. |
| NFR8 | Mantenibilidad (código modular) | — (práctica estructural) | 1 | No tiene historia; considerar criterio en DoD. |

---

## 4. Deriva de prioridades (riesgos a resolver)

| Feature | Blueprint | Grupo (HU) | Riesgo |
|:--------|:----------|:-----------|:-------|
| Mapa de accesibilidad | Milestone 1 — diferenciador estrella | **HU10 Opcional, 13 SP** | **Alto.** Opcional + 13 SP ⇒ casi seguro no se construye. Contradice la propuesta de valor central. |
| Simulación UF/tasas | Milestone 2, comprometido | **HU19 Opcional, 1 SP** | **Medio.** 1 SP irreal para matemática UF/tasa + alerta de riesgo. Re-estimar. |
| Academia financiera | Milestone 3 | **HU11 Esencial, 8 SP** | Bajo; adelanta recursos. Validar capacidad. |
| Plan de mejora | — | **HU8, 8 SP con 12 CAs** | **Medio.** El doc dice "recalcular SP". 12 CAs no caben en 8 SP. Dividir. |
| Dashboard de conversión (objetivo de negocio) | Implícito en Business Goals | **HU29 sin categoría ni SP** | **Medio-alto.** Es la única HU que mide el KPI central (ciclo a 3 meses); no debería quedar sin estimar/priorizar. |
| Bloque de HU nuevas sin estimar | — | HU24, HU25, HU26, HU27, HU29, HU32, HU33, HU móviles, + HU6/HU14/HU21/HU23 | **Alto en planificación.** Marcadas "CALCULAR"/"RECALCULAR" o con campos vacíos. Sin categoría/SP no hay sprint plan confiable. |

**Notas editoriales del propio equipo a resolver** (vienen en el archivo):
- HU26 (subsidios): *"agregar esto puede ser bueno pero no como HU dedicada"*.
- HU32 (derecho al olvido): *"ver si dejarla o no… la eliminación de cuenta ya está en HU7"* → solapamiento con HU7 E3; lo único nuevo es la **anonimización** (E3).
- HU25 (CMF): *"agregar CA1 de la HU anterior a esta"*.

---

## 5. Requisitos NUEVOS creados o insinuados por las HU

### 5.1 Nuevos requisitos funcionales

| Origen | Nuevo FR | Descripción | Impacto |
|:-------|:---------|:------------|:--------|
| HU14 | Configuración de parámetros de scoring por el cliente | Admin inmobiliario modifica parámetros del motor. | Alto. Interactúa con `SCORING_VERSION`/inmutabilidad: cada evaluación debe registrar qué configuración usó. |
| HU23 | Gestión y reporte de fraude | Indicadores de fraude + reporte + quitar del dashboard + notificación de estado. | Medio-alto. Ausente del blueprint. |
| HU20 | Dossier bancario exportable | Expediente PDF con score, perfil y documentos. | Distinto del CRM (FR16). Nueva ruta de derivación bancaria. |
| HU21 | Reportes comerciales descargables | Volumen, clasificaciones, tasas; Excel/PDF. | Concreta analítica admin en artefacto descargable. |
| HU17 E4 | Comparador de evaluaciones | Comparar dos evaluaciones (mismo/distinto lead). | Nueva herramienta analítica para el ejecutivo. |
| HU22 | Analítica de logs de eventos | Dashboard de logs + gráficos + estadísticas. | Expande analítica admin a BI completo. |
| HU7 E4 | Recuperación / cambio de contraseña | Flujo de restablecimiento. | Detalle de auth ausente del blueprint. |
| **HU24** | **Estimación de postulación a crédito hipotecario** | Estimar cuánto y **dónde** (qué institución) convendría postular, con resumen explicativo y notificación al usuario. | Nuevo. Va más allá de la capacidad de compra: introduce recomendación de **dónde** postular. Roza scope bancario. |
| **HU25** | **Consulta simulada a la CMF + ajuste de scoring** | Simular antecedentes de morosidad/endeudamiento, clasificar riesgo (Bajo/Medio/Alto/Crítico) y **ajustar el scoring** registrando el motivo. | Nuevo. Puente hacia la integración CMF real (FR22). El ajuste de scoring refuerza la tensión con inmutabilidad/versionado. |
| **HU26** | **Simulación de subsidios habitacionales (DS19)** | Sugerir/simular subsidios, recalcular dividendo, mostrar opciones compatibles. | Nuevo. El blueprint trataba subsidio/FOGAES como *recomendación*, no como simulador. El equipo duda si debe ser HU dedicada. |
| **HU27** | **Simulación de variación de plazos (20/25/30)** | Ajustar cuota/interés por plazo, validar tope etario (>70/76), gráfico comparativo. | Nuevo/solapado con HU9, HU19 y la palanca "plazo" del what-if. |
| **HU29** | **Dashboard de conversión de ventas** | Embudo, % "En plan" → "Venta cerrada", tiempo promedio preevaluación→venta, series temporales. | **Nuevo y estratégico:** única HU que mide el **objetivo de negocio** (ciclo a 3 meses). |
| **HU33** | **Visualización demográfica y socioeconómica** | Distribución de leads por edad/renta/deuda, informe PDF, anonimizado. | Nuevo. Analítica de marketing; solapa con HU21/HU22. |

### 5.2 Nuevos requisitos no funcionales / atributos de calidad

| Origen | Nuevo NFR | Descripción |
|:-------|:----------|:------------|
| HU22 E4 | Explicabilidad (IA) | Generar explicación/análisis preliminar de las métricas. |
| HU9 E5 | Rendimiento de simulación ≤30 s | Meta distinta del <60 s del scoring. |
| HU7 E3 / HU32 | Derecho al olvido (borrado irrecuperable) | Eliminación total e irrecuperable de cuenta/datos. |
| **HU32 E3 / HU33 E3** | **Anonimización para análisis** | Copiar métricas no personales a un registro anónimo antes de borrar; omitir identificadores en informes exportados. Permite BI sin vulnerar privacidad. |
| HU19 E4 | Transparencia de riesgo | Alerta cuando la carga financiera simulada supera el 25%. |
| HU5 | Seguridad verificable | Validación de entradas, no fuga de trazas/SQL/tokens, queries parametrizadas. |
| HU móvil (E5/E7) | Compatibilidad móvil verificable | Validar UI en resoluciones representativas (360x800, 390x844, 430x932) y paridad de permisos por rol. |

---

## 6. Recomendaciones

**Cerrar los huecos de cobertura 1 (sin HU) en features comprometidos:**
1. Crear historia(s) de **notificaciones multicanal** (FR13) — prerequisito de re-engagement y de la notificación de lead Alto. Hoy solo insinuado por HU24 E2.
2. Crear historia de **agendamiento** lead ↔ ejecutivo (FR15).

**Completar las coberturas parciales (2):**
3. **App móvil (FR21):** decidir si el alcance es responsive (cubierto por las HU móviles) o el track **nativo RN+Expo** del blueprint; si es nativo, falta representarlo.
4. **CMF/Dicom (FR22):** aclarar que HU25 es **simulada**; la integración real sigue pendiente.
5. **Engagement scoring** (FR12): historia que *compute* el score desde los eventos de HU22.
6. **Re-engagement al usuario** (FR11): nudge automático (depende de FR13).
7. **OCR** (FR17): extender HU18 con extracción de contenido.
8. **Inmutabilidad vs recálculo** (FR18): definir cómo conviven el registro inmutable (HdU 3 E5) con los múltiples recálculos/ajustes de scoring (HU8 E11, HU14, HU25 E4, HU26 E2) — probablemente versionando cada recálculo como nueva evaluación.
9. **Rendimiento del scoring** (NFR4): fijar el <60 s en HU6.

**Resolver la deriva de prioridades (§4):**
10. Decidir el destino del **mapa** (HU10): diferenciador (subir prioridad) o bajar de alcance conscientemente.
11. **Estimar el bloque nuevo** (HU24–HU33 + móviles) y completar categoría/SP donde dice "CALCULAR"/"RECALCULAR"; re-estimar HU19 y HU8.
12. Proteger y priorizar **HU29** (mide el KPI de negocio); hoy está sin estimar.

**Consolidar solapamientos (las HU nuevas crean redundancia):**
13. **Familia de simuladores** — HU9, HU19, HU24, HU25, HU26, HU27 comparten motor (capacidad, dividendo, plazos, escenarios). Consolidar en un módulo de simulación común en vez de seis features sueltos (el propio equipo lo intuye en la nota de HU26).
14. **Familia de analítica** — HU21, HU22, HU29, HU33 comparten logs/reportes/export. Definir un módulo de analítica/BI único con vistas y exports, no cuatro tableros separados.
15. **Privacidad/olvido** — fusionar HU32 con HU7 (la eliminación ya está en HU7 E3); conservar solo lo nuevo: la **anonimización** (HU32 E3 / HU33 E3) como NFR transversal.

**Hacer medibles los NFR sin historia (1):**
16. Asociar Disponibilidad (NFR6) y Escalabilidad (NFR7) a un mecanismo verificable con dueño (monitoreo de uptime, prueba de carga); completar la meta de Usabilidad (NFR5) más allá de las pruebas de resolución móvil.

**Incorporar al blueprint los requisitos nuevos (§5):** todos los FR/NFR nuevos listados, en especial los que cambian el alcance (estimación de postulación HU24, CMF simulada HU25, subsidios HU26, dashboard de conversión HU29, anonimización).

---

## 7. Tabla índice HU → requisito

| HU | Título | Requisito(s) que toca |
|:---|:-------|:----------------------|
| HU1–3 | Formulario / Priorización / Scoring híbrido + IA (HdU 1–3) | FR1, FR2, FR3, FR4 |
| HU4 | Derivación e integración comercial (CRM) | FR16 |
| HU5 | Seguridad básica | NFR1 |
| HU6 | Evaluación, score y capacidad de compra | FR2, FR8 (falta NFR4) |
| HU7 | Panel de privacidad y datos personales | FR20, NFR2; **nuevo:** recuperación de contraseña |
| HU8 | Plan de mejora + seguimiento mensual | FR5, FR10 |
| HU9 | Simulación de compatibilidad / alternativas | FR8, FR9; NFR4 (30 s) |
| HU10 | Mapa de accesibilidad por barrios | FR7 (**Opcional — deriva**) |
| HU11 | Academia financiera contextual | FR6 |
| HU12 | Matching lead-proyecto | FR4, FR14 |
| HU13 | Gestión de roles y permisos | FR19 |
| HU14 | Configuración de parámetros de scoring | **Nuevo FR** |
| HU15 | Auditoría de evaluaciones | FR18 (parcial), NFR3 |
| HU16 | Catálogo de proyectos | FR4 |
| HU17 | Evolución financiera del lead | FR4, FR11/FR12 (parcial); **nuevo:** comparador (E4) |
| HU18 | Carga de documentos | FR17 (parcial — sin OCR) |
| HU19 | Simulación UF y tasas | FR9 (**Opcional 1 SP — deriva**); **nuevo NFR:** transparencia de riesgo |
| HU20 | Dossier para evaluación bancaria | **Nuevo FR** |
| HU21 | Reporte comercial y métricas | FR14; **nuevo FR:** reportes descargables |
| HU22 | Métricas sobre logs de eventos | FR12 (parcial), FR20; **nuevos:** analítica de logs, explicabilidad |
| HU23 | Reportar leads fraudulentos | **Nuevo FR** |
| HU24 | Estimar resultados postulación crédito | **Nuevo FR**; FR13 insinuado (E2 notificación) |
| HU25 | Consulta simulada a la CMF | FR22 (parcial — simulada); **nuevo FR** + ajuste de scoring |
| HU26 | Simulación de subsidios (DS19) | **Nuevo FR** (subsidio como simulador) |
| HU27 | Simulación de variación de plazos | FR9; **nuevo/solapado** (simuladores) |
| HU29 | Dashboard de conversión de ventas | FR14; **nuevo FR estratégico** (mide objetivo de negocio) |
| HU32 | Derecho al olvido + anonimización | NFR2 (solapa HU7); **nuevo NFR:** anonimización |
| HU33 | Visualización demográfica/socioeconómica | **Nuevo FR** (analítica marketing); NFR anonimización |
| HU móvil (lead) | Experiencia móvil del lead | FR21 (parcial), NFR5 (parcial) |
| HU móvil (dashboard) | Dashboard ejecutivo móvil | FR21 (parcial), FR14, NFR1 |

> Sin cobertura en ninguna HU: **FR13 (notificaciones — solo insinuado), FR15 (agendamiento), NFR6 (disponibilidad), NFR7 (escalabilidad), NFR8 (mantenibilidad).**
> Cobertura parcial relevante: **FR17 (OCR), FR18 (inmutabilidad), FR21 (móvil = responsive, no nativo), FR22 (CMF simulada, no real), FR11/FR12 (re-engagement/compromiso).**
> Numeración ausente en el archivo del equipo: HU28, HU30, HU31 (no existen).
