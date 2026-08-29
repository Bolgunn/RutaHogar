# RutaHogar — Instrucciones para agentes

RutaHogar es una plataforma de orientacion financiera e inmobiliaria. El nombre visible del producto es **RutaHogar**.

## Prioridad de documentacion

- Contexto general: `docs/RUTAHOGAR_PROYECTO.md`.
- Backlog vigente: `docs/BACKLOG_HUS_RUTAHOGAR.md`.
- Metodologia: `docs/SCRUM_SDD_ACOTADO_RUTAHOGAR.md`.
- Reglas financieras, cuando existan: `docs/REGLAS_SCORING.md`.

## Guardrails

- No implementar HUs sin instruccion explicita.
- No modificar scoring, endpoints, migraciones, autenticacion, permisos ni base de datos en tareas documentales.
- No renombrar identificadores tecnicos `scoreleads_*`, paquetes, imports, tablas, claves de almacenamiento o variables de entorno si eso puede romper funcionalidad.
- Cambiar el nombre anterior por RutaHogar en documentacion y textos visibles cuando sea seguro.
- Reportar cualquier referencia heredada que quede por razones tecnicas o historicas.

## Metodologia

Scrum es la metodologia principal. Usar SDD acotado solo para reglas criticas, scoring, simulaciones, matching, beneficios, privacidad, documentos e integraciones.

No aplicar SDD pesado a cambios visuales, copy, renombre o documentacion simple.

## Alcance funcional

RutaHogar no aprueba creditos hipotecarios, no reemplaza evaluacion bancaria formal y no garantiza beneficios habitacionales. Los resultados son referenciales.

