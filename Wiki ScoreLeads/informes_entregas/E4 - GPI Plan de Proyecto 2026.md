# E4 – Plan de Proyecto 2026

> **Documento entregado — congelado.** Este informe usa la numeración vigente a su fecha de entrega y se conserva tal como fue presentado. No se actualiza con cambios posteriores del backlog.

## ScoreLeads – Campus San Joaquín

> **Descripción breve del proyecto:** Convertimos interesados en compradores potenciales mediante scoring financiero, IA explicable y recomendación inmobiliaria personalizada.

**Fecha:** 23 de junio de 2026

### Equipo y contacto

| Rol | Nombre | Celular | LinkedIn |
| :-- | :----- | :------ | :------- |
| Scrum Master | Isaías Carte | +56 9 9884 5848 | [Isaías Carte](http://www.linkedin.com/in/isaias-amaro-carte-b61a56331) |
| Product Owner | Benjamín Olguín Pozo | +56 9 5921 8689 | [Benjamín Olguín Pozo](http://www.linkedin.com/in/benjamín-javier-olguín-pozo) |
| Comunicación & Marketing | Rodrigo Ignacio Ramírez Díaz | +56 9 3699 4401 | [Rodrigo Ramírez](https://www.linkedin.com/in/rodrigo-ramirez-diaz-bb7b3636b/) |
| Encargado de Testing | Mauro Castillo Lackington | +56 9 5423 5979 | [Mauro Castillo](https://www.linkedin.com/in/mauro-castillo-lackington/) |
| Encargado de Tecnologías | Claudio Ariel Jiménez Astudillo | +56 9 5416 7800 | [Claudio Jiménez](http://www.linkedin.com/in/claudio-jiménez-66080132b) |
| Encargado de Diseño + UX | Andrés Jablonca | +56 9 8770 5505 | [Andrés Jablonca](https://www.linkedin.com/in/andres-jablonca-pena/) |
| Cliente / Usuario Representativo | Ellison de Moraes Caram | +56 9 6407 3698 | ecaram@ei.cl |

**Objetivo de desarrollo sostenible (ONU):** el proyecto se alinea con los ODS declarados por el equipo.
**Experiencia del usuario con el problema:** Alta.

**Integrantes:** Isaías Carte · Benjamín Olguín · Andrés Jablonca · Rodrigo Ramírez · Claudio Jiménez · Mauro Castillo.

---

## Contenido

1. [Resumen](#1-resumen)
2. [Descripción – Cliente y actores del sistema](#2-descripción--cliente-y-actores-del-sistema)
3. [Herramientas y tecnologías a usar](#3-herramientas-y-tecnologías-a-usar)
4. [Compromiso ético](#4-compromiso-ético)
5. [Riesgos técnicos importantes](#5-riesgos-técnicos-importantes)
6. [Distribución tentativa (Sprints 1–3)](#6-distribución-tentativa-sprints-13)
7. [Detalle de HUs y criterios de aceptación](#7-detalle-de-hus-y-criterios-de-aceptación)
8. [Anexo A – Compromiso ético](#anexo-a--compromiso-ético)
9. [Anexo B – Posibles trabajos de título derivados](#anexo-b--posibles-trabajos-de-título-derivados)

---

## 1. Resumen

Actualmente las inmobiliarias reciben un gran volumen de prospectos interesados en adquirir una vivienda, aproximadamente 2000 a 7000 leads, y de estos, solamente alrededor del 1% cumple con las condiciones necesarias para acceder a un crédito hipotecario, esto validado con Icafal y Echeverría Izquierdo. Como consecuencia, los equipos comerciales destinan una gran cantidad de tiempo a procesos de evaluación manual, seguimiento y gestión de leads que finalmente no avanzan en el proceso de compra. Esta situación genera ineficiencias operativas, pérdida de trazabilidad, aumento de costos comerciales y una disminución en la productividad de los ejecutivos de ventas. Además, muchos usuarios desconocen su verdadera capacidad de compra y las acciones necesarias para transformarse en sujetos de crédito.

El cliente directo son las empresas inmobiliarias del sector medio (Región Metropolitana) inicialmente, y los usuarios finales del sistema estarán divididos en dos grupos: por un lado, están los ejecutivos comerciales, quienes necesitan optimizar su tiempo contactando perfiles viables, y los leads (potenciales compradores), personas que buscan su primera vivienda y necesitan orientación financiera sin fricciones.

Frente a esta problemática nace ScoreLeads, una plataforma de precalificación y priorización inteligente de leads inmobiliarios, además de incluir un plan de mejora, para aquellos que no son aptos a crédito hipotecario, o aspiren a un proyecto inmobiliario de mayor valor.

- **Valor para la inmobiliaria:** optimiza la rentabilidad operativa entregando al ejecutivo comercial un panel (dashboard) con una cartera priorizada de leads precalificados mediante un motor de scoring y análisis hechos mediante IA, permitiéndoles concentrar sus esfuerzos solo en prospectos con alta viabilidad.

- **Valor para el lead:** ofrece un diagnóstico sobre el estado financiero en el que se encuentra, mediante un score cualitativo (alto si está listo para su crédito, medio si está cerca de su meta y bajo si está construyendo su perfil), junto con un análisis generado por inteligencia artificial sobre los puntos fuertes y débiles que tiene actualmente, sin la necesidad de subir documentos sensibles en primera instancia, y además, a los usuarios no aptos, se les genera un plan de mejora personalizado paso a paso para ayudarlos a ser sujetos de crédito hipotecario en el futuro.

A diferencia de los CRMs tradicionales o formularios genéricos que solo capturan datos para ser contactados constantemente por los gerentes/as de venta, ScoreLeads introduce un motor de scoring predictivo en tiempo real y una evaluación híbrida: por una parte, el score generado a partir de un algoritmo con la lógica actual de negocio de las inmobiliarias, y por otra parte, un análisis generado a partir de la inteligencia artificial para que los usuarios tengan resultados cualitativos y personalizados a partir del score generado y los datos ingresados, indicando los factores que influyen en su resultado y educándolo financieramente, además de automatizar el flujo de plan de mejora o "nutrición" del lead.

Este desafío califica como un Problema Complejo de Ingeniería porque involucra a diversos grupos de interesados con necesidades diametralmente opuestas: por un lado las inmobiliarias que buscan rentabilidad y cierre rápido, y por el otro los usuarios sin educación financiera que requieren guía y no quieren ser dejados atrás porque no cumplen los requisitos necesarios para efectuar la compra inmediatamente. Además, su solución no es evidente, ya que los factores económicos y legislativos del país van cambiando constantemente y requieren validación constante con diferentes inmobiliarias, sobre todo al buscar implementar un flujo directo desde la base de datos de ScoreLeads a los distintos CRM de las inmobiliarias asociadas.

---

## 2. Descripción – Cliente y actores del sistema

Para el correcto desarrollo de ScoreLeads, se han identificado claramente tanto al cliente estratégico como a los usuarios finales que interactúan con el software.

### Cliente estratégico

| | |
| :-- | :-- |
| **Nombre** | Ellison De Moraes Caram |
| **Perfil** | Gerente de Business Intelligence con más de 11 años de experiencia en el rubro inmobiliario, especializado en análisis comercial, gestión de datos y optimización de procesos de negocio. |
| **Contacto** | ecaram@ei.cl |

### Actores / usuarios del sistema

#### 1. Interesado en comprar vivienda (Lead)

- **Descripción:** persona interesada en adquirir su primera vivienda y desconoce si cumple los requisitos para ser sujeto de crédito hipotecario.
- **Funciones:** ingresar sus datos financieros/laborales en la plataforma. Visualizar su diagnóstico de "salud financiera" y seguir las recomendaciones del módulo de plan de mejora.
- **Manejo de tecnologías:** nivel intermedio (3).
- **Conocimiento del contexto:** nivel bajo (1).
- **Justificación:** al ser su primera vivienda, desconoce los requisitos bancarios —ingresos, PIE necesario, morosidad, historial laboral— y el lenguaje técnico utilizado dentro del sector inmobiliario y/o financiero. Sin embargo, al ser un usuario digital promedio, posee un manejo fluido de aplicaciones web y móviles a nivel de usuario general.

#### 2. Ejecutivo Comercial

- **Descripción:** profesional de ventas de la inmobiliaria encargado de cerrar los negocios.
- **Funciones:** visualizar el dashboard con la cartera de leads precalificados en estado verde/apto. Filtrar prospectos según su scoring y contactar a los clientes viables.
- **Manejo de tecnologías:** nivel medio-alto (4).
- **Conocimiento del contexto:** nivel alto (5).
- **Justificación:** su conocimiento del contexto es experto, ya que domina el flujo de venta inmobiliaria y los requisitos de crédito. Su manejo tecnológico es medio-alto, dado que en su día a día ya opera con herramientas digitales de gestión comercial como CRMs y ERPs.

#### 3. Administrador inmobiliario

- **Descripción:** representante de la inmobiliaria que contrató nuestro servicio.
- **Funciones:** asignación de roles ejecutivos dentro de la empresa.
- **Manejo de tecnologías:** nivel intermedio (3).
- **Conocimiento del contexto:** nivel alto (5).
- **Justificación:** su conocimiento del contexto es experto, ya que domina el flujo de venta inmobiliaria y los requisitos de crédito. Su manejo tecnológico es intermedio, dado que en su día a día opera principalmente con el software de la empresa en la que trabaja y con herramientas generales (correo electrónico, Excel, etc.), pero le cuesta manejarse con herramientas nuevas.

#### 4. Administrador desarrollador (admin dev)

- **Descripción:** representante del equipo de desarrollo del sistema.
- **Funciones:** manejo de trazabilidad, logs, seguridad y la modificación manual de score de usuarios.
- **Manejo de tecnologías:** nivel alto (5).
- **Conocimiento del contexto:** nivel intermedio (3).
- **Justificación:** su conocimiento del contexto es intermedio, ya que domina lo investigado por cuenta propia del tema y lo aprendido de las entrevistas con clientes. El manejo tecnológico es alto, ya que se encarga de desarrollar nuevas funcionalidades y darles mantenimiento en la aplicación, por lo que entiende la arquitectura del sistema en profundidad y tiene conocimiento sobre distintas herramientas tecnológicas que componen al sistema.

---

## 3. Herramientas y tecnologías a usar

Para el desarrollo del MVP de ScoreLeads se propone una arquitectura web simple, junto con una versión móvil, ya que los ejecutivos comerciales trabajan en su mayoría con celulares, según una reunión llevada a cabo con la inmobiliaria ICAFAL, separando el frontend, backend y la persistencia de datos.

- **Frontend:** React / Angular. Para realizar el formulario del usuario, visualización del score y recomendaciones.
- **Backend:** FastAPI + Python. Para recibir datos del formulario, calcular scoring, generar clasificación y recomendaciones.
- **Persistencia de datos:** Supabase / PostgreSQL. Para guardar usuario, respuestas, score, clasificación y fecha de evaluación.
- **Apoyo al desarrollo (IA):** Llama con modelo para las explicaciones de los resultados obtenidos por los usuarios en su preevaluación. Gemini, ChatGPT, Claude como apoyo en el desarrollo de código.

### Atributos de calidad del sistema (RNF)

| Atributo de calidad | Meta SMART | Mecanismo de verificación |
| :------------------ | :--------- | :------------------------ |
| Facilidad de uso | Al menos el 80% de los usuarios deben completar el formulario sin ayuda en menos de 10 min. | Prueba con usuarios que quieran acceder a su primera vivienda, midiendo tiempo promedio, completitud, cantidad de errores y abandonos. |
| Tiempo de respuesta | El tiempo de respuesta de las operaciones de la página debe ser en promedio menor o igual a 60 segundos. | Herramientas de debug o testing (asserts) que realicen distintas operaciones de la página e impriman por consola el tiempo, obtenido con un timer que se ejecuta al principio de la operación, indicando cuánto demoraron en promedio. |
| Seguridad | El sistema no debe solicitar credenciales bancarias ni documentos sensibles sin antes utilizar mecanismos de seguridad como HTTPS y control de acceso mediante doble verificación. | Revisión de formulario, checklist de seguridad y validación de configuración del despliegue. |
| Privacidad de datos | El sistema debe recolectar sólo los datos mínimos necesarios, como el ingreso, deuda, ahorro y tiempo de contrato. | Revisión del modelo de datos y verificación de que no se almacenen campos innecesarios. |
| Escalabilidad | El sistema debe ser capaz de soportar más de 2000 instancias de evaluaciones/consultas en simultáneo. | Prueba de carga simulada de registros en Supabase. |
| Uptime | El sistema debe estar disponible al menos el 95% del tiempo. | Monitoreo del servicio desplegado, registrando caídas (log/notificación de caídas). |
| Mantenibilidad | El código debe estar organizado en módulos separados como: frontend, backend y reglas de scoring. | Revisión periódica del repositorio y de la estructura del proyecto. |
| Trazabilidad | Cada evaluación debe guardar la fecha, el score obtenido y la calificación generada. | Vista o query directa en la base de datos para verificar la persistencia correcta de la información. |

---

## 4. Compromiso ético

De acuerdo con las directrices del [Anexo A](#anexo-a--compromiso-ético) del plan de proyecto, el equipo de ScoreLeads asume los siguientes compromisos éticos en el desarrollo del software:

1. **Consideraciones éticas y privacidad de datos:** al tratarse de una plataforma que maneja datos financieros, el equipo se compromete a asegurar la privacidad de la información de los usuarios (terceros). Se adoptarán medidas de anonimización de datos y se recolectará estrictamente la información mínima necesaria (ingresos, deudas, ahorros, RUT), sin utilizarla para fines distintos a los autorizados para su recopilación. El sistema no solicitará credenciales bancarias y operará bajo un modelo de consentimiento explícito e informado.

2. **Integridad técnica y uso de inteligencia artificial:** el equipo declara que el proyecto se desarrollará evitando la invención, manipulación o falsificación de datos de prueba. Además, se declara de manera explícita el uso de herramientas de Inteligencia Artificial Generativa (como Claude Code, opencode, OpenAI) exclusivamente como apoyo en el desarrollo de código y generación de componentes, sin que éstas reemplacen la auditoría intelectual de la arquitectura ni incurran en plagio de código ajeno.

3. **Equidad y prevención de sesgos:** dado que ScoreLeads categoriza a los usuarios financieramente, el modelo de scoring se diseñará cuidando el derecho de igualdad, con reglas paramétricas objetivas para evitar sesgos algorítmicos o discriminaciones arbitrarias hacia los usuarios.

> Posibles trabajos de título derivados: ver [Anexo B](#anexo-b--posibles-trabajos-de-título-derivados).

---

## 5. Riesgos técnicos importantes

**Fórmula de prioridad:** `Prioridad = (11 − Posibilidad) × (11 − Impacto) × Costo Retiro`

| Descripción del riesgo | Condición | Transición | Consecuencia | Posibilidad (1-10) | Impacto (1-10) | Costo Retiro | Prioridad | Plan de mitigación |
| :--------------------- | :-------- | :--------- | :----------- | :----------------: | :------------: | :----------: | :-------: | :----------------- |
| Acumulación de deuda técnica | El equipo Scrum prioriza la entrega rápida de funcionalidades sobre las tareas de refactorización y revisión de código en los sprints actuales | Si se acumula una deuda técnica considerable sin ser saldada en ciclos cortos | Costos de mantenimiento elevados y posibles fallos críticos durante la integración final de los componentes | 6 | 8 | 7 | 105 | Integrar tareas de refactorización, pruebas unitarias y revisión de código como elementos obligatorios en el sprint backlog |
| Exposición de datos sensibles | El sistema recolecta datos financieros declarados por los usuarios | Si se guardan más datos de los necesarios o se configuran mal los permisos | Podría verse comprometida la privacidad del usuario y la confianza en la plataforma | 6 | 10 | 8 | 40 | Aplicar minimización de datos, no pedir credenciales bancarias, usar RLS, HTTPS y separar correctamente datos por usuario |
| Scoring poco confiable | Los parámetros de seguridad y tiempos de respuesta no fueron plenamente integrados en los criterios de terminado (Done) iniciales | Si las reglas no representan adecuadamente criterios financieros reales | El sistema podría entregar clasificaciones poco precisas o generar falsas expectativas | 7 | 9 | 7 | 56 | Incluir parámetros de seguridad y rendimiento como criterios de aceptación específicos dentro de las HdU desde la fase de planificación |
| Dependencia de servicios externos | El sistema utiliza Supabase, APIs externas e IA generativa | Si alguno de estos servicios presenta fallas o cambios | Interrupción parcial o total de funcionalidades críticas | 5 | 8 | 6 | 108 | Diseñar componentes desacoplados y mecanismos de respaldo, por ejemplo implementar otras dependencias |
| Vulnerabilidades de autenticación y autorización | Existen múltiples roles y acceso a información sensible | Si se implementan incorrectamente permisos o sesiones | Acceso no autorizado a información o funciones restringidas | 5 | 10 | 8 | 48 | Aplicar autenticación segura, validación de roles y pruebas de seguridad |
| Baja participación de inmobiliarias en la validación | El proyecto requiere retroalimentación de actores reales | Si no se consigue participación durante el desarrollo | Funcionalidades poco alineadas con necesidades reales | 7 | 10 | 7 | 28 | Realizar entrevistas tempranas y validaciones periódicas |
| Resistencia de ejecutivos comerciales | Los ejecutivos podrían percibir el sistema como una amenaza | Si consideran que reemplaza su criterio profesional | Baja adopción de la plataforma | 5 | 8 | 5 | 90 | Presentar la herramienta como apoyo a la toma de decisiones |
| Crecimiento descontrolado del alcance | Surgen nuevas ideas y funcionalidades durante el proyecto | Si se agregan cambios sin priorización adecuada | Retrasos y disminución de la calidad del producto | 4 | 8 | 7 | 147 | Mantener backlog priorizado y controlar cambios mediante el Product Owner |
| Incumplimiento normativo | El sistema trata datos financieros y personales | Si no se implementan controles alineados con la normativa vigente | Posibles sanciones y necesidad de rediseño del sistema | 4 | 10 | 9 | 63 | Aplicar Privacy by Design, consentimiento explícito y mecanismos ARSOBP |

---

## 6. Distribución tentativa (Sprints 1–3)

### Sprint 1

| HU / Spike | Nombre | Categoría | SP |
| :--------- | :----- | :-------- | :-: |
| Spike 1 | Investigación financiera, scoring, CMF, subsidios y educación financiera | Spike / Investigación | 10 |
| HU5 | Seguridad básica del sistema | Importante | 8 |
| HU7 | Generación de plan de mejora personalizado | Importante | 8 |
| HU12 | Academia financiera contextual | Esencial | 8 |
| HU13 | Matching lead-proyecto para ejecutivos comerciales | Importante | 5 |
| HU17 | Gestión del catálogo de proyectos inmobiliarios | Esencial | 5 |
| HU23 | Visualización y análisis de métricas sobre logs de eventos | Importante | 8 |
| HU29 | Experiencia móvil para el lead | Esencial | 5 |
| HU30 | Dashboard ejecutivo adaptable a dispositivos móviles | Esencial | 5 |
| **Total Sprint 1** | | | **62** |

### Sprint 2

| HU / Spike | Nombre | Categoría | SP |
| :--------- | :----- | :-------- | :-: |
| Spike 2 | Validación técnica de seguridad, privacidad, CMF, subsidios e integraciones externas | Spike / Investigación | 20 |
| HU4 | Sistema de Derivación e Integración Comercial | Deseable | 8 |
| HU6 | Panel de Privacidad y Gestión de Datos Personales | Deseable | 3 |
| HU8 | Seguimiento mensual del plan de mejora | Importante | 5 |
| HU9 | Simulación de compatibilidad y alternativas accesibles | Esencial | 5 |
| HU14 | Gestión de Roles y Permisos | Deseable | 3 |
| HU16 | Auditoría de evaluaciones | Deseable | 3 |
| HU18 | Evolución financiera del lead | Deseable | 5 |
| HU19 | Carga de documentos respaldatorios | Deseable | 5 |
| HU21 | Exportación de dossier para evaluación bancaria | Opcional | 3 |
| HU22 | Reporte comercial y métricas | Opcional | 3 |
| HU31 | Consulta Simulada a la CMF | Opcional | 5 |
| HU33 | Historial inmutable y versionado de evaluaciones | Deseable | 5 |
| **Total Sprint 2** | | | **73** |

### Sprint 3

| HU | Nombre | Categoría | SP |
| :- | :----- | :-------- | :-: |
| HU10 | Visualización de mapa de accesibilidad inmobiliaria | Opcional | 8 |
| HU11 | Actualización dinámica del mapa de accesibilidad | Opcional | 5 |
| HU15 | Configuración de parámetros de scoring | Opcional | 5 |
| HU20 | Simulación económica con UF y tasas | Opcional | 3 |
| HU24 | Reportar usuarios/leads fraudulentos | Deseable | 5 |
| HU25 | Simulación de Subsidios Habitacionales | Deseable | 5 |
| HU26 | Simulación de Variación de Plazos de Crédito | Opcional | 3 |
| HU27 | Dashboard de Tasas de Conversión de Ventas | Deseable | 5 |
| HU28 | Visualización Demográfica y Socioeconómica | Opcional | 1 |
| HU32 | Disponibilidad y escalabilidad del sistema | Deseable | 5 |
| **Total Sprint 3** | | | **45** |

---

## 7. Detalle de HUs y criterios de aceptación

### Spikes

#### Spike 1 – Investigación financiera, scoring, educación financiera y criterios de priorización comercial

**Puntos de historia:** 10

**Justificación:** este spike busca reducir la incertidumbre funcional asociada a las historias esenciales e importantes planificadas para el Sprint 1. La investigación permitirá fortalecer los criterios del motor de scoring, definir reglas para el plan de mejora, orientar las simulaciones de compatibilidad, seleccionar contenidos de educación financiera y establecer criterios base para el matching entre leads y proyectos inmobiliarios. Se estima en 10 SP porque su alcance está acotado a generar insumos funcionales para las HU del primer sprint, sin incluir todavía integraciones externas complejas ni validaciones técnicas profundas con servicios externos.

**Criterios de aceptación:**
- **E1 – Investigación de parámetros financieros para scoring y plan de mejora.** Dado que ScoreLeads debe entregar una evaluación financiera coherente y útil, cuando el equipo investigue criterios financieros aplicables al proceso hipotecario, entonces debe identificar variables relevantes como ingresos, deudas, ahorro, pie disponible, carga financiera, continuidad laboral, plazo estimado y comportamiento de pago declarado.
- **E2 – Definición de criterios para simulaciones de compatibilidad.** Dado que el usuario podrá simular distintos objetivos inmobiliarios, cuando el equipo analice las reglas necesarias para la simulación, entonces debe definir criterios que permitan comparar capacidad de compra, valor de vivienda, ahorro disponible, deuda y ajustes mínimos para acceder a una alternativa compatible.
- **E3 – Investigación de material para educación financiera contextual.** Dado que ScoreLeads incluye una academia financiera contextual, cuando el equipo investigue contenidos educativos relevantes para leads interesados en comprar vivienda, entonces debe recopilar y organizar temas como crédito hipotecario, pie, ahorro, carga financiera, endeudamiento, tasas, plazos y preparación para una evaluación bancaria formal.
- **E4 – Definición de criterios para matching lead-proyecto.** Dado que el sistema debe recomendar leads compatibles con proyectos inmobiliarios, cuando el equipo investigue los criterios de compatibilidad comercial, entonces debe definir variables como capacidad estimada, comuna de interés, rango de precio, pie disponible, clasificación del lead y bloqueador principal.
- **E5 – Documentación de insumos para las HU del Sprint 1.** Dado que finaliza la investigación del spike, cuando el equipo consolide los resultados, entonces debe documentar una matriz de reglas, supuestos financieros, criterios de compatibilidad, fuentes revisadas y decisiones que serán utilizadas en las historias de plan de mejora, simulación, academia financiera, matching y dashboard ejecutivo.

#### Spike 2 – Validación técnica de privacidad, roles, trazabilidad, documentos e integraciones externas

**Puntos de historia:** 20

**Justificación:** este spike busca reducir la incertidumbre técnica asociada a las historias planificadas para el Sprint 2, especialmente aquellas relacionadas con privacidad de datos, control de acceso por roles, auditoría, versionamiento de evaluaciones, carga de documentos, generación de reportes, exportación de dossier, integración comercial y consulta a servicios externos como CRM y CMF. Se estima en 20 SP porque el Sprint 2 concentra funcionalidades con mayor dependencia técnica entre sí, manejo de información sensible, persistencia segura, trazabilidad, validación de permisos e integración con servicios externos que requieren análisis previo antes de su implementación.

**Criterios de aceptación:**
- **E1 – Validación de privacidad y consentimiento.** Dado que el sistema gestiona datos financieros y personales de los leads, cuando el equipo analice los flujos de privacidad del Sprint 2, entonces debe definir qué datos requieren consentimiento, qué información puede ser descargada, rectificada o eliminada, y cómo se registrarán dichas solicitudes dentro del sistema.
- **E2 – Definición de permisos por rol.** Dado que la plataforma tendrá usuarios con distintos niveles de acceso, cuando el equipo revise las funcionalidades del Sprint 2, entonces debe definir qué acciones puede realizar cada rol, incluyendo lead, ejecutivo comercial, administrador inmobiliario y administrador desarrollador.
- **E3 – Validación técnica de auditoría e historial versionado.** Dado que el sistema debe mantener trazabilidad sobre evaluaciones, cambios de score y acciones relevantes, cuando el equipo analice los modelos de datos necesarios, entonces debe definir cómo se registrarán eventos, responsables, fechas, versiones de evaluación, motivo del cambio y relación entre evaluaciones anteriores y nuevas.
- **E4 – Investigación técnica para carga y resguardo de documentos.** Dado que los leads podrán cargar documentos respaldatorios, cuando el equipo evalúe la funcionalidad de carga de archivos, entonces debe definir tipos de archivo permitidos, tamaño máximo, mecanismo de almacenamiento, asociación con el perfil del lead, permisos de visualización y medidas mínimas de seguridad.
- **E5 – Validación de integración comercial y servicios externos.** Dado que el sistema contempla integración con CRM y consulta a fuentes externas como CMF, cuando el equipo revise dichas integraciones, entonces debe identificar requisitos técnicos, credenciales necesarias, formato de solicitud y respuesta, manejo de errores, límites de uso y comportamiento esperado si el servicio externo falla.
- **E6 – Definición técnica para reportes y exportación de dossier.** Dado que el Sprint 2 incluye reportes comerciales y exportación de expedientes, cuando el equipo analice estas funcionalidades, entonces debe definir qué datos serán incluidos, qué formato tendrán los reportes, qué permisos se requieren para descargarlos y cómo se evitará exponer información sensible innecesaria.
- **E7 – Documentación de decisiones técnicas del Sprint 2.** Dado que finaliza el spike, cuando el equipo consolide los resultados, entonces debe quedar documentado un checklist técnico con decisiones de privacidad, roles, auditoría, versionamiento, documentos, reportes, integración CRM y consulta CMF, para guiar la implementación de las historias del Sprint 2.

### Historias de usuario PMV (completadas)

#### HU1 – Formulario de pre-evaluación
**Categoría:** Compleja · **Puntos de historia:** 5

**Como** lead (interesado en comprar una vivienda), **quiero** completar un formulario web guiado, con mis datos financieros y una alta facilidad de uso, **para** iniciar mi evaluación de viabilidad crediticia, sin tener que hablar con un ejecutivo.

**Criterios de aceptación:**
- **E1** — Dado que el usuario ingresa a la plataforma ScoreLeads por primera vez, cuando completa todos los campos requeridos (ingresos, deudas, tipo de contrato, edad) y acepta el consentimiento de datos, entonces el sistema registra su perfil y lo redirige automáticamente al resultado de su evaluación.
- **E2** — Dado que el usuario está completando el formulario, cuando declara un monto de deudas mensual mayor a sus ingresos declarados, entonces el sistema muestra una advertencia visual en el campo correspondiente antes de permitir continuar al siguiente paso.
- **E3** — Dado que se recibe una postulación donde el usuario no ha aceptado el consentimiento de datos, cuando el sistema valida los requisitos de la solicitud, entonces la evaluación y los datos no deben ser guardados, para proteger la privacidad de la información.
- **E4** — Dado que la evaluación de viabilidad crediticia del lead se configura bajo la modalidad de evaluación conjunta (renta complementada), cuando el sistema estructure la petición de precalificación, entonces debe instanciar un requerimiento de datos asociado, exigiendo obligatoriamente los ingresos y deudas del co-deudor para poder ejecutar el cálculo del scoring consolidado.

#### HU2 – Dashboard de leads priorizados para el ejecutivo
**Categoría:** Compleja · **Puntos de historia:** 5

**Como** ejecutivo de ventas de la inmobiliaria, **quiero** visualizar una cartera de leads precalificados y priorizados con apoyo de inteligencia artificial, **para** enfocar mi tiempo en los prospectos con mayor probabilidad de avanzar en el proceso de compra y comprender rápidamente el contexto financiero de cada lead.

**Criterios de aceptación:**
- **E1** — Dado que el sistema ha procesado el scoring financiero de múltiples prospectos, cuando el ejecutivo comercial accede al panel principal, entonces los leads con clasificación "Alto" deben aparecer automáticamente en la parte superior de la lista.
- **E2** — Dado que un lead tiene un puntaje asignado, cuando el ejecutivo selecciona un lead específico, entonces el sistema debe mostrar un resumen visual de los indicadores (carga financiera, estabilidad, etc.) y la explicación inteligente generada para justificar dicho score.
- **E3** — Dado que el ejecutivo necesita organizar su jornada, cuando utiliza la herramienta de filtros, entonces el sistema debe permitir segmentar la visualización por categorías Alto, Medio o Bajo de forma inmediata.
- **E4** — Dado que el ejecutivo revisa el perfil de un lead priorizado, cuando visualiza el detalle del scoring, entonces el sistema debe mostrar una etiqueta de acción sugerida (ej.: "Contactar de inmediato", "Mantener en seguimiento" o "Solicitar más antecedentes") basada en el nivel de preparación.

#### HU3 – Flujo de pre-evaluación financiera guiada
**Categoría:** Muy compleja · **Puntos de historia:** 8

**Como** persona interesada en comprar una vivienda, **quiero** recibir una evaluación financiera inmediata mediante un scoring híbrido con explicación inteligente, **para** entender mi nivel de preparación, los principales factores que influyen en mi resultado y los próximos pasos recomendados antes de iniciar una evaluación formal.

**Criterios de aceptación:**
- **E1** — Dado que el usuario completó el formulario correspondiente, cuando este envía sus datos para ser procesados, entonces el sistema debe mostrar el resultado del scoring en un tiempo máximo de 60 segundos tras finalizar el formulario.
- **E2** — Dado que el sistema de ScoreLeads recibió los datos del usuario, cuando se realiza la calificación, entonces el resultado debe clasificar al usuario en niveles de prioridad claros (ej.: Alto, Medio, Bajo).
- **E3** — Dado que el sistema presenta el resultado de la evaluación, cuando el usuario visualiza su clasificación crediticia, entonces el sistema, por medio de un agente IA, debe mostrar una explicación detallada de los factores principales que influyeron en el score.
- **E4** — Dado que el usuario visualiza su resultado, cuando se muestra la explicación del scoring, entonces el sistema debe indicar explícitamente que el scoring es orientativo y no reemplaza una evaluación bancaria formal.
- **E5** — Dado que el cálculo del scoring es exitoso, cuando el sistema guarda la evaluación, entonces debe generar un registro inmutable que contenga el timestamp, score numérico, clasificación, snapshot de entrada, versión del algoritmo y desglose de componentes.
- **E6** — Dado que un lead hace envío de sus datos, cuando el sistema lo evalúa e identifica que no cumple con el puntaje mínimo para calificar, entonces permite ir a un flujo de educación financiera sin intervención del ejecutivo. En caso contrario (score alto), se debe notificar al ejecutivo comercial.

### Historias de usuario nuevas

#### HU4 – Sistema de Derivación e Integración Comercial
**Categoría:** Deseable · **Puntos de historia:** 8

**Como** funcionario de una inmobiliaria, **quiero** ingresar usuarios calificados desde la aplicación al CRM de la inmobiliaria, **para** poder darles una gestión priorizada dentro del flujo de venta del proyecto inmobiliario.

**Criterios de aceptación:**
- **E1 – Derivación automática de leads de alta prioridad al CRM.** Dado un usuario ingresado en la aplicación, cuando este termine de ser calificado y sea calificado como de alta prioridad, entonces el sistema debe replicar, inmediatamente o eventualmente, la información del usuario dentro del CRM.
- **E2 – Actualización del lead en el CRM ante cambios de score o prioridad.** Dado un usuario ingresado en la aplicación, cuando ocurra una actualización en el score de nuestro usuario y este pase a estar calificado o se aumente su prioridad, entonces el sistema debe mandar una request al CRM para que actualice los datos del usuario.
- **E3 – Retención interna de leads no prioritarios.** Dado un usuario ingresado en la aplicación, cuando este termine de ser calificado y no se considere de alta prioridad, entonces la aplicación no debe enviar su perfil al CRM y solo debe manejar sus datos dentro de la aplicación hasta que su calificación se actualice.

#### HU5 – Seguridad básica del sistema
**Categoría:** Importante · **Puntos de historia:** 8

**Como** administrador del sistema, **quiero** que la plataforma implemente validaciones, protección de endpoints y manejo seguro de errores, **para** proteger la información financiera de los usuarios y reducir riesgos de vulnerabilidades.

**Criterios de aceptación:**
- **E1 – Validación de entradas.** Dado que un usuario completa formularios o consume endpoints, cuando envía datos inválidos, incompletos o fuera de rango, entonces el sistema debe rechazar la solicitud y mostrar un mensaje controlado.
- **E2 – Protección contra errores inseguros.** Dado que ocurre un error en el backend, cuando el sistema responde al usuario, entonces no debe exponer trazas técnicas, consultas SQL, tokens ni datos sensibles.
- **E3 – Prevención de inyección SQL.** Dado que el sistema guarda o consulta información financiera, cuando se ejecutan operaciones sobre la base de datos, entonces deben utilizarse consultas parametrizadas, ORM o mecanismos equivalentes.

#### HU6 – Panel de Privacidad y Gestión de Datos Personales
**Categoría:** Deseable · **Puntos de historia:** 3

**Como** usuario registrado, **quiero** acceder a un panel de privacidad dentro de mi perfil, **para** gestionar mi consentimiento, solicitar acciones sobre mis datos y controlar el uso de mi información.

**Criterios de aceptación:**
- **E1 – Gestión de consentimiento.** Dado que el usuario accede a su perfil, cuando entra al panel de privacidad, entonces debe poder visualizar y modificar el consentimiento asociado al uso de sus datos.
- **E2 – Solicitud de descarga o rectificación.** Dado que el usuario desea ejercer sus derechos sobre sus datos, cuando seleccione descargar o rectificar información personal, entonces el sistema debe registrar la solicitud y mostrar confirmación.
- **E3 – Eliminación de cuenta.** Dado que el usuario solicita eliminar su cuenta, cuando confirme la acción, entonces el sistema debe iniciar el proceso de eliminación total e irrecuperable según las reglas definidas.
- **E4 – Recuperación de contraseña.** Dado que el usuario olvidó su contraseña o quiere modificarla, cuando solicite recuperación, entonces el sistema debe permitir iniciar el flujo de restablecimiento.

#### HU7 – Generación de plan de mejora personalizado
**Categoría:** Importante · **Puntos de historia:** 8

**Como** lead en etapa de preparación, **quiero** recibir un plan de mejora personalizado con recomendaciones, metas de deuda y ahorro, **para** saber qué acciones debo realizar para acercarme a mi objetivo inmobiliario.

**Criterios de aceptación:**
- **E1 – Generación de plan personalizado.** Dado que un usuario no cumple las condiciones para comprar su objetivo inmobiliario, cuando finaliza su evaluación financiera, entonces el sistema debe generar un plan de mejora paso a paso basado en sus datos.
- **E2 – Recomendaciones personalizadas.** Dado que el usuario recibió su score, cuando el sistema identifique oportunidades de mejora, entonces debe generar recomendaciones relacionadas con ahorro, deuda, continuidad laboral, plazo u objetivo inmobiliario.
- **E3 – Priorización por impacto.** Dado que existen varias recomendaciones disponibles, cuando el usuario visualice su resultado, entonces el sistema debe ordenarlas según el impacto estimado.
- **E4 – Beneficio esperado.** Dado que el usuario revisa una recomendación, cuando esta se muestre en pantalla, entonces debe indicar el beneficio esperado de aplicarla.
- **E5 – Crear plan de pagos de deuda.** Dado que el usuario presenta deudas vigentes que afectan su score financiero, cuando el sistema genere el plan de mejora personalizado, entonces debe crear una propuesta de pago de deuda indicando monto objetivo, prioridad de pago y plazo estimado para reducir su carga financiera.
- **E6 – Organización de pagos de deuda.** Dado que el usuario tiene más de una deuda registrada, cuando visualice su plan de mejora, entonces el sistema debe ordenar las deudas según su impacto en el score, monto pendiente o urgencia de pago, para orientar al usuario sobre cuáles abordar primero.
- **E7 – Crear plan de ahorro para el pie.** Dado que el usuario no cuenta con el ahorro suficiente para cubrir el pie requerido de su objetivo inmobiliario, cuando el sistema genere el plan de mejora, entonces debe proponer una meta de ahorro mensual y un plazo estimado para alcanzar el monto necesario.

#### HU8 – Seguimiento mensual del plan de mejora
**Categoría:** Importante · **Puntos de historia:** 5

**Como** lead con un plan de mejora activo, **quiero** registrar mi avance financiero mensual y actualizar mi situación, **para** saber si estoy avanzando correctamente hacia mi objetivo inmobiliario.

**Criterios de aceptación:**
- **E1 – Registro de avance mensual.** Dado que el usuario tiene un plan activo, cuando registre deudas pagadas o monto ahorrado, entonces el sistema debe actualizar su avance mensual y mostrar si se encuentra adelantado, dentro de plazo o atrasado respecto a su plan.
- **E2 – Proyección de elegibilidad.** Dado que el usuario actualiza su progreso financiero, cuando el sistema recalcula su situación, entonces debe mostrar una fecha estimada de elegibilidad o acercamiento al objetivo.
- **E3 – Actualización del estado del plan de mejora.** Dado que el usuario tiene un plan de mejora activo, cuando registre avances, complete hitos o no cumpla actividades planificadas, entonces el sistema debe actualizar el estado del plan usando estados como "No iniciado", "En progreso", "Avance parcial", "Completado" o "Requiere ajuste".
- **E4 – Recalcular scoring en base al cumplimiento de hitos financieros.** Dado que el usuario registra el cumplimiento de un hito financiero, como pago de deuda o aumento de ahorro, cuando el sistema valide dicho avance, entonces debe recalcular el score financiero y actualizar la clasificación del usuario si corresponde.
- **E5 – Ingreso y validación de hitos financieros.** Dado que el usuario desea registrar avances dentro de su plan de mejora, cuando ingrese un hito financiero como deuda pagada, ahorro acumulado o mejora de continuidad laboral, entonces el sistema debe validar que el dato ingresado sea consistente, positivo y no contradiga la información financiera registrada previamente.

#### HU9 – Simulación de compatibilidad y alternativas accesibles
**Categoría:** Esencial · **Puntos de historia:** 5

**Como** usuario interesado en comprar una vivienda, **quiero** simular distintos objetivos, valores, comunas, plazos y configuraciones, **para** descubrir qué alternativas son compatibles con mi perfil actual.

**Criterios de aceptación:**
- **E1 – Simulación de valores de vivienda.** Dado que el usuario ya completó su evaluación, cuando ingrese distintos valores de vivienda, entonces el sistema debe mostrar si cada escenario es compatible con su capacidad de compra.
- **E2 – Ajustes mínimos para acceder.** Dado que el usuario no califica para su objetivo declarado, cuando el sistema evalúe alternativas, entonces debe proponer el cambio mínimo que haría accesible una propiedad.
- **E3 – Comparación de escenarios.** Dado que el usuario simula distintas configuraciones, cuando el sistema presente los resultados, entonces debe mostrar claramente la diferencia entre el escenario actual y los escenarios alternativos.
- **E4 – Estimación de capacidad de compra.** Dado que el usuario recibió su evaluación, cuando visualice el resultado, entonces el sistema debe mostrar el valor máximo estimado de vivienda que podría financiar.
- **E5 – Tiempo máximo de respuesta.** Dado que el usuario realiza la simulación de compatibilidad, cuando esta termine, entonces no debe exceder un tiempo de respuesta de 30 segundos.

#### HU10 – Visualización de mapa de accesibilidad inmobiliaria
**Categoría:** Opcional · **Puntos de historia:** 8

**Como** usuario que completó su evaluación, **quiero** visualizar un mapa de la Región Metropolitana con sectores clasificados según mi capacidad financiera, **para** entender de forma visual dónde podría comprar hoy y dónde estoy fuera de alcance.

**Criterios de aceptación:**
- **E1 – Clasificación visual por barrio.** Dado que el usuario completó su evaluación, cuando acceda al mapa, entonces cada barrio debe mostrarse como accesible, cercano o fuera de alcance según su perfil financiero.
- **E2 – Razón del resultado.** Dado que un barrio aparece como cercano o fuera de alcance, cuando el usuario lo seleccione, entonces el sistema debe mostrar la razón principal del resultado.
- **E3 – Visualización mapa de calor.** Dado que el lead abra el mapa térmico, cuando el sistema cruza su score con los sectores disponibles, entonces debe marcar en verde los sectores de las comunas donde puede y quiere comprar, en amarillo donde es poco probable y en rojo los sectores inalcanzables.
- **E4 – Explicación de los resultados obtenidos.** Dado que el usuario obtuvo un segmento o proyecto en "amarillo" o "rojo", cuando haga clic sobre él, entonces el sistema debe explicar cuánto más de renta, ahorro o mejora financiera necesita para poder acceder a ese sector o proyecto.

#### HU11 – Actualización dinámica del mapa de accesibilidad
**Categoría:** Opcional · **Puntos de historia:** 5

**Como** usuario que modifica sus condiciones financieras o preferencias de compra, **quiero** que el mapa de accesibilidad se actualice automáticamente, **para** comparar cómo cambian mis opciones de vivienda según mi score, renta, plazo o tipo de vivienda.

**Criterios de aceptación:**
- **E1 – Reevaluación cuando se modifica el score/renta.** Dado que un usuario ha mejorado su score o renta, cuando vuelva a ingresar al mapa, entonces el sistema debe volver a calcular los segmentos o proyectos y modificar los colores del mapa según corresponda.
- **E2 – Actualización por palancas.** Dado que el usuario ajusta plazo, tipo de vivienda o condición de primera vivienda, cuando modifica esos parámetros, entonces el mapa debe actualizar el resultado de accesibilidad.

#### HU12 – Academia financiera contextual
**Categoría:** Esencial · **Puntos de historia:** 8

**Como** usuario interesado en comprar una vivienda, **quiero** acceder a contenido educativo sobre crédito hipotecario, pie, subsidios, tasas y tipos de vivienda, **para** comprender mejor mis opciones y prepararme antes de comprar.

**Criterios de aceptación:**
- **E1 – Catálogo educativo.** Dado que el usuario accede a la sección Academia, cuando visualiza el módulo, entonces el sistema debe mostrar artículos o cápsulas organizadas por tema.
- **E2 – Contenido según situación del usuario.** Dado que el usuario tiene un bloqueador financiero identificado, cuando revise su resultado o plan de mejora, entonces el sistema debe sugerir contenido educativo relacionado.
- **E3 – Enlaces contextuales.** Dado que el usuario visualiza conceptos como pie, tasa, subsidio o plazo, cuando aparezcan en resultado, plan o mapa, entonces el sistema debe ofrecer acceso directo al contenido correspondiente.

#### HU13 – Matching lead-proyecto para ejecutivos comerciales
**Categoría:** Importante · **Puntos de historia:** 5

**Como** ejecutivo comercial, **quiero** que el sistema sugiera leads compatibles con los proyectos que vendo, **para** priorizar prospectos con mayor probabilidad de conversión.

**Criterios de aceptación:**
- **E1 – Lista priorizada por proyecto.** Dado que el ejecutivo selecciona un proyecto, cuando accede a su panel de leads, entonces el sistema debe mostrar usuarios compatibles ordenados por afinidad y capacidad de compra.
- **E2 – Matching por capacidad.** Dado que un usuario tiene capacidad suficiente para un proyecto, cuando el motor de matching lo evalúa, entonces debe poder aparecer recomendado aunque su clasificación general no sea Alta.
- **E3 – Evidencia para el ejecutivo.** Dado que un lead aparece recomendado, cuando el ejecutivo revisa su tarjeta, entonces debe ver capacidad estimada, pie, clasificación y bloqueador principal.
- **E4 – Lead reorientable.** Dado que un usuario puede comprar un proyecto distinto a su objetivo declarado, cuando el sistema lo detecta, entonces debe mostrarlo como oportunidad reorientable.

#### HU14 – Gestión de Roles y Permisos
**Categoría:** Deseable · **Puntos de historia:** 3

**Como** administrador dev, **quiero** gestionar roles y permisos dentro de la plataforma, **para** controlar el acceso a funcionalidades según el perfil de cada usuario.

**Criterios de aceptación:**
- **E1 – Asignación de roles.** Dado que el administrador accede a la gestión de usuarios, cuando asigna un rol a una cuenta, entonces el sistema debe guardar el rol correctamente.
- **E2 – Restricción de acceso.** Dado que un usuario intenta acceder a una funcionalidad no permitida, cuando el sistema valida sus permisos, entonces debe bloquear el acceso.
- **E3 – Vista según rol.** Dado que un usuario inicia sesión, cuando accede a la plataforma, entonces debe visualizar solo las funcionalidades correspondientes a su rol.

#### HU15 – Configuración de parámetros de scoring
**Categoría:** Opcional · **Puntos de historia:** 5

**Como** administrador inmobiliario, **quiero** modificar los parámetros utilizados por el motor de scoring, **para** adaptar los leads que le aparecen a mis ejecutivos comerciales a lo que buscamos como organización.

**Criterios de aceptación:**
- **E1 – Visualización de parámetros.** Dado que el administrador inmobiliario accede al panel de scoring, cuando consulta la configuración, entonces debe ver los parámetros utilizados por el motor.
- **E2 – Modificación autorizada.** Dado que el administrador inmobiliario modifica un parámetro, cuando guarda los cambios, entonces el sistema debe validar y persistir la nueva configuración.
- **E3 – Aplicación futura.** Dado que existen nuevos parámetros configurados, cuando se realicen evaluaciones posteriores, entonces el sistema debe utilizar la configuración vigente.

#### HU16 – Auditoría de evaluaciones
**Categoría:** Deseable · **Puntos de historia:** 3

**Como** administrador inmobiliario/dev, **quiero** disponer de un registro de acciones realizadas sobre evaluaciones, **para** asegurar trazabilidad y facilitar la revisión de cambios dentro del sistema.

**Criterios de aceptación:**
- **E1 – Registro de acciones.** Dado que una evaluación es creada, actualizada o revisada, cuando ocurre la acción, entonces el sistema debe registrar el evento correspondiente.
- **E2 – Identificación del responsable.** Dado que una acción queda registrada, cuando el administrador inmobiliario/dev consulte la auditoría, entonces debe ver el usuario responsable y la fecha del evento.
- **E3 – Historial cronológico.** Dado que existen eventos asociados a una evaluación, cuando se visualice su historial, entonces deben mostrarse en orden cronológico.

#### HU17 – Gestión del catálogo de proyectos inmobiliarios
**Categoría:** Esencial · **Puntos de historia:** 5

**Como** administrador inmobiliario, **quiero** registrar y mantener un catálogo de proyectos inmobiliarios y vincularlos con ejecutivos, **para** que el sistema pueda recomendar leads según los proyectos realmente disponibles.

**Criterios de aceptación:**
- **E1 – Creación de proyecto.** Dado que el administrador accede al panel de proyectos, cuando ingresa nombre, inmobiliaria, comuna, tipo, rango de precio y estado, entonces el sistema debe guardar el proyecto en el catálogo.
- **E2 – Validación de datos.** Dado que el administrador inmobiliario crea o edita un proyecto, cuando ingresa datos obligatorios incompletos o precios inconsistentes, entonces el sistema debe impedir guardar hasta corregirlos.
- **E3 – Vinculación con ejecutivos.** Dado que existe un proyecto en el catálogo, cuando el administrador asigna ejecutivos, entonces esos ejecutivos deben quedar vinculados al proyecto.
- **E4 – Estado del proyecto.** Dado que un proyecto está marcado como agotado, cuando se ejecute el matching, entonces no debe generar nuevas recomendaciones.

#### HU18 – Evolución financiera del lead
**Categoría:** Deseable · **Puntos de historia:** 5

**Como** ejecutivo comercial, **quiero** visualizar la evolución financiera de un lead, **para** detectar oportunidades de contacto y seguimiento comercial.

**Criterios de aceptación:**
- **E1 – Historial de evaluaciones.** Dado que un lead ha realizado más de una evaluación, cuando el ejecutivo acceda a su perfil, entonces debe ver el historial de evaluaciones registradas.
- **E2 – Visualización de evolución.** Dado que existen evaluaciones históricas, cuando el ejecutivo revise el perfil del lead, entonces el sistema debe mostrar cambios en score, capacidad de compra o bloqueador principal.
- **E3 – Oportunidad de seguimiento.** Dado que el lead mejora su situación financiera, cuando el sistema detecte un avance relevante, entonces debe permitir identificarlo como oportunidad de contacto.
- **E4 – Comparador entre evaluaciones.** Dado que quiero comparar evaluaciones de un mismo o diferente lead, cuando selecciono dos evaluaciones distintas, entonces el sistema me muestra las comparaciones que hay entre los perfiles, indicando claramente cuáles son las fortalezas y debilidades de cada evaluación.

#### HU19 – Carga de documentos respaldatorios
**Categoría:** Deseable · **Puntos de historia:** 5

**Como** ejecutivo, **quiero** que los usuarios precalificados suban comprobantes financieros a la plataforma, **para** poder validar la información declarada.

**Criterios de aceptación:**
- **E1 – Carga de archivos permitidos.** Dado que el lead desea respaldar su información, cuando suba documentos en PDF, JPG o PNG, entonces el sistema debe aceptarlos si cumplen las reglas definidas.
- **E2 – Almacenamiento seguro.** Dado que el usuario carga documentos financieros, cuando el sistema los almacena, entonces deben quedar vinculados a su perfil de forma segura.
- **E3 – Visualización por ejecutivo.** Dado que un ejecutivo revisa un lead precalificado, cuando accede a su perfil, entonces debe poder visualizar o descargar los documentos permitidos.

#### HU20 – Simulación económica con UF y tasas
**Categoría:** Opcional · **Puntos de historia:** 3

**Como** persona interesada en comprar una vivienda, **quiero** visualizar cómo cambios en UF o tasas de interés afectan mi capacidad de compra, **para** comprender los riesgos financieros antes de avanzar en el proceso.

**Criterios de aceptación:**
- **E1 – Escenario por tasa de interés.** Dado que el usuario ya recibió su evaluación, cuando seleccione un escenario con distintas tasas de interés, entonces el sistema debe mostrar cómo cambia su capacidad de compra y su dividendo.
- **E2 – Escenario por variación de UF.** Dado que el usuario visualiza su evaluación, cuando el sistema procese una variación simulada de UF, entonces debe mostrar el cambio estimado en capacidad de financiamiento.
- **E3 – Notificación de riesgo financiero al usuario.** Dado que el usuario simula un escenario con aumento de tasa de interés o variación de UF, cuando el sistema detecte que el dividendo estimado o la carga financiera supera el umbral definido por las reglas del sistema, entonces debe mostrar una alerta de riesgo indicando que el escenario podría afectar su capacidad de pago y recomendar revisar alternativas como aumentar el pie, ajustar el plazo, reducir el valor objetivo de la vivienda o evaluar subsidios disponibles.
- **E4 – Comparación clara.** Dado que el usuario revisa escenarios económicos, cuando el sistema presente los resultados, entonces debe diferenciar claramente el escenario actual de los simulados.

#### HU21 – Exportación de dossier para evaluación bancaria
**Categoría:** Opcional · **Puntos de historia:** 3

**Como** ejecutivo comercial, **quiero** exportar un reporte consolidado con el perfil del lead y sus documentos, **para** agilizar una futura derivación a instituciones bancarias formales.

**Criterios de aceptación:**
- **E1 – Exportación desde perfil del lead.** Dado que el ejecutivo revisa un prospecto priorizado, cuando seleccione exportar dossier, entonces el sistema debe generar un expediente digital.
- **E2 – Contenido del dossier.** Dado que el dossier se genera, cuando el ejecutivo lo descargue, entonces debe incluir detalle del score, perfil del lead y documentos cargados.
- **E3 – Formato estandarizado.** Dado que el dossier será usado para revisión posterior, cuando se genere el archivo, entonces debe presentar la información de forma limpia y estructurada.

#### HU22 – Reporte comercial y métricas
**Categoría:** Opcional · **Puntos de historia:** 3

**Como** ejecutivo comercial, **quiero** descargar reportes sobre leads evaluados, clasificaciones y tasas de precalificación, **para** analizar el rendimiento comercial de la campaña inmobiliaria.

**Criterios de aceptación:**
- **E1 – Reporte de volumen de leads.** Dado que un usuario autorizado accede al módulo de reportes, cuando seleccione un periodo, entonces el sistema debe mostrar el volumen de leads evaluados.
- **E2 – Clasificaciones y precalificación.** Dado que existen evaluaciones registradas, cuando se genere el reporte, entonces debe incluir clasificaciones obtenidas y tasas de precalificación.
- **E3 – Descarga autorizada.** Dado que el reporte está disponible, cuando un gerente o ejecutivo autorizado lo descargue, entonces el sistema debe permitir exportarlo en formato Excel o PDF.

#### HU23 – Visualización y análisis de métricas sobre los "logs de eventos"
**Categoría:** Importante · **Puntos de historia:** 8

**Como** administrador inmobiliario, **quiero** ser capaz de visualizar los logs de eventos de la aplicación (clicks de ingreso, la creación de cuentas, las preevaluaciones, la edad de los usuarios que realizan los formularios, etc.), **para** obtener diferentes métricas sobre los usuarios y así poder realizar análisis de datos y mejorar la toma de decisiones.

**Criterios de aceptación:**
- **E1 – Visualización de las tablas de datos.** Dado un ejecutivo comercial que quiere revisar los logs de eventos, cuando este ingrese a la vista del log, entonces debe poder visualizar los distintos logs.
- **E2 – Generación de gráficos y análisis de datos para la toma de decisiones.** Dado un ejecutivo comercial que quiera realizar análisis de datos en base a las tablas, cuando le pida a la página que genere gráficos respecto a un dato o pida calcular alguna estadística (media, mediana, moda, etc.), entonces se deben mostrar los gráficos y los resultados solicitados.
- **E3 – Protección de los datos personales.** Dado que un usuario no ha aceptado el consentimiento de datos, cuando realiza la preevaluación o hace clicks en la página, entonces no deben aparecer sus eventos en el log.
- **E4 – Explicabilidad de los datos para la toma de decisiones.** Dado un administrador inmobiliario, cuando le pida a la página que genere las métricas de los datos recopilados por el log, entonces la página debe generar una explicación/análisis preliminar de los datos para facilitar su comprensión.

#### HU24 – Reportar usuarios/leads fraudulentos
**Categoría:** Deseable · **Puntos de historia:** 5

**Como** ejecutivo comercial, **quiero** eliminar/quitar del dashboard de mis ejecutivos comerciales a usuarios fraudulentos, **para** así poder evitar posibles fraudes y pérdida de tiempo y dinero para los ejecutivos comerciales.

**Criterios de aceptación:**
- **E1 – Detección de indicadores de inconsistencia.** Dado que un lead completa una preevaluación financiera, cuando el sistema detecte información contradictoria, incompleta o poco confiable, entonces deberá marcar el lead con una alerta de posible inconsistencia.
- **E2 – Visualización de alertas en el dashboard.** Dado que existe un lead marcado con posible inconsistencia o fraude, cuando el ejecutivo comercial o administrador visualice el dashboard, entonces el sistema deberá mostrar una etiqueta o advertencia visible en la tarjeta del lead.
- **E3 – Reporte manual de lead sospechoso.** Dado que un ejecutivo comercial revisa un lead, cuando detecte información sospechosa, inconsistente o posiblemente fraudulenta, entonces deberá poder reportarlo indicando un motivo del reporte.
- **E4 – Cambio de estado del lead reportado.** Dado que un lead ha sido reportado, cuando el administrador inmobiliario revise el caso, entonces deberá poder cambiar su estado a "En revisión", "Descartado por inconsistencia", "Fraude confirmado" o "Reactivado".
- **E5 – Depuración del dashboard comercial.** Dado que un lead fue descartado por inconsistencia o fraude confirmado, cuando los ejecutivos comerciales visualicen su cartera de leads, entonces el sistema deberá ocultar o retirar dicho lead de la vista principal de oportunidades comerciales.
- **E6 – Notificación del estado del reporte.** Dado que un reporte cambia de estado, cuando el sistema actualice la revisión del lead, entonces deberá notificar o mostrar el nuevo estado al usuario que realizó el reporte y al administrador correspondiente.
- **E7 – Registro de auditoría del reporte.** Dado que se reporta, descarta, reactiva o modifica el estado de un lead, cuando ocurra la acción, entonces el sistema deberá guardar fecha, responsable, motivo y estado anterior/posterior para mantener trazabilidad.
- **E8 – Prevención de eliminación irreversible.** Dado que un lead es reportado como fraudulento o inconsistente, cuando se depure del dashboard, entonces el sistema no deberá eliminar definitivamente su información de forma automática, sino mantenerla registrada para revisión, auditoría o posible reactivación.

#### HU25 – Simulación de Subsidios Habitacionales
**Categoría:** Deseable · **Puntos de historia:** 5

**Como** lead interesado, **quiero** consultar (o simular) si aplico a subsidios de forma automática, **para** reducir el valor del dividendo y compensar las faltas de ahorro.

**Criterios de aceptación:**
- **E1 – Sugerir evaluar el impacto de subsidios.** Dado que el lead obtuvo un score bajo debido principalmente a su nivel de ingresos, cuando el sistema genere el resultado de la evaluación financiera, entonces debe sugerir la posibilidad de explorar subsidios habitacionales como alternativa para mejorar su acceso a una vivienda.
- **E2 – Recalcular score (dividendo) en base al subsidio.** Dado que elijo explorar el subsidio, cuando simulo la compra, entonces el sistema recalcula el dividendo aplicando el beneficio.
- **E3 – Carácter referencial de la simulación de subsidios.** Dado que el usuario visualiza una simulación de subsidio habitacional, cuando el sistema muestre los resultados, entonces debe indicar claramente que la información es referencial, no garantiza la obtención del subsidio y no reemplaza la evaluación oficial realizada por las entidades correspondientes.
- **E4 – Visualización de opciones de subsidios en base a los datos ingresados.** Dado que el usuario ingresó información como ingresos, ahorro disponible, comuna de interés y objetivo inmobiliario, cuando el sistema evalúe la posibilidad de aplicar un subsidio habitacional, entonces debe mostrar las opciones de subsidio compatibles o potencialmente compatibles con su perfil, indicando el beneficio estimado y las condiciones principales que debería cumplir.

#### HU26 – Simulación de Variación de Plazos de Crédito
**Categoría:** Opcional · **Puntos de historia:** 3

**Como** lead interesado en comprar, **quiero** poder simular mi crédito con plazos a 20, 25 y 30 años (tiempos referenciales), **para** encontrar el equilibrio perfecto entre cuota mensual y vida del crédito.

**Criterios de aceptación:**
- **E1 – Ajuste automático de cuotas e intereses.** Dado que cambio el plazo a 20 años, cuando el sistema lo procesa, entonces sube la cuota mensual pero reduce el interés final.
- **E2 – Notificar sobre simulaciones de crédito no válidas.** Dado que superó los 70 años en la proyección, cuando elijo 30 años, entonces el simulador me notifica que esa opción no es válida.
- **E3 – Visualización de resultados para plazos intermedios.** Dado que se escoge un plazo que no sea el mínimo, cuando el sistema procesa el resultado, entonces el sistema debe mostrar los resultados de los plazos anteriores, quizás en forma de gráfico, para ver las variaciones de cuota e interés por segmento.

#### HU27 – Dashboard de Tasas de Conversión de Ventas
**Categoría:** Deseable · **Puntos de historia:** 5

**Como** administrador inmobiliario/ejecutivo comercial, **quiero** visualizar el embudo de ventas general, **para** medir si el ciclo de venta se está reduciendo a 6 meses.

**Criterios de aceptación:**
- **E1 – Medir impacto del plan de mejora.** Dado que ingresó al dashboard gerencial, cuando reviso el gráfico de embudo, entonces veo cuántos leads pasaron de "En progreso / En plan de mejora" a "Venta Cerrada".
- **E2 – Medir tiempo promedio entre preevaluación y conversión a venta.** Dado que quiero ver el impacto de la herramienta, cuando reviso el KPI de tiempo, entonces visualizo el promedio de días desde la preevaluación hasta la "Venta Cerrada".
- **E3 – Visualización de gráficos en el tiempo.** Dado que quiero medir cómo han evolucionado las métricas de venta en el tiempo (semana a semana, mes a mes, año a año), cuando ingreso a la pestaña de evaluaciones históricas, entonces se deben desplegar distintos gráficos en función del tiempo seleccionado mostrando cómo han cambiado las ventas desde que se usa la aplicación.

#### HU28 – Visualización Demográfica y Socioeconómica
**Categoría:** Opcional · **Puntos de historia:** 1

**Como** ejecutivo comercial/administrador inmobiliario, **quiero** analizar la edad, rentas y deudas de los cotizantes, **para** ajustar futuras estrategias de marketing de la inmobiliaria.

**Criterios de aceptación:**
- **E1 – Visualización de reporte ordenada por filtros.** Dado un ejecutivo que quiere consultar el reporte, cuando se ordenan los datos del log de cotizantes, entonces se debe visualizar la distribución de leads según el filtro indicado (deuda, edad, rentas, etc.).
- **E2 – Generación de informe PDF.** Dado que quiero descargar el reporte generado por los logs, cuando le doy click al botón "Descargar reporte/informe", entonces se debe generar y descargar un reporte PDF con los datos del log de cotizantes.
- **E3 – Anonimización de los datos en la generación de los informes PDF.** Dado que los datos son exportados, cuando genero un informe, entonces los campos de identificación personal son omitidos (anonimización).

#### HU29 – Experiencia móvil para el lead
**Categoría:** Esencial · **Puntos de historia:** 5

**Como** lead interesado en comprar una vivienda, **quiero** completar mi preevaluación financiera y revisar mi resultado desde un celular, **para** poder conocer mi situación financiera de forma simple, rápida y sin depender de un computador.

**Criterios de aceptación:**
- **E1 – Visualización adaptable del flujo de preevaluación.** Dado que el lead accede desde un dispositivo móvil, cuando visualice la landing, el formulario de preevaluación y la pantalla de resultado, entonces el sistema debe adaptar correctamente los elementos a la pantalla sin generar desplazamiento horizontal ni pérdida de información.
- **E2 – Formulario móvil usable.** Dado que el lead completa su evaluación desde un celular, cuando ingrese datos financieros como ingresos, deudas, ahorro y situación laboral, entonces los campos deben ser legibles, fáciles de seleccionar y utilizar teclados adecuados según el tipo de dato.
- **E3 – Resultado financiero legible en móvil.** Dado que el lead finalizó su preevaluación desde un celular, cuando visualice su score, clasificación, capacidad de compra y recomendaciones, entonces la información debe mostrarse de manera ordenada, priorizando los elementos más importantes.
- **E4 – Plan de mejora accesible desde celular.** Dado que el lead tiene un plan de mejora activo, cuando acceda desde un dispositivo móvil, entonces debe poder revisar sus hitos, registrar avances y visualizar el progreso sin perder funcionalidad respecto a la versión de escritorio.
- **E5 – Validación en tamaños de pantalla móviles.** Dado que se entrega la versión móvil del flujo del lead, cuando se realicen pruebas de interfaz, entonces debe comprobarse su funcionamiento en resoluciones representativas de celulares, como 360x800, 390x844 y 430x932.

#### HU30 – Dashboard ejecutivo adaptable a dispositivos móviles
**Categoría:** Esencial · **Puntos de historia:** 5

**Como** ejecutivo comercial, **quiero** revisar y gestionar leads desde mi celular, **para** priorizar prospectos viables y realizar seguimiento comercial sin depender de un computador.

**Criterios de aceptación:**
- **E1 – Dashboard móvil basado en tarjetas.** Dado que el ejecutivo accede al dashboard desde un celular, cuando visualice la lista de leads, entonces el sistema debe mostrar la información en formato de tarjetas adaptadas a pantalla móvil, evitando tablas difíciles de leer.
- **E2 – Filtros accesibles en móvil.** Dado que el ejecutivo revisa leads desde un celular, cuando necesite filtrar por score, estado, prioridad, proyecto o clasificación, entonces los filtros deben estar disponibles en una sección desplegable o compacta sin saturar la pantalla.
- **E3 – Información clave visible por lead.** Dado que el ejecutivo visualiza una tarjeta de lead, cuando revise el dashboard móvil, entonces debe poder ver al menos nombre, clasificación, score, capacidad estimada, bloqueador principal y estado comercial.
- **E4 – Acciones rápidas del ejecutivo.** Dado que el ejecutivo revisa un lead desde su celular, cuando seleccione una tarjeta, entonces debe poder ejecutar acciones principales como ver detalle, cambiar estado, marcar seguimiento o reportar inconsistencia.
- **E5 – Priorización clara en pantalla pequeña.** Dado que existen múltiples leads en el dashboard, cuando el ejecutivo acceda desde móvil, entonces los leads de mayor prioridad deben distinguirse visualmente de los leads medios, bajos o descartados.
- **E6 – Mantención de permisos por rol.** Dado que el dashboard móvil muestra información financiera de leads, cuando un usuario acceda desde celular, entonces el sistema debe mantener las mismas restricciones de acceso y permisos que en la versión de escritorio.
- **E7 – Prueba funcional en dispositivos móviles.** Dado que se entrega la versión móvil del dashboard, cuando se realicen pruebas de aceptación, entonces debe validarse que las acciones principales funcionen correctamente en resoluciones móviles representativas.

#### HU31 – Consulta Simulada a la CMF
**Categoría:** Opcional · **Puntos de historia:** 5

**Como** ejecutivo comercial, **quiero** verificar antecedentes de morosidad (deuda) en base a la información provista por el usuario, **para** así poder determinar si el lead tiene un comportamiento de pago sano.

**Criterios de aceptación:**
- **E1 – Generación de simulación de antecedentes de endeudamiento.** Dado que el lead completó su preevaluación financiera, cuando el ejecutivo comercial solicite revisar sus antecedentes simulados de endeudamiento, entonces el sistema debe generar un resultado referencial considerando ingresos, deudas declaradas, carga financiera, morosidad informada y comportamiento de pago declarado.
- **E2 – Clasificación del riesgo de endeudamiento.** Dado que el sistema procesó la información financiera declarada por el lead, cuando se genere la simulación, entonces debe clasificar el riesgo de endeudamiento en niveles como "Bajo", "Medio", "Alto" o "Crítico", según reglas internas previamente definidas.
- **E3 – Explicación del resultado obtenido.** Dado que existe una simulación de endeudamiento generada, cuando el ejecutivo revise el detalle del lead, entonces el sistema debe mostrar una explicación clara de los factores que influyeron en el resultado, indicando si la carga financiera, morosidad declarada o deudas vigentes afectaron negativamente la evaluación.
- **E4 – Caché de sistema.** Dado que existe una simulación previa asociada al lead, cuando el ejecutivo comercial solicite consultar nuevamente sus antecedentes simulados, entonces el sistema debe reutilizar el resultado guardado si los datos financieros no han cambiado.
- **E5 – Consulta a CMF solo leads validados.** Dado que el lead no posee información financiera suficiente o válida, cuando se intente ejecutar la simulación, entonces el sistema debe bloquear la consulta y solicitar completar los datos requeridos.
- **E6 – Ajuste del scoring según resultado simulado.** Dado que la simulación detecta un nivel de riesgo relevante, cuando el sistema actualice la evaluación del lead, entonces debe aplicar un ajuste al scoring financiero y registrar el motivo del cambio, dejando claro que corresponde a una simulación interna y no a una consulta oficial a la CMF.

#### HU32 – Disponibilidad y escalabilidad del sistema
**Categoría:** Deseable · **Puntos de historia:** 5

**Como** equipo de desarrollo/DevOps, **quiero** monitorear la disponibilidad del sistema y validar su comportamiento bajo carga, **para** garantizar un uptime ≥ 95% y soportar ≥ 100 evaluaciones sin pérdida de datos durante el periodo de prueba.

**Criterios de aceptación:**
- **E1 – Monitoreo de uptime.** Dado que el sistema está desplegado en staging/producción, cuando transcurre el periodo de prueba, entonces un mecanismo de monitoreo debe registrar la disponibilidad evidenciando un uptime ≥ 95%, con alerta ante caídas.
- **E2 – Smoke tests post-deploy.** Dado que se ejecuta un deploy, cuando finaliza el pipeline, entonces deben correr smoke tests que verifiquen que los endpoints críticos (incluido `POST /score`) responden correctamente.
- **E3 – Prueba de carga.** Dado que se simulan ≥ 100 evaluaciones, cuando se ejecuta la prueba de carga sobre Supabase, entonces el sistema debe procesarlas sin pérdida de datos ni degradación que impida mostrar el score dentro del límite definido.

#### HU33 – Historial inmutable y versionado de evaluaciones
**Categoría:** Deseable · **Puntos de historia:** 5

**Como** administrador inmobiliario, **quiero** que cada recálculo o ajuste del scoring genere una nueva evaluación versionada e inmutable enlazada a la anterior, **para** conservar un historial fiel y trazable que no pueda alterarse.

**Criterios de aceptación:**
- **E1 – Nueva versión por recálculo.** Dado que ocurre un recálculo o ajuste del score (pago de deuda HU8, cambio de configuración HU14, ajuste por CMF HU31/HU25, simulación de subsidio HU26), cuando el sistema actualiza la evaluación, entonces debe crear un nuevo registro de evaluación versionado en vez de modificar el existente.
- **E2 – Inmutabilidad y linaje.** Dado que existe una evaluación previa, cuando se genera su sucesora, entonces el registro anterior debe permanecer inmutable (sin UPDATE ni DELETE) y quedar enlazado a la nueva versión.
- **E3 – Trazabilidad del registro.** Dado que se persiste una evaluación, cuando se guarda, entonces debe incluir timestamp, `scoring_version`, snapshot de los datos de entrada y el motivo del recálculo.
- **E4 – Coherencia con la auditoría.** Dado que un ejecutivo/administrador consulta el historial (HU16), cuando revisa una evaluación, entonces debe poder reconstruir la cadena de versiones en orden cronológico con su motivo.

---

## Anexo A – Compromiso ético

> *El presente documento surge a partir de una charla en Informática de la contralora y abogada Loreto Valenzuela como apoyo de consideración de aspectos éticos como buena práctica en los procesos de desarrollo de proyectos como memoria o software. Ver detalles en: [https://www.youtube.com/watch?v=BZ0D12jLeAk](https://www.youtube.com/watch?v=BZ0D12jLeAk)*
>
> *Se debe tener presente que la incorporación de este tipo de checklist no puede tener por objeto una eventual afectación de la libertad de conciencia, de expresión, para las creaciones intelectuales y artísticas, de cualquier especie, entre otros derechos fundamentales, de la comunidad universitaria.*

**Aspectos que deberá tener presente el desarrollo del proyecto:**

**I. Verificar aspectos mínimos éticos** asociados con el actuar con rigor científico y de trabajo, asegurando la validez y fiabilidad de sus fuentes, datos y resultados. Revisar no incurrir en faltas como: (1) falsificación o invención de datos o fuentes; (2) crear entrevistas que no se realizaron o insertar preguntas no realizadas; (3) no requerir las autorizaciones respectivas de quien tiene el derecho de autor o el derecho de propiedad industrial, según corresponda; (4) incluir como autor a quien no ha participado en la investigación y/o proyecto; (5) justificar resultados, manipular (acomodar u ocultar) datos con la misma finalidad (fraude); plagio del trabajo de otros autores (infracción al derecho de autor).

**II. Consideraciones éticas para protección de datos personales y confidencialidad:** (1) asegurar la privacidad de la información de terceros; (2) contar con los acuerdos de confidencialidad de terceros (si corresponde); (3) anonimizar los datos; (4) adoptar medidas para no emplear los datos para otros fines distintos a los que se autorizaron para su recopilación; (5) eliminar o cancelar los datos cuando su almacenamiento carezca de fundamento legal o cuando caduquen.

**III. Análisis de potenciales riesgos de afectación de derechos de terceros:** contar con los respaldos de consentimiento informado (si corresponde); que el consentimiento cuente con un lenguaje comprensible para cualquier participante; responder y clarificar todas las dudas de los terceros intervinientes. Anticipar una evaluación sobre si el proyecto puede lesionar derechos como: derecho a la vida e integridad física y psíquica; derecho de igualdad (evitar sesgos y discriminaciones arbitrarias); derecho a la honra; protección de datos personales (Ley 19.628); derecho de propiedad; derechos de autor y de propiedad industrial.

**IV. Verificar la conformidad con la regulación legal y normativa interna aplicable:** evaluar los riesgos de un potencial uso indebido de los datos; tomar conocimiento de las conductas sancionadas en la ley de delitos informáticos, la ley de ciberseguridad, la ley de responsabilidad penal de las personas jurídicas, la Ley de Educación Superior y la Ley N.º 21.369 (acoso sexual, violencia y discriminación de género); dar cumplimiento a la normativa interna, entre ella el Reglamento de derechos y deberes de los estudiantes.

**VI. Prevenir la existencia de una declaración de conflicto de interés** por parte de todos los autores de la investigación y/o proyecto.

**VII. Considerar los aspectos éticos en todo el proceso**, desde su concepción, el levantamiento de información y de necesidades para el diseño del sistema, el estudio del arte previo y el análisis de resultados, hasta las fases de implementación, seguimiento y monitoreo. En caso de usar herramientas de IA u otras ayudas extras, éstas deben ser explicitadas.

**Nombre y firma de cada integrante del equipo:**

- Claudio Ariel Jiménez Astudillo
- Rodrigo Ignacio Ramírez Díaz
- Mauro Castillo Lackington
- Isaías Amaro Carte Figueroa
- Andrés Alejandro Jablonca Peña
- Benjamín Olguín Pozo

---

## Anexo B – Posibles trabajos de título derivados

| # | Perfil a desarrollar en Trabajo de Título | Nombre del estudiante |
| :- | :---------------------------------------- | :-------------------- |
| 1 | Base Conceptual | Claudio Ariel Jiménez Astudillo |
| 2 | Emprendimiento | Rodrigo Ignacio Ramírez Díaz |
| 3 | Emprendimiento | Isaías Amaro Carte Figueroa |
| 4 | Emprendimiento | Benjamín Olguín Pozo |
| 5 | Emprendimiento | Mauro Castillo Lackington |
| 6 | — | — |

En acuerdo a lo expresado en la tabla anterior, firman los estudiantes que conforman el equipo en demostración de la aprobación y apoyo del (de los) tema(s) de Trabajo de Título que se detalla(n).
