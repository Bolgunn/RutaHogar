# RutaHogar — Contexto general del proyecto

## Nombre del producto

El producto se llama **RutaHogar**. El nombre anterior solo debe mantenerse como referencia historica cuando sea necesario explicar la transicion del proyecto.

RutaHogar es la marca visible para leads, usuarios, ejecutivos comerciales, administradores y documentacion activa.

## Proposito

RutaHogar es una plataforma de orientacion financiera e inmobiliaria que ayuda a una persona interesada en comprar vivienda a:

- completar una preevaluacion financiera orientativa;
- comprender su resultado mediante explicaciones claras;
- identificar brechas de ahorro, deuda, ingreso, pie o plazo;
- recibir recomendaciones y un plan de mejora;
- simular alternativas de vivienda compatibles;
- detectar beneficios habitacionales potencialmente aplicables;
- conectarse con proyectos inmobiliarios y ejecutivos comerciales cuando corresponda.

La plataforma tambien apoya a la inmobiliaria y sus ejecutivos en la priorizacion de leads, el matching lead-proyecto y la identificacion de oportunidades comerciales.

## Alcance conceptual

RutaHogar **no aprueba creditos hipotecarios**, no reemplaza una evaluacion bancaria formal y no garantiza aprobacion de subsidios, FOGAES u otros beneficios. Sus resultados son referenciales y dependen de la informacion declarada por el usuario.

## Actores principales

| Actor | Descripcion |
| --- | --- |
| Lead / usuario | Persona interesada en comprar vivienda y mejorar su preparacion financiera. |
| Ejecutivo comercial | Usuario interno que revisa leads, proyectos compatibles y oportunidades de contacto. |
| Administrador inmobiliario | Responsable de administrar proyectos, ejecutivos, parametros permitidos y vistas comerciales. |
| Administrador desarrollador | Rol tecnico para configuracion, soporte y control de datos sensibles cuando corresponda. |

## Metodologia

Scrum es la metodologia principal del proyecto:

- backlog organizado por historias de usuario;
- sprints con puntos de historia;
- criterios de aceptacion por HU;
- revision de avances por sprint.

RutaHogar tambien adopta una version acotada de Spec-Driven Development (SDD) para decisiones criticas antes de implementar reglas financieras, scoring, simulaciones, matching, beneficios habitacionales, privacidad, documentos e integraciones.

La metodologia se documenta en `docs/SCRUM_SDD_ACOTADO_RUTAHOGAR.md`.

## Fuente vigente de backlog

Las HUs vigentes corresponden al PDF actualizado `HUs para Sprint 1 (2).pdf` y se resumen en `docs/BACKLOG_HUS_RUTAHOGAR.md`.

## Reglas de renombre

Cambiar referencias del nombre anterior a **RutaHogar** en:

- README y documentacion;
- textos visibles en la interfaz;
- titulos, descripciones y explicaciones;
- wiki o archivos de contexto;
- prompts internos orientados a agentes;
- informes o archivos de planificacion.

No renombrar identificadores tecnicos, claves de almacenamiento, tablas, endpoints, imports, variables de entorno o nombres de paquetes si eso puede romper funcionalidad, migraciones o configuraciones existentes.

Si aparece `scoreleads` como identificador tecnico, debe quedar registrado como pendiente de refactor futuro en vez de cambiarse durante tareas solo documentales.

