# Spike 2 - Validación técnica de privacidad, roles, trazabilidad, datos e integraciones externas

> **🗓 Planificado - Sprint 2.** Spike de investigación, no de construcción: su entregable es un
> conjunto de decisiones técnicas documentadas que habilitan las historias del Sprint 2, no código
> en producción.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Tipo** | Spike / Investigación |
| **Puntos de Historia** | 13 |
| **Actor** | Equipo |
| **Sprint** | Sprint 2 |
| **Estado** | 🗓 Planificado |

---

## Justificación

Este spike busca reducir la incertidumbre técnica asociada a las funcionalidades planificadas para
el Sprint 2, especialmente aquellas relacionadas con privacidad y permisos por rol, trazabilidad e
historial de evaluaciones, integración con CRM y servicios externos, obtención de datos financieros
e inmobiliarios desde fuentes confiables y mejora de los principales flujos de interacción de
usuarios y ejecutivos. El objetivo es definir previamente las decisiones técnicas, fuentes de
información, restricciones y flujos necesarios para implementar estas funcionalidades de forma
segura, consistente e integrada durante el Sprint 2.

---

## Criterios de aceptación

### E1 - Definición de permisos por rol, validación de privacidad y consentimiento

**Dado** que el sistema gestiona datos financieros y personales de los leads y contempla usuarios
con distintos niveles de acceso (lead, ejecutivo comercial, administrador inmobiliario y
administrador desarrollador), **cuando** el equipo revise y analice las funcionalidades y flujos de
privacidad del Sprint 2, **entonces** debe definir la matriz de permisos y acciones permitidas para
cada rol, así como la política de privacidad que especifique qué datos requieren consentimiento
explícito, qué información puede ser descargada, rectificada o eliminada, y el mecanismo de registro
y trazabilidad de dichas solicitudes dentro del sistema.

> **Habilita:** [[../RNF/RNF2-privacidad-minima|RNF 2]], [[../RNF/RNF3-roles-y-permisos|RNF 3]],
> [[HU18-participacion-consentimiento-codeudor|HU 18]].

### E2 - Validación técnica de auditoría e historial versionado

**Dado** que el sistema debe mantener trazabilidad sobre evaluaciones, cambios de score y acciones
relevantes, **cuando** el equipo analice los distintos campos y representaciones de los datos de los
que se desea mantener una trazabilidad, **entonces** debe definir cómo se registran los eventos,
actores responsables, fechas, versiones de evaluación, motivo del cambio y relación entre
evaluaciones anteriores y nuevas.

> **Habilita:** [[../RNF/RNF4-auditoria-tecnica|RNF 4]], [[../RNF/RNF5-historial-inmutable|RNF 5]],
> [[HU14-analisis-evolucion-comercial-lead|HU 14]], [[HU23-parametros-scoring|HU 23]].

### E3 - Validación de integración comercial y servicios externos

**Dado** que el sistema contempla integración con CRM y consulta a fuentes externas como CMF,
**cuando** el equipo revise dichas integraciones, **entonces** debe identificar requisitos técnicos,
credenciales necesarias, formato de solicitud y respuesta, manejo de errores, límites de uso y
comportamiento esperado si el servicio externo falla.

> **Habilita:** [[HU12-derivacion-comercial|HU 12]], [[HU27-revision-antecedentes|HU 27]].

### E4 - Investigación de fuentes de datos externas

**Dado** que existen datos financieros e inmobiliarios actualmente estáticos o hardcodeados,
**cuando** el equipo investigue fuentes externas disponibles, **entonces** debe identificar APIs o
fuentes confiables para obtener información como UF, tasas e indicadores financieros o
inmobiliarios, definiendo disponibilidad, frecuencia de actualización, formato de datos, límites de
uso y comportamiento esperado ante fallos.

> **Habilita:** [[HU17-simulacion-financiamiento|HU 17]], [[HU9-cotizacion-orientativa|HU 9]],
> [[HU29-comparador-costo-credito|HU 29]], [[HU20-retorno-por-cambio|HU 20]].

### E5 - Investigación de flujos y experiencia de usuario

**Dado** que la plataforma requiere una interacción fluida y eficiente tanto para los leads como
para los ejecutivos, **cuando** el equipo analice e investigue los principales flujos de interacción
de usuarios y ejecutivos dentro del sistema, **entonces** debe identificar pasos innecesarios,
información duplicada, puntos de fricción y oportunidades de integrar mejor las distintas
funcionalidades para simplificar y optimizar la experiencia de uso.

> **Habilita:** [[HU1-ingreso-datos-financieros|HU 1]], [[HU2-priorizacion-leads|HU 2]],
> [[../RNF/RNF6-experiencia-movil-lead|RNF 6]], [[../RNF/RNF7-dashboard-movil-ejecutivo|RNF 7]].

### E6 - Investigación del ecosistema de corredores inmobiliarios

**Dado** que los corredores de propiedades participan en la captación, orientación y derivación de
potenciales compradores, **cuando** el equipo investigue cómo funciona este actor dentro del mercado
inmobiliario, **entonces** debe documentar sus principales procesos de trabajo, modelo de negocio,
relación con inmobiliarias y compradores, herramientas utilizadas, manejo y calificación de leads,
información que requieren para gestionar clientes y posibles oportunidades de integración con la
plataforma.

> **Habilita:** decisión sobre un actor no modelado hoy en [[../Actores|Actores]], y su efecto sobre
> [[HU7-catalogo-de-proyectos|HU 7]] y [[HU12-derivacion-comercial|HU 12]].

---

## Notas

- **Esta versión reemplaza la del documento E4.** El plan de proyecto
  ([[../informes_entregas/E4 - GPI Plan de Proyecto 2026|E4]]) describía un Spike 2 de **20 SP con
  siete criterios**, que incluía carga y resguardo de documentos (hoy
  [[HU24-carga-documentos|HU 24]]), reportes y exportación de dossier (hoy
  [[HU25-exportacion-dossier|HU 25]]) y un criterio final de consolidación documental. El documento
  del equipo lo reformuló en **13 SP con seis criterios**, incorporando dos frentes nuevos —
  fuentes de datos externas (E4) y ecosistema de corredores (E6) — y fusionando privacidad y
  permisos en un solo criterio. **La versión vigente es la de esta página.**
- **El entregable de un spike es un documento, no una pantalla.** Spike 1 cerró con
  [E4 — Criterios de matching lead-proyecto](../../docs/research/spike1-e4-lead-project-matching-criteria.md);
  Spike 2 debe cerrar con un documento equivalente por frente en `docs/research/`, o el spike no se
  puede dar por cumplido.
- **E4 toca constantes que hoy están en el código.** El supuesto de variación de UF vive en
  `frontend/src/services/financialTracking.js:9` y los precios referenciales en
  `PRECIOS_REFERENCIA_UF` (`backend/app/scoring.py`). La investigación debe decir qué pasa a
  alimentarse de una fuente externa y qué se mantiene como constante versionada — no cambiar esos
  valores durante el spike.
- **E3 no autoriza consultar fuentes externas.** CMF, Dicom y bancos siguen fuera del alcance de
  implementación: este criterio produce análisis de factibilidad, no integración.
- **E6 puede abrir un actor nuevo.** Si la investigación concluye que el corredor debe operar dentro
  de la plataforma, eso es una historia nueva y una fila nueva en [[../Actores|Actores]], no un
  ajuste a las historias existentes.

---

## Relación con el backlog

| Frente | Historias que desbloquea |
| :----- | :----------------------- |
| E1 — Privacidad, roles y consentimiento | [[HU18-participacion-consentimiento-codeudor\|HU 18]], [[HU16-gestion-leads-inconsistentes\|HU 16]], RNF 2 · RNF 3 |
| E2 — Auditoría e historial | [[HU14-analisis-evolucion-comercial-lead\|HU 14]], [[HU23-parametros-scoring\|HU 23]], RNF 4 · RNF 5 |
| E3 — CRM y servicios externos | [[HU12-derivacion-comercial\|HU 12]], [[HU27-revision-antecedentes\|HU 27]] |
| E4 — Fuentes de datos externas | [[HU17-simulacion-financiamiento\|HU 17]], [[HU9-cotizacion-orientativa\|HU 9]], [[HU29-comparador-costo-credito\|HU 29]], [[HU20-retorno-por-cambio\|HU 20]] |
| E5 — Flujos y experiencia | [[HU1-ingreso-datos-financieros\|HU 1]], [[HU2-priorizacion-leads\|HU 2]], [[HU19-portal-inmobiliario-rag\|HU 19]] |
| E6 — Corredores inmobiliarios | Sin historia asociada hoy — el spike decide si la habrá |

---

## Estado

Spike no iniciado. Ningún frente tiene documento de cierre en `docs/research/`.

| Criterio | Estado | Evidencia |
| :------- | :----- | :-------- |
| `E1` | ❌ | No existe matriz de permisos documentada ni política de privacidad escrita. |
| `E2` | ❌ | Sin definición de modelo de eventos ni de versionado de evaluaciones. |
| `E3` | ⚠️ | `docs/crm-integration.md` es punto de partida; faltan credenciales, límites y comportamiento ante fallo. |
| `E4` | ✅ | Investigación completada en [spike2-e4-external-data-sources.md](../../docs/research/spike2-e4-external-data-sources.md). |
| `E5` | ❌ | Sin levantamiento de flujos ni inventario de fricciones. |
| `E6` | ✅ | Investigación completada en [spike2-e6-real-estate-brokers.md](../../docs/research/spike2-e6-real-estate-brokers.md). |
