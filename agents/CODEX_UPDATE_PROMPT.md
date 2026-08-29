# Prompt para Codex — Actualización general RutaHogar

Actúa como agente de documentación del proyecto **RutaHogar**.

Necesito actualizar el proyecto en general, sin implementar funcionalidad nueva.

## Contexto

- El proyecto ya no se llama **ScoreLeads**.
- El nuevo nombre del producto es **RutaHogar**.
- Las HUs vigentes son las del PDF actualizado `HUs para Sprint 1 (2).pdf`.
- Seguiremos usando **Scrum** como metodología principal.
- Además, queremos documentar una versión acotada de **Spec-Driven Development (SDD)** adaptada al proyecto universitario.
- Esta tarea es solo de documentación, nombre y archivos de apoyo. No debe cambiar lógica funcional.

## Archivos base que debes crear o actualizar

Crea o actualiza estos archivos, ubicándolos donde tenga más sentido dentro del repo:

- `docs/RUTAHOGAR_PROYECTO.md`
- `docs/BACKLOG_HUS_RUTAHOGAR.md`
- `docs/SCRUM_SDD_ACOTADO_RUTAHOGAR.md`
- `AGENTS.md`

Si ya existen archivos similares, actualízalos en vez de duplicarlos.

## Cambios de nombre

Reemplaza referencias textuales:

- `ScoreLeads` → `RutaHogar`
- `Score Leads` → `RutaHogar`

Para `scoreleads` en minúscula:

- reemplazar solo si está en documentación o texto visible;
- no cambiar identificadores técnicos, tablas, endpoints, imports, variables de entorno, claves de almacenamiento o nombres de paquetes si eso puede romper funcionalidad;
- si queda alguna referencia técnica, reportarla al final y explicar por qué no se cambió.

## Backlog vigente

Documenta las HUs del PDF actualizado con esta estructura:

### Sprint 1 — 60 SP

- Spike 1 — Investigación financiera, scoring, educación financiera y criterios de priorización comercial — 13 SP
- HU4 — Generación de plan de mejora personalizado — 8 SP
- HU5 — Academia financiera contextual — 8 SP
- HU6 — Simulación de compatibilidad y alternativas accesibles — 8 SP
- HU7 — Gestión del catálogo de proyectos inmobiliarios — 5 SP
- HU8 — Detector de beneficios habitacionales aplicables — 5 SP
- HU9 — Cotización orientativa por proyecto — 5 SP
- HU10 — Matching lead-proyecto para ejecutivos comerciales — 5 SP
- HU11 — Checklist de preparación bancaria — 3 SP

### Sprint 2 — 62 SP visibles

- Spike 2 — Validación técnica de privacidad, roles, trazabilidad, documentos e integraciones externas — 13 SP
- HU12 — Sistema de Derivación e Integración Comercial — 8 SP
- HU13 — Seguimiento mensual del plan de mejora — 8 SP
- HU14 — Visualización de mapa de accesibilidad inmobiliaria — 8 SP
- HU15 — Evolución financiera del lead — 5 SP
- HU16 — Dashboard de Tasas de Conversión de Ventas — 5 SP
- HU17 — Reportar leads inconsistentes o fraudulentos — 5 SP
- HU18 — Simulador de escenarios hipotecarios referenciales — 5 SP
- HU19 — Ranking de proyectos por brecha mínima — 5 SP
- HU20 — Pendiente de definir — 8 SP

### Sprint 3 — 46 SP visibles

- HU21 — Visualización de mapa de accesibilidad inmobiliaria — 8 SP
- HU22 — Actualización dinámica del mapa de accesibilidad — 5 SP
- HU23 — Configuración de parámetros de scoring — 5 SP
- HU24 — Carga de documentos respaldatorios — 5 SP
- HU25 — Exportación de dossier para evaluación bancaria — 3 SP
- HU26 — Simulación avanzada de subsidios habitacionales — 5 SP
- HU27 — Revisión referencial de antecedentes declarados — 5 SP
- HU28 — Estimador de gastos iniciales de compra — 5 SP
- HU29 — Comparador de costo total referencial del crédito — 5 SP
- HU30 — Pendiente de definir — 4 SP

## Notas obligatorias

Registra estas notas en la documentación:

- HU20 aparece como pendiente de definir con 8 SP.
- HU30 aparece como pendiente de definir con 4 SP.
- HU14 y HU21 parecen duplicadas o muy similares; no fusionarlas sin confirmación del equipo.
- Seguridad básica, privacidad mínima, roles y permisos, auditoría técnica, historial inmutable, experiencia móvil, disponibilidad, manejo seguro de errores y validación de entradas deben tratarse como requisitos no funcionales.

## Metodología

Documenta que RutaHogar usa:

- Scrum como metodología principal.
- SDD acotado solo para reglas críticas, scoring, simulaciones, matching, beneficios, privacidad, documentos e integraciones.
- No aplicar SDD pesado a cambios visuales, copy, renombre o documentación simple.
- Usar un documento central de reglas financieras como `docs/REGLAS_SCORING.md` si se trabaja scoring.
- No crear múltiples documentos ALG por ahora, salvo que el equipo lo decida más adelante.

## Fuera de alcance

No hacer nada de esto:

- No implementar HUs.
- No modificar scoring.
- No cambiar endpoints.
- No hacer migraciones.
- No refactorizar arquitectura.
- No crear integraciones externas.
- No cambiar autenticación ni permisos.
- No modificar lógica funcional.
- No crear componentes nuevos.
- No tocar base de datos.

## Verificación

Al terminar, ejecuta:

```bash
git diff --stat
grep -RIn "ScoreLeads\|Score Leads\|scoreleads" . || true
```

Luego reporta:

1. Archivos creados o modificados.
2. Referencias antiguas que quedaron y por qué.
3. Confirmación de que no se modificó funcionalidad.
4. Cualquier inconsistencia detectada en documentación antigua.
