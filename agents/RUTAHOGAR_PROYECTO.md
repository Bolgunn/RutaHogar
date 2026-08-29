# RutaHogar — Contexto general del proyecto

## Nombre del producto

El proyecto deja de presentarse como **ScoreLeads** y pasa a llamarse **RutaHogar**.

**RutaHogar** es la marca visible para usuarios, leads, ejecutivos y documentación del proyecto. El nombre anterior puede aparecer solo como referencia histórica si es necesario explicar una transición, pero no debe mantenerse como nombre activo del producto.

## Propósito

RutaHogar es una plataforma de orientación financiera e inmobiliaria que ayuda a un lead interesado en comprar vivienda a:

- completar una preevaluación financiera orientativa;
- entender su situación actual mediante un resultado explicable;
- identificar brechas de ahorro, deuda, ingreso, pie o plazo;
- recibir recomendaciones y un plan de mejora;
- simular alternativas de vivienda compatibles;
- conectarse con proyectos inmobiliarios y ejecutivos comerciales cuando corresponda.

La plataforma también ayuda a la inmobiliaria y a sus ejecutivos a priorizar leads, identificar oportunidades comerciales y orientar usuarios hacia proyectos más viables.

## Alcance conceptual

RutaHogar **no aprueba créditos hipotecarios**, no reemplaza una evaluación bancaria formal y no garantiza aprobación de subsidios, FOGAES u otros beneficios. Sus resultados son referenciales y se basan en la información declarada por el usuario.

## Actores principales

| Actor | Descripción |
| --- | --- |
| Lead / usuario | Persona interesada en comprar vivienda y mejorar su preparación financiera. |
| Ejecutivo comercial | Usuario interno que revisa leads, proyectos compatibles y oportunidades de contacto. |
| Administrador inmobiliario | Responsable de administrar proyectos, ejecutivos, parámetros permitidos y vistas comerciales. |
| Administrador desarrollador | Rol técnico para configuración, soporte y control de datos sensibles cuando corresponda. |

## Metodología de trabajo

El proyecto mantiene **Scrum** como metodología principal:

- backlog organizado por historias de usuario;
- sprints con puntos de historia;
- criterios de aceptación por HU;
- revisión de avances por sprint.

Además, se adopta una versión **acotada** de Spec-Driven Development (SDD) para reducir ambigüedades antes de programar, especialmente en reglas financieras, scoring, simulaciones, matching, beneficios habitacionales, privacidad e integraciones.

La adaptación se documenta en `SCRUM_SDD_ACOTADO_RUTAHOGAR.md`.

## Reglas para renombrar ScoreLeads a RutaHogar

Cambiar referencias de **ScoreLeads** y **Score Leads** a **RutaHogar** en:

- README y documentación;
- textos visibles en la interfaz;
- títulos, descripciones y explicaciones;
- wiki o archivos de contexto;
- prompts internos orientados a agentes;
- informes o archivos de planificación.

Evitar cambios funcionales innecesarios en esta tarea. No renombrar identificadores técnicos, claves de almacenamiento, tablas, endpoints, variables de entorno o nombres de paquetes si eso puede romper funcionalidad, migraciones o configuraciones existentes. Si aparece `scoreleads` como identificador técnico, dejarlo registrado como pendiente de refactor futuro.

## Fuente actual de backlog

La planificación vigente de HUs corresponde al PDF actualizado:

`HUs para Sprint 1.pdf`

Este archivo reemplaza versiones anteriores del backlog usadas en documentación previa.
