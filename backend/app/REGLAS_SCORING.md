# REGLAS DE SCORING

> Documento de apoyo para **Spike 1 / Criterio 2**: definir reglas para comparar capacidad de compra, valor de vivienda, ahorro, deuda y ajustes mínimos.  
> Base técnica revisada: `scoring.py` versión `1.0.1`.

---

## 1. Objetivo del documento

Este documento traduce la lógica implementada en `scoring.py` a reglas estructuradas en texto, de forma que el equipo pueda explicar, validar y ajustar el scoring de RutaHogar sin depender directamente del código.

El foco del criterio 2 es definir reglas para comparar:

- capacidad de compra;
- valor de vivienda;
- ahorro disponible;
- deuda mensual;
- dividendo estimado;
- ajustes mínimos para acercar al usuario a una alternativa viable.

El scoring debe entenderse como una **preevaluación referencial**, no como aprobación bancaria, tasación, recomendación financiera formal ni consulta oficial a una entidad reguladora.

---

## 2. Fuentes externas revisadas

### 2.1 CMF / ChileAtiende: simulador hipotecario

ChileAtiende informa que la Comisión para el Mercado Financiero dispone de un simulador para conocer información sobre créditos hipotecarios, tasas, dividendos y seguros asociados. La simulación se basa en una modalidad comparable: mutuo hipotecario no endosable en UF y a tasa fija.

**Uso para RutaHogar:**  
Sirve como respaldo para que las simulaciones sean referenciales, comparables y transparentes, especialmente cuando se evalúan monto, plazo, tasa y dividendo.

Fuente: https://www.chileatiende.gob.cl/fichas/2611-simulador-de-creditos-hipotecarios

---

### 2.2 CMF Educa: capacidad de pago

CMF Educa indica que, para evaluar un crédito hipotecario, las instituciones solicitan información para comprobar la capacidad de pago del solicitante. También señala que varias instituciones recomiendan que el futuro dividendo sea como máximo equivalente al **25% del ingreso total** del solicitante o del solicitante junto con su aval/complemento.

**Uso para RutaHogar:**  
El código actual usa una regla equivalente a exigir que el ingreso sea al menos **4 veces el dividendo**, lo que corresponde a un dividendo máximo del 25% del ingreso.

Fuente: https://www.cmfchile.cl/educa/621/w3-article-27502.html  
Fuente: https://www.cmfchile.cl/educa/621/w3-article-49522.html

---

### 2.3 BancoEstado: financiamiento y dividendo

BancoEstado informa que el monto financiable depende del valor de tasación/precio de venta, capacidad de ahorro para el pie y capacidad de pago mensual del dividendo. También indica que se puede acceder hasta el **90% del menor valor entre tasación y precio de venta**, considerando que el dividendo no debe superar el **25% de la renta líquida o ingreso familiar** en caso de complementar renta, sujeto a evaluación comercial y de riesgo.

**Uso para RutaHogar:**  
Respalda dos reglas del scoring:
- evaluar si el usuario tiene al menos un pie mínimo cercano al 10%;
- validar que el dividendo sea sostenible en relación con el ingreso.

Fuente: https://www.bancoestado.cl/content/bancoestado-public/cl/es/home/home/productos-/creditos/creditos-hipotecarios.html  
Fuente: https://start.bancoestado.cl/content/bancoestado-public/cl/es/home/home/centro-de-ayuda/productos/creditos---bancoestado-personas/hipotecario---dudas-transversales---bancoestado-personas/-cuanto-dinero-puedo-pedir-prestado-para-adquirir-una-vivienda-.html

---

### 2.4 FOGAES / apoyo a vivienda nueva

FOGAES informa que el Programa de Apoyo a la Vivienda Nueva contempla una rebaja de **0,60% / 60 puntos base** en la tasa de interés del crédito hipotecario y que el financiamiento no debe superar el **90% del valor de la vivienda**, entre otros requisitos.

**Uso para RutaHogar:**  
FOGAES no debe aumentar automáticamente el score, porque depende de requisitos externos. Debe aparecer como ruta o recomendación referencial cuando el objetivo del usuario pueda calzar con condiciones de vivienda nueva y financiamiento.

Fuente: https://fogaes.cl/sitio/requisitos/

---

## 3. Datos de entrada usados por el scoring

El archivo `scoring.py` usa los siguientes datos principales:

| Variable | Descripción |
|---|---|
| `ingreso_mensual` | Ingreso mensual declarado por el usuario. |
| `deuda_mensual` | Deuda mensual actual declarada. |
| `ahorro_disponible` | Ahorro disponible para pie, gastos iniciales o margen. |
| `tipo_contrato` | Tipo de contrato laboral del usuario. |
| `continuidad_laboral` | Antigüedad o continuidad laboral declarada. |
| `morosidad_actual` | Situación de morosidad declarada. |
| `antiguedad_morosidad` | Antigüedad de la morosidad, si existe. |
| `comuna_objetivo` | Comuna donde el usuario desea comprar. |
| `property_value_clp` | Valor de propiedad declarado en CLP. |
| `dividendo_estimado` | Dividendo mensual esperado o estimado. |
| `complemento_renta` | Indica si el usuario complementará renta con otra persona. |
| `ingreso_mensual_complementario` | Ingreso mensual del complemento de renta. |
| `deuda_mensual_complementario` | Deuda mensual del complemento. |
| `morosidad_complementario` | Morosidad declarada del complemento. |
| `tipo_contrato_complementario` | Tipo de contrato del complemento. |
| `continuidad_laboral_complementario` | Continuidad laboral del complemento. |
| `relacion_complementario` | Relación del complemento con el usuario. |
| `complemento_tarjetas_activas` | Cantidad de tarjetas activas del complemento. |

---

## 4. Parámetros base del scoring actual

| Parámetro | Valor actual |
|---|---:|
| Versión del algoritmo | `1.0.1` |
| Puntaje inicial | `50` |
| Puntaje mínimo | `0` |
| Puntaje máximo | `100` |
| Clasificación Alto | `score >= 70` |
| Clasificación Medio | `40 <= score < 70` |
| Clasificación Bajo | `score < 40` |
| Valor UF usado en código | `$40.695 CLP` |
| Pie mínimo usado | `10% del valor objetivo` |
| Pie recomendado usado | `20% del valor objetivo` |
| Dividendo prudente usado | ingreso mensual debe ser al menos 4 veces el dividendo |

---

## 5. Regla general de capacidad de pago

### 5.1 Regla implementada

El scoring evalúa si el ingreso mensual disponible cubre al menos **4 veces el dividendo estimado**.

```text
ingreso_para_capacidad >= 4 * dividendo_estimado
```

Esto equivale a:

```text
dividendo_estimado <= 25% del ingreso_para_capacidad
```

### 5.2 Resultado en el score

| Condición | Efecto |
|---|---:|
| Ingreso cubre al menos 4 veces el dividendo | `+25` puntos |
| Ingreso no cubre 4 veces el dividendo | `-15` puntos |

### 5.3 Indicadores generados

Si cumple:

```text
Ingreso consistente con el dividendo estimado
```

Si no cumple:

```text
El dividendo objetivo podría exigir más holgura financiera.
```

### 5.4 Recomendación asociada

```text
Revisar el dividendo estimado o ajustar el objetivo de compra.
Ajustar el dividendo objetivo para mantener una carga mensual más sostenible.
```

### 5.5 Interpretación para RutaHogar

Esta regla es central para comparar capacidad de compra. Un usuario puede tener buen ingreso absoluto, pero si el dividendo esperado representa una proporción excesiva del ingreso, el objetivo se considera menos sostenible.

---

## 6. Regla de deuda mensual

### 6.1 Regla implementada

El scoring penaliza cuando la deuda mensual supera el **40% del ingreso mensual**.

```text
deuda_mensual > 0.4 * ingreso_mensual
```

### 6.2 Resultado en el score

| Condición | Efecto |
|---|---:|
| Deuda mensual mayor al 40% del ingreso | `-20` puntos |
| Deuda dentro del umbral | No suma puntos, pero genera indicador positivo |

### 6.3 Indicadores generados

Si la deuda está dentro del umbral:

```text
Carga de deuda aceptable
```

Si supera el umbral:

```text
La carga mensual de deudas podría afectar la evaluación.
```

### 6.4 Recomendación asociada

```text
Reducir compromisos mensuales antes de avanzar.
```

### 6.5 Interpretación para RutaHogar

Esta regla permite distinguir entre un usuario con capacidad de pago real y un usuario que, aunque tenga ingresos, ya tiene compromisos mensuales elevados. Para efectos de comparación, la deuda reduce la holgura disponible para asumir un dividendo.

---

## 7. Regla de valor de vivienda o proyecto declarado

### 7.1 Fuente explícita del objetivo

El valor de vivienda se usa sólo para la vista de ajuste de proyecto, beneficios y proyecciones que lo requieran. Nunca se infiere a partir de `comuna_objetivo`.

1. Si existe `property_value_clp`, se respeta ese valor declarado.
2. Si existe `property_value_uf`, se convierte con `uf_value_clp` del mismo snapshot BCCh validado que usa el scoring.
3. Los pares genéricos `property_value` y `property_value_unit` siguen la misma conversión explícita.
4. Si no hay valor o proyecto declarado, el objetivo queda sin valor (`unknown`); la comuna es sólo una preferencia geográfica.

### 7.2 Conversión UF declarada

```text
precio_objetivo_clp = property_value_uf * market_snapshot.uf_value_clp
```

No existe `PRECIOS_REFERENCIA_UF` ni una tabla equivalente como respaldo financiero. El usuario debe declarar el valor o seleccionar un proyecto con valor explícito.

### 7.3 Interpretación

El valor declarado no altera artificialmente el score inicial de capacidad. Permite contextualizar proyecto, pie y beneficios, siempre con la misma UF BCCh de la evaluación reproducible.

---

## 8. Regla de ahorro y pie disponible

### 8.1 Cálculo de pie mínimo y recomendado

Cuando existe valor objetivo, el scoring calcula:

```text
pie_minimo_clp = precio_objetivo_clp * 0.10
pie_recomendado_clp = precio_objetivo_clp * 0.20
```

### 8.2 Regla implementada

| Condición | Efecto |
|---|---:|
| Ahorro disponible >= 20% del valor objetivo | `+15` puntos |
| Ahorro disponible >= 10% y < 20% | `+5` puntos |
| Ahorro disponible < 10% | `-20` puntos |

### 8.3 Indicadores generados

Si ahorro >= 20%:

```text
Ahorro consistente con el objetivo declarado
```

Si ahorro >= 10%:

```text
Ahorro inicial disponible
```

Si ahorro < 10%:

```text
El ahorro disponible podría ser bajo para el objetivo de compra declarado.
```

### 8.4 Recomendaciones asociadas

```text
Aumentar ahorro para acercarse a una posición más sólida.
Aumentar ahorro o evaluar una alternativa de compra más gradual.
```

### 8.5 Interpretación para RutaHogar

Esta regla sirve para comparar si el ahorro actual permite acercarse al valor de vivienda objetivo. La plataforma puede explicar tres escenarios:

- **Listo en ahorro:** tiene al menos 20%.
- **Cercano:** tiene al menos 10%, pero aún falta fortalecer.
- **Insuficiente:** tiene menos de 10% y debe ajustar ahorro u objetivo.

---

## 9. Ausencia de valor de vivienda declarado

Cuando no se declaró un valor ni se seleccionó un proyecto con precio explícito, RutaHogar no fabrica un precio objetivo. Las métricas que requieren ese valor se mantienen sin objetivo y se solicita declararlo para una comparación de proyecto o beneficio.

La comuna objetivo puede conservarse como preferencia de búsqueda, pero cambiarla por sí sola no cambia el objetivo financiero.

---

## 10. Regla de contrato laboral

### 10.1 Contrato indefinido

| Condición | Efecto |
|---|---:|
| `tipo_contrato == "indefinido"` | `+10` puntos |

Indicador:

```text
Contrato indefinido favorable para una evaluación formal
```

---

### 10.2 Trabajador independiente

Si el usuario es independiente y tiene continuidad entre 1 y 3 años o más de 3 años, no se penaliza directamente.

Indicador/recomendación:

```text
Ingreso independiente con continuidad declarada
Mantener respaldos consistentes de ingresos independientes.
```

Si el usuario es independiente pero no tiene continuidad suficiente:

| Condición | Efecto |
|---|---:|
| Independiente con continuidad limitada | `-5` puntos |

Riesgo:

```text
Los ingresos independientes pueden requerir mayor respaldo de continuidad.
```

---

### 10.3 Contrato a plazo fijo

| Condición | Efecto |
|---|---:|
| `tipo_contrato == "plazo_fijo"` | `-18` puntos |

Riesgo:

```text
El contrato a plazo fijo puede dificultar una evaluación hipotecaria formal.
```

---

### 10.4 Honorarios o ingresos variables

| Condición | Efecto |
|---|---:|
| `tipo_contrato == "honorarios_variable"` | `-10` puntos |

Riesgo:

```text
Los ingresos por honorarios o variables pueden requerir mayor respaldo.
```

---

## 11. Regla de continuidad laboral

| Condición | Efecto |
|---|---:|
| Menos de 6 meses | `-15` puntos |
| Entre 6 y 12 meses | `-8` puntos |
| Más de 3 años | `+5` puntos |

### 11.1 Riesgos generados

Menos de 6 meses:

```text
La continuidad laboral declarada podría requerir mayor consolidación.
```

Entre 6 y 12 meses:

```text
La continuidad laboral aún podría ser un punto a fortalecer.
```

Más de 3 años:

```text
Continuidad laboral estable
```

---

## 12. Regla de morosidad

### 12.1 Morosidad declarada

Si el usuario declara morosidad:

| Antigüedad | Efecto |
|---|---:|
| Menos de 3 meses | `-35` puntos |
| 3 a 12 meses | `-35` puntos |
| Otra antigüedad | `-25` puntos |

Además, el componente `historial_crediticio` registra `-30`.

Riesgo:

```text
La morosidad declarada es un riesgo relevante para avanzar.
```

Recomendación:

```text
Regularizar o aclarar pagos pendientes antes de continuar.
```

---

### 12.2 Morosidad desconocida

Si el usuario indica que no sabe si tiene morosidad:

| Condición | Efecto |
|---|---:|
| `morosidad_actual == "no_lo_se"` | `-12` puntos |

Riesgo:

```text
Existe incertidumbre sobre la situación de pagos actual.
```

Recomendación:

```text
Revisar tu situación financiera antes de avanzar.
```

---

## 13. Regla de complemento de renta

### 13.1 Cuándo el complemento suma a la capacidad

El ingreso del complemento solo se suma a la capacidad de pago si cumple todas estas condiciones:

```text
complemento_renta == True
datos del complemento completos
morosidad_complementario == "no"
relacion_complementario no es "amigo" ni "otro"
```

Cuando cumple:

```text
ingreso_para_capacidad = ingreso_mensual + ingreso_complementario
```

Cuando no cumple:

```text
ingreso_para_capacidad = ingreso_mensual
```

### 13.2 Datos mínimos del complemento

Para considerar completo al complemento, el código exige:

- ingreso;
- deuda;
- morosidad;
- tipo de contrato;
- continuidad laboral;
- relación con el usuario.

Si faltan datos:

| Condición | Efecto |
|---|---:|
| Complemento incompleto | `-5` puntos |

Riesgo:

```text
Falta información detallada del co-deudor para evaluar el riesgo.
```

---

### 13.3 Relación débil

El código considera relaciones débiles:

```text
amigo
otro
```

| Condición | Efecto |
|---|---:|
| Relación débil | `-5` puntos |

Riesgo:

```text
La relación declarada para complementar renta podría requerir mayor respaldo.
```

---

### 13.4 Morosidad del complemento

| Condición | Efecto |
|---|---:|
| Complemento con morosidad | `-20` puntos |

Riesgo:

```text
La persona complementaria declara morosidad, por lo que no mejora esta preevaluación.
```

---

### 13.5 Deuda del complemento

| Condición | Efecto |
|---|---:|
| Deuda del complemento > 40% de su ingreso | `-15` puntos |

Riesgo:

```text
El co-deudor tiene una carga de deuda elevada en relación a sus ingresos.
```

---

### 13.6 Contrato del complemento

| Condición | Efecto |
|---|---:|
| Independiente con continuidad limitada | `-5` puntos |
| Plazo fijo | `-10` puntos |
| Honorarios o variable | `-6` puntos |

---

### 13.7 Continuidad del complemento

| Condición | Efecto |
|---|---:|
| Menos de 6 meses | `-10` puntos |
| Entre 6 y 12 meses | `-5` puntos |

---

### 13.8 Tarjetas activas del complemento

| Condición | Efecto |
|---|---:|
| 5 o más tarjetas activas | `-15` puntos |
| 3 o 4 tarjetas activas | `-8` puntos |

---

### 13.9 Perfil limpio del complemento

El complemento se considera de perfil limpio cuando:

```text
morosidad == "no"
deuda <= 40% de su ingreso
contrato == "indefinido"
continuidad entre 1 y 3 años o más de 3 años
relación no débil
```

| Condición | Efecto |
|---|---:|
| Perfil limpio | `+10` puntos |
| Perfil no limpio, pero con datos | `+3` en componente `perfil_compra` |

Además, si el complemento es válido para capacidad y no tiene deuda alta:

| Condición | Efecto |
|---|---:|
| Complemento válido para capacidad | `+3` puntos |

---

## 14. Clasificación final

Después de aplicar todas las reglas, el score se limita entre 0 y 100.

```text
score = clamp(score, 0, 100)
```

Luego se clasifica:

| Score | Clasificación |
|---:|---|
| 70 a 100 | Alto |
| 40 a 69.9 | Medio |
| 0 a 39.9 | Bajo |

### 14.1 Recomendaciones por clasificación

Si la clasificación es Bajo:

```text
Revisar expectativas y plan de ahorro; considerar propiedades con menor dividendo.
```

Si la clasificación es Medio:

```text
Mejorar ahorro o reducir deuda para pasar a clasificación Alto.
```

---

## 15. Componentes internos del scoring

El código agrupa parte de la evaluación en componentes:

| Componente | Qué representa |
|---|---|
| `carga_financiera` | Relación entre ingreso, dividendo y deuda. |
| `estabilidad_laboral` | Tipo de contrato y continuidad. |
| `historial_crediticio` | Morosidad o incertidumbre de pagos. |
| `pie_disponible` | Ahorro disponible frente al valor objetivo. |
| `perfil_compra` | Condiciones asociadas al complemento de renta. |

Estos componentes ayudan a explicar el score, pero no todos tienen el mismo peso formal. En esta versión del código, el score se calcula por sumas y restas sobre una base de 50 puntos.

---

## 16. Reglas específicas para comparar capacidad de compra, valor de vivienda, ahorro y deuda

### 16.1 Comparación principal

Para comparar si un objetivo inmobiliario es viable, RutaHogar debería evaluar al menos estas variables:

```text
valor_objetivo_clp
pie_minimo_clp = valor_objetivo_clp * 10%
pie_recomendado_clp = valor_objetivo_clp * 20%
dividendo_estimado
ingreso_para_capacidad
deuda_mensual
```

### 16.2 Regla de capacidad frente al dividendo

```text
dividendo_estimado <= ingreso_para_capacidad * 0.25
```

Interpretación:

| Resultado | Lectura |
|---|---|
| Cumple | Dividendo dentro de umbral prudente. |
| No cumple | El objetivo requiere ajustar dividendo, plazo, pie o valor de vivienda. |

---

### 16.3 Regla de deuda frente al ingreso

```text
deuda_mensual <= ingreso_mensual * 0.40
```

Interpretación:

| Resultado | Lectura |
|---|---|
| Cumple | Deuda actual aceptable para avanzar. |
| No cumple | Conviene reducir compromisos antes de asumir dividendo. |

---

### 16.4 Regla de ahorro frente al valor objetivo

```text
ahorro_disponible >= valor_objetivo_clp * 0.20
```

Interpretación:

| Resultado | Lectura |
|---|---|
| Ahorro >= 20% | Posición sólida para el objetivo. |
| Ahorro entre 10% y 20% | Posición inicial, requiere fortalecimiento. |
| Ahorro < 10% | Brecha relevante de pie. |

---

## 17. Ajustes mínimos sugeridos

El código actual genera recomendaciones, pero no calcula explícitamente ajustes mínimos. Para cumplir mejor el criterio 2, se recomienda estructurar los ajustes mínimos desde las mismas reglas existentes.

### 17.1 Ajuste mínimo por dividendo alto

Si:

```text
dividendo_estimado > ingreso_para_capacidad * 0.25
```

Entonces calcular:

```text
dividendo_maximo_sugerido = ingreso_para_capacidad * 0.25
brecha_dividendo = dividendo_estimado - dividendo_maximo_sugerido
```

Texto sugerido:

```text
Tu dividendo estimado supera el umbral prudente. Para acercarte, podrías reducir el valor objetivo, aumentar el pie, ampliar plazo referencial o buscar una alternativa con menor dividendo.
```

---

### 17.2 Ajuste mínimo por deuda alta

Si:

```text
deuda_mensual > ingreso_mensual * 0.40
```

Entonces calcular:

```text
deuda_maxima_sugerida = ingreso_mensual * 0.40
brecha_deuda = deuda_mensual - deuda_maxima_sugerida
```

Texto sugerido:

```text
Tu deuda mensual supera el umbral usado por RutaHogar. Reducir compromisos mensuales podría mejorar tu capacidad de compra.
```

---

### 17.3 Ajuste mínimo por ahorro bajo

Si:

```text
ahorro_disponible < pie_minimo_clp
```

Entonces calcular:

```text
brecha_pie_minimo = pie_minimo_clp - ahorro_disponible
```

Si:

```text
ahorro_disponible < pie_recomendado_clp
```

Entonces calcular:

```text
brecha_pie_recomendado = pie_recomendado_clp - ahorro_disponible
```

Texto sugerido:

```text
Tu ahorro actual no alcanza el pie mínimo/recomendado para este objetivo. Puedes aumentar ahorro o evaluar una propiedad de menor valor.
```

---

### 17.4 Ajuste mínimo por valor de vivienda

Para estimar un valor máximo referencial de vivienda según ahorro:

```text
valor_maximo_por_pie_minimo = ahorro_disponible / 0.10
valor_maximo_por_pie_recomendado = ahorro_disponible / 0.20
```

Para estimar un objetivo más prudente, usar el menor o presentar ambos escenarios:

```text
Escenario flexible: valor máximo con pie mínimo del 10%
Escenario prudente: valor máximo con pie recomendado del 20%
```

---

### 17.5 Ajuste mínimo por capacidad de dividendo

El código no incluye una fórmula hipotecaria para transformar ingreso en valor máximo financiable. Sin embargo, sí puede estimar un dividendo máximo prudente:

```text
dividendo_maximo_prudente = ingreso_para_capacidad * 0.25
```

Para transformar eso en valor de vivienda, sería necesario incorporar un simulador de crédito con tasa, plazo y seguros, o apoyarse en parámetros referenciales. En esta versión, lo correcto es declarar que el cálculo es referencial y no reemplaza simulación bancaria.

---

## 18. Estados sugeridos para compatibilidad inmobiliaria

A partir de las reglas actuales, se pueden definir estados explicables:

### 18.1 Compatible

Un usuario puede considerarse compatible cuando cumple:

```text
dividendo_estimado <= 25% del ingreso_para_capacidad
deuda_mensual <= 40% del ingreso_mensual
ahorro_disponible >= 10% del valor objetivo
sin morosidad declarada relevante
```

Idealmente, si el ahorro llega al 20%, se considera una posición más sólida.

---

### 18.2 Cercano

Un usuario puede considerarse cercano cuando tiene una brecha corregible:

```text
ahorro entre 10% y 20%
o dividendo levemente sobre 25%
o deuda mensual levemente sobre 40%
o continuidad laboral aún en consolidación
```

Este estado debería activar plan de mejora y simulación de alternativas.

---

### 18.3 Requiere ajuste

Un usuario puede considerarse en estado requiere ajuste cuando:

```text
ahorro < 10% del objetivo
o dividendo muy superior al 25% del ingreso
o deuda mensual muy superior al 40%
o existe morosidad declarada reciente
o contrato/continuidad no respaldan estabilidad suficiente
```

Este estado debería priorizar educación financiera, plan de mejora y alternativas más accesibles.

---

## 19. Reglas de beneficios habitacionales

Según la investigación, beneficios como FOGAES o subsidios pueden ser relevantes, pero no deben aumentar automáticamente el score.

### 19.1 Regla recomendada

```text
beneficio_habitacional = recomendación contextual
no = incremento directo de score
```

### 19.2 Cuándo sugerirlo

Se puede sugerir revisión de beneficios cuando:

- el usuario busca vivienda nueva;
- el valor objetivo está dentro de límites informados por programas vigentes;
- el financiamiento requerido no supera el 90%;
- la brecha principal se relaciona con tasa, dividendo o pie;
- existe contenido educativo aplicable.

### 19.3 Texto recomendado

```text
Podrías revisar si existe una ruta de beneficio habitacional aplicable a tu caso. Esta sugerencia es referencial y no garantiza aprobación.
```

---

## 20. Reglas que deberían mostrarse al usuario y reglas solo internas

### 20.1 Mostrar al usuario

- Resultado general: Alto, Medio o Bajo.
- Factor principal que afecta el resultado.
- Brecha de ahorro, deuda o dividendo.
- Recomendaciones accionables.
- Advertencia de que es una preevaluación referencial.
- Sugerencias educativas.

### 20.2 Reservar para ejecutivo o equipo interno

- Versión del algoritmo.
- Puntaje exacto de componentes internos.
- Guía comercial.
- Resumen ejecutivo.
- Reglas internas de penalización.
- Códigos de riesgo.
- Priorización comercial.

---

## 21. Hallazgos y brechas del código actual

### 21.1 Fortalezas

- Usa una regla prudente de dividendo: ingreso al menos 4 veces el dividendo.
- Considera deuda mensual.
- Considera ahorro versus valor objetivo.
- Diferencia pie mínimo y recomendado.
- Evalúa estabilidad laboral.
- Evalúa morosidad.
- Evalúa complemento de renta con condiciones.
- Genera recomendaciones y plan de mejora.

### 21.2 Brechas detectadas

- El valor UF está fijo en el código y debería ser configurable.
- No se infiere un precio de vivienda por comuna: los proyectos o valores declarados son explícitos y la conversión UF/CLP usa el snapshot BCCh validado.
- No calcula explícitamente brechas numéricas de ajuste mínimo.
- No calcula valor máximo financiable desde tasa/plazo/seguros.
- No separa completamente reglas para usuario y reglas comerciales.
- Algunos componentes internos no suman de manera totalmente ponderada; se usa una lógica de sumas/restas desde base 50.
- La clasificación final puede ocultar la razón principal si no se muestra el factor determinante.

---

## 22. Recomendaciones para formalizar la HU de simulación y compatibilidad

Para cumplir mejor el criterio 2, se recomienda que RutaHogar formalice estos indicadores:

| Indicador | Fórmula |
|---|---|
| Ratio dividendo-ingreso | `dividendo_estimado / ingreso_para_capacidad` |
| Ratio deuda-ingreso | `deuda_mensual / ingreso_mensual` |
| Ratio carga total | `(deuda_mensual + dividendo_estimado) / ingreso_mensual` |
| Pie mínimo | `valor_objetivo_clp * 0.10` |
| Pie recomendado | `valor_objetivo_clp * 0.20` |
| Brecha pie mínimo | `max(0, pie_minimo_clp - ahorro_disponible)` |
| Brecha pie recomendado | `max(0, pie_recomendado_clp - ahorro_disponible)` |
| Dividendo máximo prudente | `ingreso_para_capacidad * 0.25` |
| Brecha dividendo | `max(0, dividendo_estimado - dividendo_maximo_prudente)` |
| Deuda máxima sugerida | `ingreso_mensual * 0.40` |
| Brecha deuda | `max(0, deuda_mensual - deuda_maxima_sugerida)` |
| Valor máximo por pie mínimo | `ahorro_disponible / 0.10` |
| Valor máximo por pie recomendado | `ahorro_disponible / 0.20` |

---

## 23. Regla estructurada final para comparar alternativas

Para cada alternativa o proyecto inmobiliario, RutaHogar debería comparar:

```text
1. Valor de la vivienda
2. Pie mínimo y pie recomendado
3. Ahorro disponible del usuario
4. Dividendo estimado
5. Dividendo máximo prudente
6. Deuda mensual actual
7. Morosidad declarada
8. Estabilidad laboral
9. Complemento de renta válido
```

Luego clasificar la alternativa:

| Estado | Criterio |
|---|---|
| Compatible | Cumple dividendo, deuda, ahorro mínimo y no presenta riesgos críticos. |
| Cercano | Tiene brechas corregibles de ahorro, deuda, dividendo o continuidad. |
| Requiere ajuste | Presenta brecha fuerte de pie, dividendo, deuda o morosidad relevante. |

---

## 24. Conclusión

El scoring actual ya contiene reglas útiles para comparar capacidad de compra, valor de vivienda, ahorro y deuda. Su base principal es:

```text
Score inicial 50
+/- capacidad de pago
+/- deuda
+/- pie disponible
+/- estabilidad laboral
+/- morosidad
+/- complemento de renta
```

Para la Spike 1, el criterio 2 puede cerrarse documentando estas reglas y agregando, como mejora conceptual, los cálculos de brechas mínimas:

```text
brecha de pie
brecha de dividendo
brecha de deuda
valor máximo por ahorro
dividendo máximo prudente
```

Con eso, RutaHogar puede pasar de un scoring numérico a una explicación accionable: no solo decir si el usuario está en Alto, Medio o Bajo, sino también explicar qué ajuste mínimo lo acerca a una vivienda viable.
