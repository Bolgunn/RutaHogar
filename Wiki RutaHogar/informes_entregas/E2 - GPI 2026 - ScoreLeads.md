# Historias de Usuario (Corregidas)

> **Documento entregado — congelado.** Este informe usa la numeración vigente a su fecha de entrega y se conserva tal como fue presentado. No se actualiza con cambios posteriores del backlog.

## RutaHogar - Campus San Joaquín

---

## Tabla con integrantes y datos de contacto

| **Nombre**          | **Rol-equipo**       | **Celular**         |
| :------------------ | :------------------- | :------------------ |
| **Andrés Jablonca** | **CPO - Hippie**     | **+56 9 8770 5505** |
| **Isaías Carte**    | **CEO - Hustler**    | **+56 9 9884 5848** |
| **Rodrigo Ramírez** | **COO - Operations** | **+56 9 3699 4401** |
| **Claudio Jiménez** | **CTO - Hacker**     | **+56 9 5416 7800** |
| **Benjamín Olguín** | **CMO - Growth**     | **+56 9 5921 8689** |
| **Mauro Castillo**  | **CFO - Finance**    | **+56 9 5423 5979** |

---

## Contenido

1. [Resumen del proyecto en una página \[10%\]](#1-resumen-del-proyecto-en-una-página)
2. [Cliente - Actores (usuarios) del sistema \[10%\]](#2-cliente---actores-usuarios-del-sistema)
3. [Historias de usuario del sistema \[30%\]](#3-historias-de-usuario-del-sistema)
4. [Descripción de la tecnología a usar y Atributos de calidad del sistema \[20%\]](#4-descripción-de-la-tecnología-a-usar-y-atributos-de-calidad-del-sistema)
5. [Propuesta de prototipo mínimo viable \[30%\]](#5-propuesta-de-prototipo-mínimo-viable)
6. [Rúbrica de evaluación](#6-rúbrica-de-evaluación)

---

## 1. Resumen del proyecto en una página

Actualmente, la industria inmobiliaria enfrenta una brecha de eficiencia crítica en su embudo de ventas. De un volumen promedio de 2.000 leads anuales captados por proyecto, se estima que apenas 240 prospectos (un 12%) cumplen realmente con los estándares de precalificación bancaria. Esta disparidad genera que los equipos comerciales inviertan el 88% de su tiempo procesando perfiles no viables, lo que deriva en procesos manuales ineficientes, altos costos operativos y una saturación del equipo de ventas en gestiones que no llegan a concretar la compra.

Frente a esta problemática, proponemos **RutaHogar**, una plataforma de precalificación y priorización inteligente de leads inmobiliarios, enfocada en la etapa inicial del proceso comercial, antes de la evaluación bancaria formal. La solución busca optimizar el flujo de conversión mediante un sistema que clasifique automáticamente a los potenciales compradores según su viabilidad financiera preliminar.

RutaHogar está diseñado para empresas inmobiliarias del sector medio, las cuales procesan volúmenes cercanos a los 2.000 leads anuales y requieren optimizar su capacidad de respuesta. Los usuarios finales son los ejecutivos comerciales, quienes recibirán una cartera priorizada y con alta probabilidad de cierre, y los potenciales compradores (leads), los cuales serán precalificados y recibirán un plan paso a paso para ser sujeto apto del crédito hipotecario. Para mitigar la resistencia a entregar datos financieros sensibles, la plataforma ofrece como valor agregado un diagnóstico de salud financiera inmediato y gratuito, transformando la entrega de información en una herramienta de autogestión y claridad para el usuario, sin vinculación con la inmobiliaria.

La implementación de esta solución es vital para mejorar la rentabilidad operativa de la inmobiliaria, permitiendo que la fuerza de ventas se concentre exclusivamente en los 240 leads anuales que realmente tienen posibilidades de compra. Para el usuario final, resolver esta situación es fundamental para obtener una orientación temprana sobre su capacidad de endeudamiento, evitando el desgaste emocional y burocrático de iniciar trámites de crédito hipotecario destinados al rechazo por falta de preparación financiera.

La principal innovación de RutaHogar radica en su motor de scoring paramétrico que interviene en la etapa inicial del contacto, antes de cualquier evaluación formal. A diferencia de los CRM tradicionales, nuestra propuesta incluye un módulo de 'incubación' automatizado: mediante un algoritmo de recomendación, el sistema genera planes de acción personalizados (como metas de ahorro y reducción de pasivos) para aquellos leads que no califican inicialmente. Esto permite transformar prospectos no aptos en compradores sujetos de crédito en el corto plazo, permitiendo a la inmobiliaria recuperar un segmento del mercado que hoy se considera perdido.

---

## 2. Cliente - Actores (usuarios) del sistema

### Cliente

| **Nombre**                               | Ellison De Moraes Caram |
| :--------------------------------------- | :---------------------- |
| **Experiencia en el área a desarrollar** | Gerente de Inteligencia de Negocios con más de 11 años de experiencia en el rubro inmobiliario, especializado en análisis comercial, gestión de datos y optimización de procesos de negocio. |
| **E-mail**                               | ecaram@ei.cl |

### Actores/Usuarios

| **Rol**                                    | Lead |
| :----------------------------------------- | :--- |
| **Descripción**                            | **Descripción:** Persona interesada en adquirir una vivienda que desconoce si cumple los requisitos bancarios.<br>**Funciones:** Ingresar sus datos financieros/laborales en la plataforma, visualizar su diagnóstico de "salud financiera" y seguir las recomendaciones del módulo de incubación. |
| **Manejo de tecnologías**                  | En promedio intermedio (3) |
| **Conocimiento del contexto del proyecto** | En promedio bajo (1) |
| **Justificación**                          | Al ser su primera vivienda, desconoce los requisitos bancarios y la jerga financiera (contexto bajo). Sin embargo, al ser un usuario digital promedio (probablemente joven), posee un manejo fluido de aplicaciones web y móviles a nivel de usuario general. |

| **Rol**                                    | Ejecutivo Comercial |
| :----------------------------------------- | :------------------ |
| **Descripción**                            | **Descripción:** Profesional de ventas de la inmobiliaria encargado de cerrar los negocios.<br>**Funciones:** Visualizar el *dashboard* con la cartera de leads precalificados (en estado verde/apto), filtrar prospectos según su *scoring* y contactar a los clientes viables. |
| **Manejo de tecnologías**                  | Nivel medio-alto (4) |
| **Conocimiento del contexto del proyecto** | Nivel alto (5) |
| **Justificación**                          | Su conocimiento del contexto es experto, ya que domina el flujo de venta inmobiliaria y los requisitos de crédito. Su manejo tecnológico es medio-alto, dado que en su día a día ya opera con herramientas digitales de gestión comercial (CRMs, ERPs, bases de datos). |

---

## 3. Historias de usuario del sistema

**Funcionalidades relevantes:**

1. **Flujo de pre-evaluación financiera guiada**: El usuario ingresa sus datos financieros básicos a través de un formulario web intuitivo y paso a paso, sin necesidad de subir documentación pesada en esta etapa inicial.
2. **Motor de Scoring Predictivo en Tiempo Real**: Algoritmo que procesa los datos declarados para emitir un dictamen inmediato sobre la viabilidad crediticia del prospecto.
3. **Generador de Planes de Mejora Personalizados**: Para leads no aptos, el sistema crea una guía paso a paso con acciones concretas para mejorar su perfil y alcanzar la capacidad de compra en el futuro.
4. **Sistema de Derivación e Integración Comercial**: Sincronización de prospectos calificados directamente con el flujo de ventas de la inmobiliaria para una gestión priorizada.
5. **Asignación Dinámica de leads**: Los perfiles con alto puntaje de scoring son asignados automáticamente al equipo ejecutivo, mientras que los leads en desarrollo son derivados a un flujo de nutrición y preparación automatizada.

| ID    | C | Descripción |
| :---: | :-: | :---------- |
| HDU 1 | I | **Como** interesado en comprar mi primera vivienda, **necesito** recibir una evaluación inmediata de mi situación financiera al ingresar mis datos, **para poder** saber si soy sujeto de crédito antes de invertir tiempo visitando salas de ventas. |
| HDU 3 | I | **Como** ejecutivo de ventas de la inmobiliaria, **necesito** recibir solo prospectos que ya hayan sido precalificados con un score alto, **para poder** enfocar mi tiempo de gestión en clientes que realmente tienen posibilidades de cerrar la compra. |
| HDU 4 | I | **Como** interesado en compra una vivienda, **necesito** que el sistema genere un plan de mejora personalizado, **para poder** alcanzar la capacidad de compra del proyecto inmobiliario. |
| HDU 2 | E | **Como** persona interesada en comprar mi primera vivienda, **necesito** completar un formulario web guiado o en una aplicación con mis datos financieros y una alta facilidad de uso, **para poder** iniciar mi evaluación de viabilidad crediticia sin necesidad de subir documentos ni hablar con un ejecutivo. |
| HDU 5 | D | **Como** funcionario de una inmobiliaria, **necesito** ingresar usuarios calificados desde la aplicación al CRM de la inmobiliaria, **para poder** darles una gestión priorizada dentro del flujo de venta del proyecto inmobiliario. |
| HDU 6 | D | **Como** persona interesada en comprar una vivienda, **necesito** visualizar cómo cambios en factores económicos como tasas de interés o UF podrían afectar mi capacidad de compra, **para poder** comprender los riesgos financieros asociados a un crédito hipotecario antes de iniciar el proceso de compra. |

---

## 4. Descripción de la tecnología a usar y Atributos de calidad del sistema

Para el desarrollo del MVP de RutaHogar se propone una arquitectura web simple, separando frontend, backend y persistencia de datos. En el frontend se utilizará **React**, ya que permite construir interfaces dinámicas de forma rápida, como formularios guiados, visualización del score y recomendaciones personalizadas. Se prefiere React sobre Angular para el MVP debido a su mayor rapidez para prototipar.

En el backend se utilizará **FastAPI con Python**, encargado de recibir los datos enviados desde el formulario, aplicar las reglas de scoring, clasificar al lead y generar recomendaciones. Se escoge Python porque facilita el trabajo con reglas de negocio, procesamiento de datos y una eventual evolución hacia modelos más avanzados de análisis.

Para la base de datos se utilizará **Supabase con PostgreSQL**, donde se almacenarán los datos mínimos necesarios del usuario, sus respuestas, el score obtenido, la clasificación asignada y la fecha de evaluación. Supabase permite acelerar el desarrollo del MVP al entregar una base PostgreSQL administrada, panel de gestión y posibilidades futuras de autenticación.

Finalmente, se utilizarán herramientas de IA generativa como **Claude Code** como apoyo al desarrollo, documentación y generación de componentes, sin formar parte crítica de la arquitectura del sistema.

| Atributo de calidad  | Meta SMART | Mecanismo de verificación |
| :------------------- | :--------- | :------------------------ |
| Facilidad de uso | Al menos el 80% de los usuarios deben completar el formulario sin ayuda en menos de 10 min. | Prueba con usuarios, midiendo tiempo y completitud y cantidad de errores o abandonos. |
| Tiempo de respuesta | El sistema debe calcular y mostrar el score en menos de 60 segundos después de enviar el formulario. | Pruebas funcionales midiendo tiempo desde el envío hasta la visualización del resultado. |
| Seguridad | El sistema no debe solicitar credenciales bancarias ni documentos sensibles en el MVP, y debe aplicar HTTPS y control básico de acceso. | Revisión de formulario, checklist de seguridad y validación de configuración del despliegue. |
| Privacidad de los datos | El sistema debe recolectar sólo los datos mínimos necesarios, como el ingreso, deuda, ahorro y tiempo de contrato. | Revisión del modelo de datos y verificación de que no se almacenen campos innecesarios. |
| Escalabilidad | El MVP debe soportar al menos 100 evaluaciones de usuarios sin pérdida de datos ni errores funcionales. | Prueba de carga simulada de registros de Supabase. |
| Uptime | Durante el periodo de prueba del MVP, el sistema debe estar disponible al menos el 95% del tiempo. | Monitoreo del servicio desplegado, registrando las caídas. |
| Mantenibilidad | El código debe estar organizado en módulos separados (por ejemplo: frontend, backend y reglas de scoring). | Revisión del repositorio y estructura del proyecto. |
| Trazabilidad | Cada evaluación debe guardar la fecha, score y clasificación generada. | Consulta directa en la base de datos para verificar la persistencia correcta. |

---

## 5. Propuesta de prototipo mínimo viable

Se realizaron ajustes en las Historias de Usuario 1, 2 y 3 con el objetivo de alinear mejor el MVP de RutaHogar con una propuesta más atractiva tanto al usuario final como al ejecutivo comercial.

En la **HU1**, se modificó el nombre desde una formulación más general asociada al flujo de preevaluación financiera guiada hacia **"Ingreso de datos financieros"**. Este cambio permite delimitar mejor el alcance de la historia, separando claramente la etapa de captura de datos de la etapa posterior de scoring. La estructura de la historia se simplificó para enfocarse en que el lead pueda completar un formulario web guiado con sus datos financieros básicos, sin necesidad de hablar con un ejecutivo. También se ajustó la cantidad de Story Points, pasando de **8 SP a 5 SP**, ya que esta historia ahora se concentra principalmente en el ingreso, validación y registro de datos, dejando el procesamiento inteligente para la HU3. En cuanto a los criterios de aceptación, se mantuvieron los elementos esenciales relacionados con completar el formulario, detectar inconsistencias en los datos declarados y exigir consentimiento explícito. Además, se agregó un nuevo criterio relacionado con el **complemento de renta**, permitiendo que el usuario indique si realizará el proceso junto a otra persona e ingrese datos financieros básicos del complementario para incorporarlos al análisis preliminar. Este ajuste mejora la cercanía de la historia con la realidad hipotecaria, donde complementar renta puede ser relevante para aumentar la capacidad de compra.

En la **HU2**, se mantuvo el nombre **"Priorización de Leads Calificados"**, pero se modificó de forma importante su enfoque. Antes estaba centrada principalmente en que los leads con score alto generarán una notificación o entrada automática al CRM. En la nueva versión, la historia se orienta a que el ejecutivo comercial pueda visualizar una cartera de leads precalificados y priorizados con apoyo de inteligencia artificial. Esto permite que el ejecutivo no solo vea qué leads tienen mayor prioridad, sino también que comprenda rápidamente el contexto financiero general de cada prospecto. La cantidad de Story Points aumentó de **3 SP a 5 SP**, porque ahora la historia incorpora mayor funcionalidad: panel de visualización, filtros por clasificación, orientación de acción comercial y apoyo inteligente para interpretar los leads. Los criterios de aceptación fueron ajustados para que los leads con clasificación "Alto" aparezcan priorizados en el panel comercial, que el sistema entregue un resumen con indicadores financieros generales, que el ejecutivo pueda filtrar leads Alto, Medio o Bajo, y que además reciba una sugerencia de acción como "contactar pronto" o "mantener en seguimiento". Con este cambio, la HU2 deja de depender de una integración CRM inmediata y se vuelve más factible para el MVP, manteniendo el valor comercial de la priorización.

En la **HU3**, se cambió el nombre desde **"Generación de Scoring"** hacia **"Generación de scoring híbrido con explicación inteligente"**. Este cambio refleja mejor la nueva orientación del sistema, donde el scoring no se presenta solo como una fórmula o clasificación automática, sino como un resultado acompañado de una explicación personalizada generada con apoyo de inteligencia artificial. La cantidad de Story Points se mantuvo en **8 SP**, ya que sigue siendo una historia central y de alta importancia para el MVP. La estructura de la HU3 fue ampliada para incorporar un enfoque híbrido: el sistema calcula el score y clasifica al usuario en niveles claros como Alto, Medio o Bajo, pero además utiliza un agente IA o módulo de IA para explicar de manera detallada los factores principales que influyeron en el resultado. A los criterios existentes de tiempo máximo de respuesta, clasificación y explicación del score, se agregaron nuevos criterios relacionados con la advertencia de alcance del sistema, la trazabilidad histórica del resultado y la derivación del usuario según su clasificación. De esta forma, si el usuario no cumple con el puntaje mínimo, puede ser redirigido a un flujo de educación financiera, mientras que si obtiene un score alto, el ejecutivo comercial puede ser notificado. Este cambio fortalece el valor del sistema, ya que permite mostrar una preevaluación más profesional, personalizada y comprensible, sin afirmar que RutaHogar reemplaza una evaluación bancaria formal.

---

### HdU 1 - Ingreso de datos financieros

| | |
| :--- | :--- |
| **Categoría Historia** | Importante |
| **Puntos de Historia** | 5 |
| **Descripción** | **Como** lead (interesado en comprar una vivienda), **quiero** completar un formulario web guiado, con mis datos financieros y una alta facilidad de uso, **para** iniciar mi evaluación de viabilidad crediticia, sin tener que hablar con un ejecutivo. |

**Criterios de Aceptación:**

**E1 - Completar formulario exitosamente:**
**Dado** que el usuario ingresa a la plataforma RutaHogar por primera vez, **cuando** completa todos los campos requeridos (ingresos, deudas, tipo de contrato, edad) y acepta el consentimiento de datos, **entonces** el sistema registra su perfil y lo redirige automáticamente al resultado de su evaluación.

**E2 - Inconsistencia en datos declarados:**
**Dado** que el usuario está completando el formulario, **cuando** declara un monto de deudas mensual mayor a sus ingresos declarados, **entonces** el sistema muestra una advertencia visual en el campo correspondiente antes de permitir continuar al siguiente paso.

**E3 - Consentimiento de datos:**
**Dado** que el servicio recibe una solicitud de precalificación donde el indicador de consentimiento de tratamiento de datos es falso o inexistente, **Cuando** el middleware de seguridad evalúe la integridad de la petición antes de iniciar el cálculo, **Entonces** el sistema debe abortar inmediatamente la transacción devolviendo un error de validación, bloqueando cualquier intento de persistencia en la base de datos y registrando el evento de rechazo exclusivamente como tráfico anónimo.

**E4 - Complemento de renta:**
**Dado** que la evaluación de viabilidad crediticia del lead se configura bajo la modalidad de evaluación conjunta (renta complementada), **Cuando** el sistema estructure la petición de precalificación, **Entonces** debe instanciar un requerimiento de datos asociado, exigiendo obligatoriamente los ingresos y deudas del co-deudor para poder ejecutar el cálculo del scoring consolidado.

---

### HdU 2 - Priorización de Leads Calificados

| | |
| :--- | :--- |
| **Categoría Historia** | Esencial |
| **Puntos de Historia** | 5 |
| **Descripción** | **Como** ejecutivo de ventas de la inmobiliaria, **quiero** visualizar una cartera de leads precalificados y priorizados con apoyo de inteligencia artificial, **para** enfocar mi tiempo en los prospectos con mayor probabilidad de avanzar en el proceso de compra y comprender rápidamente el contexto financiero de cada lead. |

**Criterios de Aceptación:**

**E1 - Priorización de los leads con score alto:**
**Dado** que el sistema realizó el scoring financiero de los usuarios, **cuando** identifique leads con clasificación "Alto", **entonces** estos deben aparecer priorizados en el panel del ejecutivo comercial.

**E2 - Resumen con justificación de los leads con score alto:**
**Dado** que un usuario finaliza su scoring con éxito, **cuando** el puntaje es calificado como score alto, **entonces** el sistema provee un resumen con indicadores financieros que justifican el puntaje obtenido.

**E3 - Filtro por nivel de prioridad:**
**Dado** que el ejecutivo comercial accede al panel de leads, **cuando** seleccione filtros por clasificación o prioridad, **entonces** el sistema debe permitir visualizar el perfil de los leads Alto, Medio o Bajo de forma diferenciada.

**E4 - Orientación de acción comercial:**
**Dado** que el ejecutivo visualiza un lead priorizado, **cuando** revise su perfil, **entonces** el sistema debe sugerir una acción general, como "contactar pronto" o "mantener en seguimiento", según el nivel de preparación del lead.

---

### HdU 3 - Generación de scoring híbrido con explicación inteligente

| | |
| :--- | :--- |
| **Categoría Historia** | Importante |
| **Puntos de Historia** | 8 |
| **Descripción** | **Como** persona interesada en comprar una vivienda, **quiero** recibir una evaluación financiera inmediata mediante un scoring híbrido con explicación inteligente, **para** entender mi nivel de preparación, los principales factores que influyen en mi resultado y los próximos pasos recomendados antes de iniciar una evaluación formal. |

**Criterios de Aceptación:**

**E1 - Visualización del resultado de evaluación:**
**Dado** que el Usuario completó el formulario correspondiente, **cuando** este envía sus datos para ser procesados, **entonces** el sistema debe mostrar el resultado del scoring en un tiempo máximo de 60 segundos tras finalizar el formulario.

**E2 - Clasificación de Leads según su Score:**
**Dado** que el sistema de RutaHogar recibió los datos del Usuario, **cuando** se realiza la calificación, **entonces** el resultado debe clasificar al usuario en niveles de prioridad claros (ej: Alto, Medio, Bajo).

**E3 - Explicación mediante IA:**
**Dado** que el sistema presenta el resultado de la evaluación, **cuando** el usuario visualiza su clasificación crediticia, **entonces** el sistema, por medio de un agente IA, debe mostrar una explicación detallada de los factores principales que influyeron en el score.

**E4 - Advertencia de alcance del sistema:**
**Dado** que el usuario visualiza su resultado, **cuando** se muestra la explicación del scoring, **entonces** el sistema debe indicar que el scoring es orientativo y no reemplaza una evaluación bancaria formal.

**E5 - Trazabilidad de los resultados:**
**Dado** que el cálculo del scoring es exitoso, **cuando** el sistema guarda la evaluación, **entonces** debe persistir un registro inmutable que contenga el timestamp, score numérico, clasificación, snapshot de entrada, versión del algoritmo y desglose de componentes con sus explicaciones; asegurando que este historial no pueda ser modificado posteriormente y que, si el guardado falla, se bloquee la visualización del resultado mostrando un error con opción de reintento.

**E6 - Notificación ejecutivo comercial:**
**Dado** que un Lead (usuario interesado en comprar una vivienda) hace envío de sus datos, **cuando** el sistema lo evalúa e identifica que no cumple con el puntaje mínimo para calificar, **entonces** debe ser redirigido automáticamente a un flujo de educación financiera sin intervención del ejecutivo; y en el caso contrario de un score alto, se notifica al ejecutivo comercial.

---

### HdU 4 - Generador de Planes de Mejora

| | |
| :--- | :--- |
| **Categoría Historia** | Importante |
| **Puntos de Historia** | 8 |
| **Descripción** | **Como** interesado en comprar una vivienda, **quiero** que el sistema genere un plan de mejora personalizado, **para** alcanzar la capacidad de compra del proyecto inmobiliario. |

**Criterios de Aceptación:**

**E1 - Plan Personalizado:**
**Dado** un usuario interesado en comprar una vivienda, **cuando** el usuario ingresa sus datos para el scoring y no cumple las condiciones para comprar el proyecto inmobiliario (no es un lead apto), **entonces** el sistema debe crear un plan personalizado paso a paso en base a sus datos ingresados para mejorar su capacidad de compra a futuro.

**E2 - Análisis dinámico de la capacidad de compra:**
**Dado** que el usuario interesado ya ha ingresado sus datos en la plataforma, **cuando** este recién ingresa sus datos o cuando los actualice, **entonces** el sistema debe realizar el análisis de la capacidad de compra actualizada del usuario y actualizar el estado de este en el sistema.

**E3 - Validar la capacidad de compra del usuario y la necesidad de un plan de mejora:**
**Dado** un usuario interesado en comprar una vivienda, **cuando** éste ingrese los datos necesarios para su Scoring, **entonces** el sistema debe validar su capacidad de comprar y determinar si es necesario un plan de mejora o no.

**E4 - Recomendaciones orientativas:**
**Dado** que el usuario recibió su score, **cuando** el sistema identifique oportunidades de mejora, **entonces** debe mostrar recomendaciones orientativas relacionadas con ahorro, deuda, continuidad laboral, plazo de compra u objetivo inmobiliario.

---

### HdU 5 - Sistema de Derivación e Integración Comercial

| | |
| :--- | :--- |
| **Categoría Historia** | Deseable |
| **Puntos de Historia** | 5 |
| **Descripción** | **Como** funcionario de una inmobiliaria, **quiero** ingresar usuarios calificados desde la aplicación al CRM de la inmobiliaria, **para** poder darles una gestión priorizada dentro del flujo de venta del proyecto inmobiliario. |
| **Detalle** | Fila **opcional** que describe la forma particular de lograr la historia no trivial. |

**Criterios de Aceptación:**

**E1.** **Dado** un usuario ingresado en la aplicación, **cuando** este termine de ser calificado y sea calificado como de alta prioridad, **entonces** el sistema debe replicar, inmediatamente o eventualmente, la información del usuario dentro del CRM.

**E2.** **Dado** un usuario ingresado en la aplicación, **cuando** ocurra una actualización en el score de nuestro usuario y este pase a estar calificado o se aumente su prioridad, **entonces** el sistema debe mandar una request al CRM para que actualice los datos del usuario.

**E3.** **Dado** un usuario ingresado en la aplicación, **cuando** este termine de ser calificado y no se considere de alta prioridad, **entonces** la aplicación no debe enviar su perfil al CRM y solo debe manejar sus datos dentro de la aplicación hasta que su calificación se actualice.

---

### HdU 6 - Algoritmo de estrés

| | |
| :--- | :--- |
| **Categoría Historia** | Deseable |
| **Puntos de Historia** | 5 |
| **Descripción** | **Como** persona interesada en comprar una vivienda, **quiero** visualizar cómo cambios en factores económicos como tasas de interés o UF podrían afectar mi capacidad de compra, **para** comprender los riesgos financieros asociados a un crédito hipotecario antes de iniciar el proceso de compra. |

**Criterios de Aceptación:**

**E1 - Mostrar variación en capacidad de compra:**
**Dado** que el usuario ya recibió el resultado de su evaluación financiera, **cuando** seleccione visualizar escenarios económicos alternativos, **entonces** el sistema debe mostrar cómo variaría su capacidad de compra ante un aumento simulado del interés.

**E2 - Mostrar variación en capacidad de financiamiento:**
**Dado** que el usuario visualiza el resultado de su evaluación, **cuando** el sistema procese una variación simulada de la UF, **entonces** debe mostrar un cambio estimado en la capacidad de financiamiento del usuario.

**E3 - Mostrar diferencias entre escenario actual y simulados:**
**Dado** que el usuario está revisando la simulación financiera, **cuando** el sistema presente los distintos escenarios, **entonces** debe mostrar de forma clara la diferencia entre el escenario actual y los escenarios simulados.

---

## 6. Rúbrica de evaluación

| **Indicadores** | **0 pts** | **1 pto** | **2 pts** | **3 pts** | **4 pts** |
| :-------------- | :-------- | :-------- | :-------- | :-------- | :-------- |
| **Resume el proyecto (en 1 página) (10%)** | No realiza el resumen del proyecto | No se entiende de qué se trata el proyecto | Describe en forma incompleta el proyecto | Resume parcialmente problema, clientes y usuarios, propuesta de innovación | Resume adecuadamente problema, clientes y usuarios, propuesta de innovación |
| **Identificación de los actores del sistema (10%)** | No identifica al cliente y no describe a los usuarios del sistema | Se limita a nombrar los actores | Describe incompletamente los actores | Describe adecuadamente los actores | Fundamenta la experticia del usuario o cliente como aporte el desarrollo del proyecto |
| **Identificación de funcionalidades y definición de historias de usuario (30%)** | No identifica funcionalidades ni define historias de usuario | Identifica funcionalidades incorrectas o no relacionadas con el problema | Identifica parcialmente las funcionalidades y presenta historias de usuario con errores de formulación | Identifica funcionalidades relevantes y define un conjunto de historias con algunos errores de coherencia o priorización | Identifica claramente las funcionalidades del sistema y define un conjunto completo, coherente y priorizado de historias de usuario, correctamente formuladas y alineadas al problema |
| **Descripción de la tecnología y atributos de calidad del sistema (20%)** — Se debe justificar la tecnología seleccionada, explicitar los criterios utilizados para su elección y detallar al menos dos atributos de calidad con sus respectivas metas, las cuales deben ser medibles y verificables (por ejemplo: seguridad, facilidad de uso, tiempo de respuesta, disponibilidad, entre otros). | No describe la tecnología con la que trabajará y no menciona atributos de calidad | Nombra tecnología sin justificar y nombra atributos de calidad, sin entrar en detalle | Hay una descripción y leve justificación de la tecnología a usar al igual que para los atributos de calidad | Describe y justifica la tecnología **pero no** detalla al menos 2 atributos de calidad (o viceversa) | Describe y justifica la tecnología que se piensa usar **y al menos 2 atributos de calidad** con metas claras y verificables |
| **Definición del prototipo mínimo viable (PMV), incluyendo historias de usuario y criterios de aceptación (30%)** | No define historias ni criterios de aceptación asociadas al PMV | Define historias incorrectas o no relacionadas con el PMV | Define historias, pero sin criterios de aceptación claros o completos | Define historias adecuadas y criterios de aceptación, pero con errores de claridad o estructura | Define correctamente las historias del PMV y sus criterios de aceptación utilizando la estructura Dado–Cuando–Entonces, siendo específicos, medibles y verificables, evitando ambigüedad o descripciones generales. |
