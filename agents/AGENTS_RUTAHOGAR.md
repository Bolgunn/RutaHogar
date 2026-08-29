# AGENTS — RutaHogar

Instrucciones para Codex, Claude Code u otros agentes de IA que trabajen en este repositorio.

## Identidad del proyecto

El producto se llama **RutaHogar**.

No usar **ScoreLeads** como nombre activo del producto. Si aparece en documentación, textos visibles, README o wiki, debe reemplazarse por RutaHogar.

## Alcance del agente

Antes de modificar archivos:

1. Leer la documentación relevante.
2. Identificar si la tarea es documentación, funcionalidad, refactor, fix o prueba.
3. Confirmar si toca scoring, privacidad, datos sensibles, base de datos o contrato `POST /score`.
4. Evitar cambios fuera del alcance solicitado.

## Reglas de nombre

Cambiar `ScoreLeads` o `Score Leads` a `RutaHogar` en:

- documentación;
- textos visibles;
- títulos;
- explicaciones de UI;
- prompts;
- README;
- archivos de contexto del proyecto.

No renombrar automáticamente:

- tablas;
- columnas;
- endpoints;
- variables de entorno;
- claves de almacenamiento;
- nombres de paquetes;
- imports;
- identificadores técnicos.

Si un identificador técnico contiene `scoreleads`, reportarlo como pendiente en vez de cambiarlo si puede romper funcionalidad.

## Backlog vigente

La fuente actual de HUs es:

`docs/BACKLOG_HUS_RUTAHOGAR.md`

No usar versiones anteriores del backlog si contradicen ese documento.

Notas importantes:

- Sprint 1 suma 60 SP.
- Sprint 2 muestra 62 SP visibles y deja HU20 pendiente de definir con 8 SP.
- Sprint 3 muestra 46 SP visibles y deja HU30 pendiente de definir con 4 SP.
- HU14 y HU21 parecen duplicadas; no fusionar ni eliminar sin confirmación.
- Seguridad, privacidad, roles, auditoría, historial, responsive, disponibilidad y validación se tratan como requisitos no funcionales.

## Metodología

El proyecto usa Scrum con una versión acotada de SDD.

Leer:

`docs/SCRUM_SDD_ACOTADO_RUTAHOGAR.md`

Aplicar SDD acotado solo para HUs críticas o reglas de negocio. No crear documentación pesada para cambios simples.

## Scoring

No cambiar reglas de scoring, pesos, umbrales, bloqueadores, clasificación o compatibilidad sin actualizar documentación de reglas.

Si una tarea requiere tocar scoring:

1. Revisar `docs/REGLAS_SCORING.md` si existe.
2. Si no existe, solicitar confirmación antes de inventar reglas.
3. Mantener resultados como orientativos.
4. No permitir que IA generativa modifique el score.

## Privacidad y seguridad

No agregar almacenamiento de documentos, consultas externas, CRM, CMF, Dicom, bancos o APIs financieras si la HU no lo solicita explícitamente.

No exponer:

- trazas técnicas;
- tokens;
- credenciales;
- datos sensibles innecesarios;
- información comercial interna al lead.

## Trabajo con ramas

Estructura recomendada:

- `main`: versión estable / entregas.
- `develop`: integración.
- `feature/HUxx-nombre`: desarrollo de una HU.
- `docs/...`: documentación.
- `fix/...`: correcciones.

No trabajar directamente sobre `main` salvo instrucción explícita.

## Verificación mínima

Antes de terminar una tarea, reportar:

- archivos modificados;
- si se tocó o no funcionalidad;
- si quedan referencias a ScoreLeads;
- si hubo cambios en scoring;
- comandos ejecutados;
- pruebas o verificaciones realizadas.

Para tareas solo de documentación, ejecutar al menos:

```bash
git diff --stat
grep -RIn "ScoreLeads\|Score Leads\|scoreleads" . || true
```

Explicar cualquier referencia antigua que quede.
