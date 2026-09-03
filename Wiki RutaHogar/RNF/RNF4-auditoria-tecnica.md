# RNF 4 - Auditoría técnica y registro de eventos

> **Requisito no funcional.** Toda acción relevante sobre una evaluación queda registrada con responsable y fecha, y los eventos de la aplicación quedan disponibles para análisis, siempre respetando el consentimiento del usuario.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Deseable |
| **Puntos de Historia** | 3 |
| **Atributo de calidad** | Trazabilidad |
| **Índice** | [[../AtributosDeCalidad|Atributos de calidad]] |

---

## Enunciado

> **Como** administrador inmobiliario / desarrollador, **quiero** contar con un registro de las acciones realizadas sobre las evaluaciones y con los logs de eventos de la aplicación, **para** asegurar la trazabilidad y facilitar la revisión de cambios y el análisis de datos.

---

## Criterios de verificación

### E1 - Registro de acciones

**Dado** que una evaluación se crea, actualiza o revisa, **cuando** ocurre la acción, **entonces** el sistema debe registrar el evento correspondiente.

### E2 - Identificación del responsable

**Dado** que se registra una acción, **cuando** el administrador o desarrollador consulta la auditoría, **entonces** debe ver el usuario responsable y la fecha del evento.

### E3 - Historial cronológico

**Dado** que existen eventos asociados a una evaluación, **cuando** se despliega su historial, **entonces** deben mostrarse en orden cronológico.

### E4 - Visualización de los logs de eventos

**Dado** un administrador inmobiliario que quiere revisar los logs de eventos, **cuando** entra a la vista de logs, **entonces** debe poder visualizar los distintos registros.

### E5 - Protección de datos personales en el log

**Dado** que un usuario no ha aceptado el consentimiento de datos, **cuando** realiza la preevaluación o navega por la página, **entonces** sus eventos no deben aparecer en el log.

### E6 - Análisis y explicabilidad de los datos

**Dado** un administrador inmobiliario, **cuando** pide a la plataforma generar métricas o gráficos a partir de los datos recogidos por el log, **entonces** deben mostrarse los resultados junto con una explicación preliminar que facilite su comprensión.

---

## Notas

- Absorbe dos historias del backlog anterior: el registro de auditoría de evaluaciones y la visualización analítica del log de eventos. E4 a E6 vienen de esta última.
- E5 es una expresión directa de la salvaguarda S5: sin consentimiento no hay registro.
- Complementa [[RNF5-historial-inmutable|RNF 5]], que gobierna el versionado de las evaluaciones en sí.
