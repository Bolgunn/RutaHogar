# HU 15 - Dashboard de conversión y tiempos del proceso comercial

> **🗓 Planificada - Sprint 2.** Tasas de conversión, tiempos del ciclo de venta y nivel de engagement en un dashboard gerencial, con filtros y comparación histórica.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Deseable |
| **Puntos de Historia** | 8 |
| **Actor** | Administrador inmobiliario · Ejecutivo comercial |
| **Sprint** | Sprint 2 |
| **Estado** | 🗓 Planificada |

---

## Historia de usuario

> **Como** administrador inmobiliario o ejecutivo comercial, **quiero** visualizar las tasas de conversión, los tiempos del proceso y el nivel de engagement, **para** evaluar el desempeño de los leads, medir el interés real en los proyectos e identificar oportunidades de mejora en la tracción comercial.

---

## Criterios de aceptación

### E1 - Embudo de conversión, engagement e impacto del plan de mejora

**Dado** que existe un universo total de leads y un dashboard gerencial, **cuando** el usuario revise el gráfico de embudo, **entonces** debe visualizar la tasa de captura (cuántos postulan frente al total), la conversión general entre etapas, y específicamente cuántos leads pasaron de 'En plan de mejora' a 'Venta Cerrada'.

### E2 - Tiempos del ciclo de venta

**Dado** que quiero ver el impacto de la herramienta, **cuando** reviso el KPI de tiempo, **entonces** el sistema debe visualizar el promedio de días desde la preevaluación hasta la “Venta Cerrada”, además de los tiempos intermedios entre estados comerciales.

### E3 - Filtros y segmentación del embudo

**Dado** que existen leads con diferentes características, **cuando** el usuario aplique filtros al dashboard, **entonces** debe poder desglosar las métricas de engagement y conversión por proyecto, capacidad de compra, prioridad y afinidad.

### E4 - Evolución y comparación histórica

**Dado** que quiero medir cómo han evolucionado las métricas en el tiempo (semana a semana, mes a mes, año a año), **cuando** ingresó a la pestaña de evaluaciones históricas, **entonces** se deben desplegar gráficos mostrando cómo han cambiado el interés (engagement), las tasas de conversión y los tiempos desde que se usa la aplicación.

## Notas

- Depende de que exista un estado de venta cerrada, que hoy no se modela: es una brecha a resolver antes de implementar.
