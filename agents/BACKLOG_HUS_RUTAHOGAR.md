# Backlog actualizado — RutaHogar

Este documento resume las HUs vigentes del proyecto según el PDF actualizado `HUs para Sprint 1 (2).pdf`.

> Nota: el PDF aún contiene algunas menciones a “RutaHogar”. En la documentación activa deben entenderse como **RutaHogar**.

---

## Sprint 1 — Total: 60 SP

### Spike 1 — Investigación financiera, scoring, educación financiera y criterios de priorización comercial

**Puntos:** 13 SP  
**Objetivo:** Reducir incertidumbre funcional para fortalecer scoring, plan de mejora, simulaciones de compatibilidad, academia financiera y matching lead-proyecto.

**Criterios principales:**

- E1: investigar parámetros financieros para scoring y plan de mejora.
- E2: definir criterios para simulaciones de compatibilidad.
- E3: investigar material para educación financiera contextual.
- E4: definir criterios para matching lead-proyecto.
- E5: documentar insumos para las HUs del Sprint 1.

---

### HU4 — Generación de plan de mejora personalizado

**Categoría:** Importante  
**Puntos:** 8 SP  
**Descripción:** Como lead en etapa de preparación, quiero recibir un plan de mejora personalizado con recomendaciones, metas de deuda y ahorro, para saber qué acciones debo realizar para acercarme a mi objetivo inmobiliario.

**Criterios de aceptación:**

- E1: generar un plan personalizado paso a paso basado en los datos del usuario.
- E2: generar recomendaciones sobre ahorro, deuda, continuidad laboral, plazo u objetivo inmobiliario, priorizadas por impacto e indicando beneficio esperado.
- E3: crear un plan de pagos de deudas con monto objetivo, prioridad y plazo estimado; si hay más de una deuda, ordenarlas por impacto, monto o urgencia.
- E4: crear un plan de ahorro para el pie con meta mensual y plazo estimado.

---

### HU5 — Academia financiera contextual

**Categoría:** Esencial  
**Puntos:** 8 SP  
**Descripción:** Como usuario interesado en comprar una vivienda, quiero acceder a contenido educativo sobre crédito hipotecario, pie, subsidios, tasas y tipos de vivienda, para comprender mejor mis opciones y prepararme antes de comprar.

**Criterios de aceptación:**

- E1: mostrar artículos o cápsulas organizadas por tema.
- E2: sugerir contenido educativo según el bloqueador financiero identificado.
- E3: ofrecer enlaces contextuales cuando aparezcan conceptos como pie, tasa, subsidio o plazo.

---

### HU6 — Simulación de compatibilidad y alternativas accesibles

**Categoría:** Esencial  
**Puntos:** 8 SP  
**Descripción:** Como usuario interesado en comprar una vivienda, quiero simular distintos objetivos, valores, comunas, plazos y configuraciones, para descubrir qué alternativas son compatibles con mi perfil actual.

**Criterios de aceptación:**

- E1: simular valores de vivienda y mostrar si cada escenario es compatible con la capacidad de compra.
- E2: proponer alternativas accesibles cuando el usuario no califica para su objetivo declarado.
- E3: mostrar el valor máximo estimado de vivienda que podría financiar.
- E4: no exceder 30 segundos de respuesta en la simulación.

---

### HU7 — Gestión del catálogo de proyectos inmobiliarios

**Categoría:** Esencial  
**Puntos:** 5 SP  
**Descripción:** Como administrador inmobiliario, quiero registrar y mantener un catálogo de proyectos inmobiliarios y vincularlos con ejecutivos, para que el sistema pueda recomendar leads según los proyectos realmente disponibles.

**Criterios de aceptación:**

- E1: crear proyectos con nombre, inmobiliaria, comuna, tipo, rango de precio y estado.
- E2: validar campos obligatorios y precios consistentes.
- E3: vincular proyectos con ejecutivos.
- E4: excluir proyectos agotados del matching.

---

### HU8 — Detector de beneficios habitacionales aplicables

**Categoría:** Importante  
**Puntos:** 5 SP  
**Descripción:** Como lead interesado en comprar una vivienda, quiero saber si mi perfil podría ser compatible con beneficios habitacionales como subsidios, FOGAES u otros apoyos, para entender caminos alternativos de financiamiento sin asumir que ya estoy aprobado.

**Criterios de aceptación:**

- E1: indicar posible ruta de beneficio habitacional aplicable.
- E2: aclarar que la sugerencia es referencial y no garantiza aprobación.
- E3: considerar valor, tipo de vivienda y condición nueva/usada.
- E4: enlazar a Academia cuando exista contenido relacionado.

---

### HU9 — Cotización orientativa por proyecto

**Categoría:** Esencial  
**Puntos:** 5 SP  
**Descripción:** Como lead, quiero seleccionar un proyecto inmobiliario y revisar si es compatible con mi situación financiera, para saber si puedo avanzar, si estoy cerca o si debo ajustar mi objetivo.

**Criterios de aceptación:**

- E1: mostrar compatibilidad financiera del proyecto seleccionado.
- E2: si no es compatible, indicar brecha principal: ingreso, pie, deuda o plazo.
- E3: si es cercano, indicar ajuste mínimo sugerido.
- E4: si es compatible, permitir guardar interés o solicitar contacto.

---

### HU10 — Matching lead-proyecto para ejecutivos comerciales

**Categoría:** Importante  
**Puntos:** 5 SP  
**Descripción:** Como ejecutivo comercial, quiero que el sistema sugiera leads compatibles con los proyectos que vendo, para priorizar prospectos con mayor probabilidad de conversión.

**Criterios de aceptación:**

- E1: mostrar usuarios compatibles ordenados por afinidad y capacidad de compra.
- E2: permitir recomendar un usuario con capacidad suficiente aunque su clasificación general no sea Alta.
- E3: mostrar al ejecutivo capacidad estimada, pie, clasificación y bloqueador principal.
- E4: detectar oportunidades reorientables cuando un usuario puede comprar un proyecto distinto a su objetivo declarado.

---

### HU11 — Checklist de preparación bancaria

**Categoría:** Importante  
**Puntos:** 3 SP  
**Descripción:** Como lead, quiero ver una lista simple de antecedentes que debería preparar antes de una evaluación bancaria formal, para entender qué información podría necesitar más adelante.

**Criterios de aceptación:**

- E1: mostrar checklist referencial de preparación bancaria.
- E2: destacar antecedentes relacionados con el factor determinante del usuario.
- E3: aclarar que no debe subir documentos sensibles en esta etapa.
- E4: enlazar a Academia cuando exista contenido relacionado.

---

## Sprint 2 — Total visible: 62 SP

### Spike 2 — Validación técnica de privacidad, roles, trazabilidad, documentos e integraciones externas

**Puntos:** 13 SP  
**Objetivo:** Reducir incertidumbre técnica sobre privacidad, roles, auditoría, historial versionado, documentos, reportes, dossier, CRM y CMF.

**Criterios principales:**

- E1: privacidad y consentimiento.
- E2: permisos por rol.
- E3: auditoría e historial versionado.
- E4: carga y resguardo de documentos.
- E5: integración comercial y servicios externos.
- E6: reportes y exportación de dossier.
- E7: documentación de decisiones técnicas.

---

### HU12 — Sistema de Derivación e Integración Comercial

**Categoría:** Importante  
**Puntos:** 8 SP  
**Descripción:** Como funcionario de una inmobiliaria, quiero ingresar usuarios calificados desde la aplicación al CRM de la inmobiliaria para poder darles una gestión priorizada dentro del flujo de venta del proyecto inmobiliario.

**Criterios de aceptación:**

- E1: derivar automáticamente leads de alta prioridad al CRM.
- E2: actualizar el lead en el CRM ante cambios de score o prioridad.
- E3: retener internamente leads no prioritarios.

---

### HU13 — Seguimiento mensual del plan de mejora

**Categoría:** Importante  
**Puntos:** 8 SP  
**Descripción:** Como lead con un plan de mejora activo, quiero registrar mi avance financiero mensual y actualizar mi situación, para saber si estoy avanzando correctamente hacia mi objetivo inmobiliario.

**Criterios de aceptación:**

- E1: registrar avance mensual.
- E2: proyectar elegibilidad o acercamiento al objetivo.
- E3: actualizar estado del plan: No iniciado, En progreso, Completado o Requiere ajuste.
- E4: recalcular scoring según hitos financieros.
- E5: validar hitos financieros ingresados.

---

### HU14 — Visualización de mapa de accesibilidad inmobiliaria

**Categoría:** Opcional  
**Puntos:** 8 SP  
**Descripción:** Como usuario que completó su evaluación, quiero visualizar un mapa de la Región Metropolitana con sectores clasificados según mi capacidad financiera, para entender dónde podría comprar hoy y dónde estoy fuera de alcance.

**Criterios de aceptación:**

- E1: clasificar visualmente barrios como accesibles, cercanos o fuera de alcance.
- E2: mostrar razón principal del resultado.
- E3: mostrar mapa de calor con colores según accesibilidad.
- E4: explicar brechas de renta, ahorro o mejora financiera.

---

### HU15 — Evolución financiera del lead

**Categoría:** Deseable  
**Puntos:** 5 SP  
**Descripción:** Como ejecutivo comercial, quiero visualizar la evolución financiera de un lead, para detectar oportunidades de contacto y seguimiento comercial.

**Criterios de aceptación:**

- E1: mostrar historial de evaluaciones.
- E2: mostrar cambios en score, capacidad de compra o bloqueador principal.
- E3: identificar oportunidad de contacto cuando el lead mejora.
- E4: comparar evaluaciones y mostrar fortalezas/debilidades.

---

### HU16 — Dashboard de Tasas de Conversión de Ventas

**Categoría:** Deseable  
**Puntos:** 5 SP  
**Descripción:** Como administrador inmobiliario o ejecutivo comercial, quiero visualizar el embudo de ventas general, para medir si el ciclo de venta se está reduciendo a 6 meses.

**Criterios de aceptación:**

- E1: medir impacto del plan de mejora.
- E2: medir tiempo promedio entre preevaluación y venta cerrada.
- E3: visualizar gráficos de evolución en el tiempo.

---

### HU17 — Reportar leads inconsistentes o fraudulentos

**Categoría:** Deseable  
**Puntos:** 5 SP  
**Descripción:** Como ejecutivo comercial, quiero quitar del dashboard a usuarios fraudulentos o inconsistentes, para evitar posibles fraudes y pérdida de tiempo para los ejecutivos comerciales.

**Criterios de aceptación:**

- E1: detectar indicadores de inconsistencia.
- E2: mostrar alertas en dashboard.
- E3: reportar manualmente un lead sospechoso.
- E4: cambiar estado del lead reportado.
- E5: depurar vista principal del dashboard comercial.
- E6: notificar cambios de estado.
- E7: registrar auditoría.
- E8: prevenir eliminación irreversible.

---

### HU18 — Simulador de escenarios hipotecarios referenciales

**Categoría:** Importante  
**Puntos:** 5 SP  
**Descripción:** Como lead, quiero modificar variables como pie, plazo, valor de vivienda o tasa referencial, para entender cómo cambia mi dividendo estimado y mi compatibilidad financiera.

**Criterios de aceptación:**

- E1: recalcular dividendo referencial.
- E2: mostrar diferencia frente al escenario inicial.
- E3: advertir riesgo cuando el dividendo supera un umbral prudente.
- E4: aclarar que los resultados son referenciales.

---

### HU19 — Ranking de proyectos por brecha mínima

**Categoría:** Importante  
**Puntos:** 5 SP  
**Descripción:** Como lead, quiero ver proyectos alternativos ordenados según qué tan cerca están de mi capacidad actual, para encontrar opciones más realistas sin partir desde cero.

**Criterios de aceptación:**

- E1: ordenar proyectos por compatibilidad financiera.
- E2: mostrar brecha principal en proyectos no compatibles.
- E3: priorizar comuna alternativa indicada por el usuario.
- E4: comparar proyecto alternativo con objetivo inicial.

---

### HU20 — Pendiente de definir

**Puntos esperados:** 8 SP  
**Nota:** El PDF indica “Falta HU20 de 8 SP”. No inventar esta historia sin confirmación del equipo.

---

## Sprint 3 — Total visible: 46 SP

### HU21 — Visualización de mapa de accesibilidad inmobiliaria

**Categoría:** Opcional  
**Puntos:** 8 SP  
**Descripción:** Igual o muy similar a HU14. Requiere confirmación del equipo para evitar duplicidad.

**Nota:** En el PDF actualizado HU14 y HU21 tienen el mismo nombre, misma descripción y criterios muy similares. No fusionar ni eliminar sin confirmación.

---

### HU22 — Actualización dinámica del mapa de accesibilidad

**Categoría:** Opcional  
**Puntos:** 5 SP  
**Descripción:** Como usuario que modifica sus condiciones financieras o preferencias de compra, quiero que el mapa de accesibilidad se actualice automáticamente, para comparar cómo cambian mis opciones de vivienda según mi score, renta, plazo o tipo de vivienda.

**Criterios de aceptación:**

- E1: reevaluar mapa cuando se modifica score o renta.
- E2: actualizar por palancas como plazo, tipo de vivienda o condición de primera vivienda.

---

### HU23 — Configuración de parámetros de scoring

**Categoría:** Opcional  
**Puntos:** 5 SP  
**Descripción:** Como administrador inmobiliario, quiero modificar los parámetros utilizados por el motor de scoring, para adaptar los leads que aparecen a mis ejecutivos comerciales a lo que buscamos como organización.

**Criterios de aceptación:**

- E1: visualizar parámetros del motor.
- E2: modificar parámetros de forma autorizada.
- E3: aplicar nuevos parámetros en evaluaciones futuras.

---

### HU24 — Carga de documentos respaldatorios

**Categoría:** Deseable  
**Puntos:** 5 SP  
**Descripción:** Como ejecutivo, quiero que los usuarios precalificados suban comprobantes financieros a la plataforma, para poder validar la información declarada.

**Criterios de aceptación:**

- E1: aceptar PDF, JPG o PNG si cumplen reglas definidas.
- E2: almacenar documentos de forma segura y vinculada al perfil.
- E3: permitir visualización o descarga por ejecutivo autorizado.

---

### HU25 — Exportación de dossier para evaluación bancaria

**Categoría:** Opcional  
**Puntos:** 3 SP  
**Descripción:** Como ejecutivo comercial, quiero exportar un reporte consolidado con el perfil del lead y sus documentos, para agilizar una futura derivación a instituciones bancarias formales.

**Criterios de aceptación:**

- E1: generar expediente digital desde perfil del lead.
- E2: incluir detalle del score, perfil y documentos cargados.
- E3: presentar información limpia y estructurada.

---

### HU26 — Simulación avanzada de subsidios habitacionales

**Categoría:** Deseable  
**Puntos:** 5 SP  
**Descripción:** Como lead interesado, quiero simular de forma referencial el impacto de subsidios habitacionales en mi objetivo de compra, para entender si podrían acercarme a una alternativa más viable.

**Criterios de aceptación:**

- E1: estimar posible impacto en pie, dividendo o valor financiable.
- E2: indicar condiciones principales que debería cumplir.
- E3: aclarar que es referencial y no garantiza aprobación.
- E4: enlazar a Academia.

---

### HU27 — Revisión referencial de antecedentes declarados

**Categoría:** Deseable  
**Puntos:** 5 SP  
**Descripción:** Como ejecutivo comercial, quiero revisar de forma referencial los antecedentes financieros declarados por el lead, para identificar posibles riesgos antes de avanzar en una gestión comercial.

**Criterios de aceptación:**

- E1: generar resumen referencial basado en datos declarados.
- E2: clasificar señales de riesgo como Bajo, Medio, Alto o Crítico.
- E3: aclarar que no corresponde a consulta oficial a CMF.
- E4: solicitar completar información si no hay datos suficientes.

---

### HU28 — Estimador de gastos iniciales de compra

**Categoría:** Importante  
**Puntos:** 5 SP  
**Descripción:** Como lead, quiero estimar gastos iniciales asociados a la compra de una vivienda además del pie, para prepararme mejor antes de avanzar.

**Criterios de aceptación:**

- E1: mostrar gastos iniciales referenciales.
- E2: separarlos claramente del pie.
- E3: recalcular al cambiar valor de vivienda.
- E4: aclarar que los montos son referenciales.

---

### HU29 — Comparador de costo total referencial del crédito

**Categoría:** Importante  
**Puntos:** 5 SP  
**Descripción:** Como lead, quiero visualizar el costo referencial de un crédito bajo distintos plazos, para entender que reducir el dividendo mensual puede aumentar el costo total en el tiempo.

**Criterios de aceptación:**

- E1: mostrar dividendo referencial por plazo.
- E2: mostrar diferencia de carga mensual.
- E3: advertir que un plazo mayor puede aumentar el costo total.
- E4: aclarar que los resultados son referenciales.

---

### HU30 — Pendiente de definir

**Puntos esperados:** 4 SP  
**Nota:** El PDF indica “Falta HU30 4 SP”. No inventar esta historia sin confirmación del equipo.

---

## Requisitos no funcionales

El PDF indica que estos elementos deben tratarse como **requisitos no funcionales**, no como HUs independientes:

- Seguridad básica.
- Privacidad mínima.
- Roles y permisos.
- Auditoría técnica.
- Historial inmutable.
- Experiencia móvil lead.
- Dashboard móvil ejecutivo.
- Disponibilidad y escalabilidad.
- Manejo seguro de errores.
- Validación de entradas.

### Seguridad básica del sistema

**Objetivo:** proteger información financiera y reducir riesgos.

**Criterios base:**

- Validación de entradas.
- Protección contra errores inseguros.
- Prevención de inyección SQL mediante consultas parametrizadas, ORM o mecanismos equivalentes.
