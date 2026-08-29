# Scrum + SDD acotado — RutaHogar

## Decision metodologica

RutaHogar usara **Scrum** como metodologia principal del proyecto universitario. La planificacion, estimacion y seguimiento se haran mediante historias de usuario, sprints, criterios de aceptacion y puntos de historia.

Ademas, se adopta una version **acotada** de Spec-Driven Development (SDD) para ordenar decisiones criticas antes de programar, sin convertir el proyecto en una carga documental excesiva.

## Uso de SDD acotado

Aplicar SDD acotado solo cuando la HU o cambio toque:

- reglas criticas de negocio;
- scoring financiero;
- reglas de clasificacion;
- simulaciones hipotecarias o de compatibilidad;
- matching lead-proyecto;
- beneficios habitacionales;
- privacidad, consentimiento o datos sensibles;
- carga, visualizacion o exportacion de documentos;
- integraciones externas como CRM, CMF u otros servicios;
- cambios al contrato `POST /score`.

## Cuando no usar SDD pesado

No aplicar SDD pesado a:

- cambios visuales;
- copy o microcopy;
- renombre de marca;
- documentacion simple;
- ajustes menores de layout;
- componentes sin reglas de negocio;
- cambios que no alteran comportamiento funcional.

## Artefactos minimos

Para HUs criticas, usar una ficha breve antes de implementar:

| Pregunta | Respuesta |
| --- | --- |
| Que problema resuelve | |
| Actor beneficiado | |
| Reglas afectadas | |
| Datos sensibles involucrados | |
| Cambios de contrato o integracion | |
| Fuera de alcance | |
| Pruebas o verificacion | |

Si se trabaja scoring, usar `docs/REGLAS_SCORING.md` como documento central de reglas financieras.

No crear multiples documentos ALG por ahora. El equipo podra decidir mas adelante si una HU requiere documentacion ALG separada.

## Reglas del proyecto

1. Scrum manda la planificacion.
2. SDD acotado prepara HUs criticas, no reemplaza el backlog.
3. No se inventan umbrales financieros durante la implementacion.
4. Si un numero cambia, debe quedar explicado en documentacion.
5. La IA no decide el score; solo puede explicar resultados ya calculados.
6. RutaHogar no aprueba creditos ni garantiza beneficios.
7. Los resultados financieros deben mostrarse como referenciales.
8. No se debe solicitar ni almacenar documentacion sensible si la HU no lo exige.
9. El lead no debe ver detalles internos comerciales.
10. El ejecutivo puede ver informacion comercial solo en la medida necesaria para su rol.

## Definition of Done recomendada

Una HU se considera lista cuando:

- cumple sus criterios de aceptacion;
- no agrega alcance fuera de lo definido;
- actualiza reglas o documentacion si corresponde;
- mantiene disclaimers cuando hay resultados financieros referenciales;
- separa correctamente la vista del lead y del ejecutivo;
- respeta privacidad, roles y manejo seguro de errores;
- fue revisada por otra persona del equipo.

