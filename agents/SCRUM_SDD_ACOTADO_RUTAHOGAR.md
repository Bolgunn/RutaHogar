# Scrum + SDD acotado — RutaHogar

## Decisión metodológica

RutaHogar usará **Scrum** como metodología principal del proyecto universitario. La planificación, estimación y seguimiento se harán mediante historias de usuario, sprints, criterios de aceptación y puntos de historia.

Además, se adopta una versión **acotada** de Spec-Driven Development (SDD) para ordenar decisiones críticas antes de programar, sin convertir el proyecto en una carga documental excesiva.

## Por qué no usar SDD completo

El handbook original propone una metodología completa con fases como Grill, Algorithms, Plan, Kickoff, Build y Review, además de documentos ALG y fixtures por algoritmo. Esa estructura es útil para productos reales con mayor riesgo operacional, pero puede ser demasiado pesada para un proyecto universitario.

En RutaHogar se toma la idea central:

> Las reglas importantes se especifican antes de implementarse.

Pero se evita exigir documentos extensos para cada cambio pequeño.

## Cuándo aplicar SDD acotado

Aplicar SDD acotado cuando la HU toque:

- scoring financiero;
- reglas de clasificación;
- bloqueadores financieros;
- simulaciones hipotecarias;
- compatibilidad lead-proyecto;
- beneficios habitacionales;
- matching comercial;
- priorización de leads;
- privacidad, consentimiento o datos sensibles;
- integración CRM, CMF u otros servicios externos;
- carga, visualización o exportación de documentos;
- cambios al contrato `POST /score`.

## Cuándo NO aplicar SDD pesado

No usar SDD completo para:

- cambios de estilo visual;
- textos simples;
- cambios menores de layout;
- ajustes responsive pequeños;
- renombre de marca;
- documentación general;
- componentes sin reglas de negocio;
- cambios que no alteren comportamiento funcional.

## Artefactos mínimos

Para HUs críticas, usar como máximo estos artefactos:

### 1. Mini diseño / Grill

Antes de programar, responder brevemente:

| Pregunta | Respuesta |
| --- | --- |
| ¿Qué problema resuelve? | |
| ¿Qué actor se beneficia? | |
| ¿Toca scoring o reglas financieras? | |
| ¿Toca datos sensibles, privacidad o consentimiento? | |
| ¿Requiere migración de base de datos? | |
| ¿Cambia el contrato `POST /score`? | |
| ¿Tiene reglas con números, umbrales o fórmulas? | |
| ¿Qué queda fuera de alcance? | |

### 2. Reglas

Si hay reglas financieras, registrar o actualizar:

`docs/REGLAS_SCORING.md`

No crear varios documentos ALG por ahora. Para el alcance actual basta un documento central de reglas.

### 3. Plan corto por HU

Para HUs complejas, crear:

`docs/hus/HUxx-<nombre-corto>.md`

Formato sugerido:

```md
# HUxx — Nombre

## Objetivo

## Alcance

## Fuera de alcance

## Reglas o decisiones

## Criterios de aceptación

## Pruebas o verificación
```

### 4. Prompt de implementación

Cuando se trabaje con Codex o Claude, entregar un prompt claro con:

- HU a implementar;
- archivos relevantes;
- reglas que no puede cambiar;
- fuera de alcance;
- pruebas esperadas;
- forma de reportar cambios.

## Reglas del proyecto

1. Scrum manda la planificación.
2. SDD acotado ayuda a preparar HUs críticas.
3. No se inventan umbrales financieros durante la implementación.
4. Si un número cambia, debe quedar explicado en documentación.
5. La IA no decide el score; solo puede explicar resultados ya calculados.
6. RutaHogar no aprueba créditos ni garantiza beneficios.
7. Los resultados financieros deben mostrarse como referenciales.
8. No se debe guardar ni solicitar documentación sensible si la HU no lo exige.
9. El lead no debe ver detalles internos comerciales.
10. El ejecutivo puede ver información comercial, pero sin exponer más datos de los necesarios.

## Relación con Scrum

Cada HU mantiene:

- historia de usuario;
- criterios de aceptación;
- puntos de historia;
- sprint asignado.

SDD acotado se usa como apoyo previo para evitar ambigüedades antes de implementar HUs críticas.

## Definition of Done recomendada

Una HU se considera lista cuando:

- cumple sus criterios de aceptación;
- no agrega alcance fuera de lo definido;
- mantiene actualizado el documento correspondiente si cambió una regla;
- no rompe el flujo principal de preevaluación;
- separa correctamente la vista del lead y del ejecutivo;
- muestra disclaimers cuando hay resultados financieros referenciales;
- fue revisada por otra persona del equipo.
