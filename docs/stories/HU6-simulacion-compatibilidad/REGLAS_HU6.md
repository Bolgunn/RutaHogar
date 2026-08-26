# Reglas HU6 — Simulacion de compatibilidad y alternativas accesibles

## Proposito de las reglas

Estas reglas describen como HU6 deberia evaluar escenarios de vivienda de forma referencial, usando el perfil financiero actual del usuario y proyectos fake o valores ingresados manualmente en UF o CLP.

HU6 no crea un scoring nuevo, no reemplaza el motor de scoring y no aprueba creditos. Su objetivo es traducir la evaluacion actual en una comparacion comprensible entre escenarios inmobiliarios.

## Variables utilizadas

Variables financieras del usuario:

- `ingreso_mensual`;
- `deuda_mensual`;
- `ahorro_disponible`;
- `dividendo_estimado`;
- `classification`;
- `bloqueador_principal` o factor determinante si existe;
- `complemento_renta`;
- `ingreso_mensual_complementario`;
- `deuda_mensual_complementario`.

Variables preliminares:

- `tipo_vivienda_preferida`;
- `comuna_objetivo`;
- `comunas_interes`;
- `plazo_compra`;
- `objetivo_inmobiliario`.

Variables del escenario:

- `valor_vivienda_uf`;
- `valor_vivienda_clp`;
- `unidad_valor_manual`, cuando el escenario se ingrese manualmente;
- `comuna`;
- `tipo_vivienda`;
- `estado`;
- `entrega_estimada`.

## Regla de unidades para escenarios manuales

Cuando el usuario ingrese un valor manual, HU6 debe aceptar UF o CLP y normalizar el escenario antes de evaluar compatibilidad:

```text
si unidad = UF:
  valor_vivienda_uf = valor_ingresado
  valor_vivienda_clp = valor_ingresado * valor_uf_clp

si unidad = CLP:
  valor_vivienda_clp = valor_ingresado
  valor_vivienda_uf = valor_ingresado / valor_uf_clp
```

La UF usada para convertir debe venir del valor vigente disponible para la simulacion. Si no existe un valor valido, debe usarse el valor referencial configurado por el proyecto y mantener el resultado como referencial.

## Regla para pie minimo y pie recomendado

Para cada escenario con valor de vivienda conocido:

```text
pie_minimo = valor_vivienda * 10%
pie_recomendado = valor_vivienda * 20%
brecha_pie_minimo = max(0, pie_minimo - ahorro_disponible)
brecha_pie_recomendado = max(0, pie_recomendado - ahorro_disponible)
```

Interpretacion:

- Si el ahorro cubre el pie recomendado, el escenario tiene buena holgura de pie.
- Si el ahorro cubre el pie minimo, el escenario puede ser evaluable, pero con menor holgura.
- Si el ahorro no cubre el pie minimo, la brecha principal puede ser pie.

Los porcentajes deben mantenerse alineados con las reglas vigentes de scoring y no redefinirse de forma aislada en implementacion.

Ejemplo obligatorio:

```text
valor_vivienda = 5000 UF
pie_minimo = 500 UF
pie_recomendado = 1000 UF
```

Nunca se debe mostrar el valor maximo referencial por ahorro como pie minimo del escenario.

## Regla de capacidad de dividendo

La capacidad mensual prudente debe basarse en la regla vigente del proyecto:

```text
dividendo_maximo_prudente = ingreso_para_capacidad * 25%
```

Equivalente:

```text
ingreso_para_capacidad >= 4 * dividendo_escenario
```

`ingreso_para_capacidad` debe considerar el ingreso del usuario y, solo si corresponde segun reglas vigentes, el complemento de renta valido.

Interpretacion:

- Si el dividendo del escenario es menor o igual al maximo prudente, la carga hipotecaria es compatible.
- Si lo supera levemente, el escenario puede ser Cercano.
- Si lo supera de forma relevante, el escenario Requiere ajuste.

HU6 no debe definir una formula avanzada de dividendo. Si la implementacion requiere calcular dividendos referenciales, debe usar reglas existentes o dejar clara la estimacion usada.

## Regla de deuda/carga financiera

La deuda mensual declarada reduce la holgura disponible. Como regla base:

```text
ratio_deuda = deuda_mensual / ingreso_mensual
```

Interpretacion:

- Si la deuda mensual supera el umbral vigente del scoring, la brecha principal puede ser deuda.
- Si deuda mensual mas dividendo del escenario deja poca holgura, el escenario no debe marcarse como plenamente Compatible.
- Si existe complemento de renta, su deuda debe considerarse solo si las reglas vigentes lo permiten.

No se deben inventar umbrales nuevos para deuda. El umbral de deuda/carga financiera debe venir de `docs/REGLAS_SCORING.md`: deuda mensual superior al 40% del ingreso mensual se considera carga alta.

## Clasificacion de escenario

### Compatible

Un escenario puede clasificarse como Compatible cuando:

- el ahorro cubre al menos el pie minimo;
- el dividendo estimado o referencial cabe dentro de la capacidad prudente;
- la deuda/carga financiera no aparece como bloqueador fuerte;
- no existe una brecha critica entre valor objetivo y capacidad estimada;
- el resultado se puede explicar sin contradecir la clasificacion financiera actual.

Mensaje sugerido:

```text
Este escenario parece compatible con tu perfil actual de forma referencial. Aun asi, una evaluacion bancaria formal podria solicitar antecedentes adicionales.
```

### Cercano

Un escenario puede clasificarse como Cercano cuando:

- el score general es alto o medio-alto;
- el ahorro esta cerca del pie minimo o alcanza el minimo pero no el recomendado;
- el dividendo esta cerca del limite prudente;
- existe una brecha moderada de pie, deuda o valor objetivo;
- el usuario podria acercarse con ahorro adicional, reduccion de deuda o ajuste de plazo/valor.

Mensaje sugerido:

```text
Este escenario esta cerca de tu capacidad actual, pero requiere ajustar una brecha antes de avanzar con mayor seguridad.
```

### Requiere ajuste

Un escenario debe clasificarse como Requiere ajuste cuando:

- falta mucho pie respecto del pie minimo;
- el dividendo supera claramente la capacidad prudente;
- la deuda/carga es critica;
- el valor de vivienda esta claramente fuera de capacidad;
- faltan datos criticos para evaluar con confianza.

Mensaje sugerido:

```text
Este escenario requiere ajustes importantes. Puedes revisar alternativas de menor valor, otra comuna, mas plazo de preparacion o un plan de ahorro/deuda.
```

## Regla para detectar brecha principal

La brecha principal debe escogerse segun el factor que mas impide compatibilidad:

| Brecha | Condicion orientativa |
| --- | --- |
| ingreso | El ingreso no sostiene el dividendo prudente del escenario. |
| pie | El ahorro disponible no alcanza el pie minimo o queda muy bajo frente al pie recomendado. |
| deuda | La deuda mensual actual reduce la holgura para asumir dividendo. |
| plazo/dividendo | El dividendo estimado es alto para el ingreso, pero podria mejorar con plazo o configuracion distinta. |
| valor objetivo | El valor de vivienda esta por sobre la capacidad maxima estimada. |

Si hay multiples brechas, priorizar la que tenga mayor impacto inmediato en la compatibilidad y mostrar las secundarias como observaciones.

Todo escenario debe entregar:

- estado;
- brecha principal;
- explicacion del estado;
- recomendacion breve.

## Regla para proponer alternativas accesibles

Cuando un escenario no sea Compatible:

1. Buscar proyectos disponibles para simulacion de menor valor.
2. Priorizar el mismo tipo de vivienda si existe preferencia declarada.
3. Priorizar la misma comuna si existen alternativas compatibles o cercanas.
4. Si no hay alternativas en la comuna objetivo, sugerir comunas cercanas disponibles en la fuente de proyectos.
5. Si el plazo de compra es corto, priorizar alternativas con menor brecha inmediata de pie/deuda/dividendo.
6. Si el plazo es mas largo, permitir alternativas Cercanas acompañadas de mensajes de ahorro o mejora gradual.
7. No presentar alternativas como garantizadas ni como cotizaciones.

Mensaje sugerido:

```text
Encontramos alternativas referenciales mas cercanas a tu capacidad actual. Puedes usarlas para ajustar tu objetivo antes de una evaluacion formal.
```

## Regla de ordenamiento de alternativas

Las alternativas accesibles deben ordenarse de forma estable y explicable, priorizando:

1. Estado de compatibilidad: Compatible antes que Cercano, y Cercano antes que Requiere ajuste.
2. Menor brecha principal en dinero o proporcion, especialmente brecha de pie y dividendo.
3. Coincidencia con comuna objetivo o comuna cercana documentada en el mock.
4. Coincidencia con tipo de vivienda preferido.
5. Menor valor de vivienda cuando dos alternativas tengan compatibilidad y preferencias similares.

Para brechas de pie, se debe distinguir entre:

- brecha de pie minimo, que impide alcanzar el minimo referencial;
- brecha de pie recomendado, que indica menor holgura pero no necesariamente impide evaluar el escenario.

Si dos alternativas tienen el mismo estado de compatibilidad, una alternativa que cubre el pie minimo debe ordenarse antes que otra que no lo cubre, aunque la segunda tenga una brecha absoluta menor frente al pie minimo. La brecha de pie recomendado se usa despues para comparar holgura entre alternativas que ya cubren el minimo.

El ordenamiento no debe ocultar alternativas de mayor compatibilidad solo porque no coincidan con una preferencia. La compatibilidad financiera es el criterio principal.
El horizonte de compra ajusta el mensaje explicativo de la alternativa, pero no cambia el score ni reemplaza el orden financiero.

## Regla de integracion con fuente de proyectos

HU6 debe consumir proyectos mediante `frontend/src/services/projectSimulationService.js`. En Sprint 1, ese servicio lee los mocks de `frontend/src/data/mockProjects.js`; cuando HU7 entregue catalogo real, debe reemplazar o alimentar ese servicio manteniendo el contrato de datos.

Campos minimos esperados:

- `id`;
- `nombre`;
- `comuna`;
- `tipo_vivienda`;
- `valor_uf`;
- `estado`.

Los estados no disponibles, como `agotado`, `inactivo` o `no_disponible`, no deben entrar al selector ni a las alternativas de HU6.

HU6 no debe consumir datos comerciales internos del proyecto ni exponer informacion reservada para ejecutivos.

## Regla para rango referencial por ahorro

HU6 puede mostrar un rango referencial por ahorro, no como financiamiento real, monto aprobado ni preaprobacion. Debe mostrarse en UF y CLP.

Debe presentarse como:

- "Con tu ahorro actual, podrias cubrir el pie recomendado de una vivienda cercana a X UF".
- "Con tu ahorro actual, podrias cubrir el pie minimo de una vivienda cercana a Y UF".

Formulas:

```text
valor_referencial_por_pie_recomendado = ahorro_disponible / 0.20
valor_referencial_por_pie_minimo = ahorro_disponible / 0.10
```

Este rango no es aprobacion, financiamiento garantizado ni pie requerido. Si no existe formula validada para convertir dividendo en valor de vivienda, no se debe inventar una formula hipotecaria avanzada dentro de HU6.

Mensaje sugerido:

```text
Con tu ahorro actual, podrias cubrir el pie recomendado de una vivienda cercana a X UF, o el pie minimo de una vivienda cercana a Y UF. Este rango no corresponde a financiamiento aprobado.
```

## Regla para usar preferencia de tipo de vivienda

- Si el usuario prefiere departamento, mostrar primero proyectos fake con `tipo_vivienda = departamento`.
- Si el usuario prefiere casa/vivienda, mostrar primero proyectos fake con `tipo_vivienda = casa` o equivalente.
- Si no hay coincidencias, mostrar alternativas disponibles indicando que son referenciales y no coinciden totalmente con la preferencia.
- La preferencia ordena resultados, pero no debe ocultar alternativas claramente mas accesibles.

## Regla para usar comuna o zona preferida

- Si existe comuna objetivo, priorizar proyectos fake en esa comuna.
- Si no hay proyectos en esa comuna, usar comunas cercanas disponibles en el mock, si el mock las define.
- Si no hay relacion de cercania documentada, ordenar por compatibilidad financiera y mostrar que la comuna difiere del objetivo.
- No inventar disponibilidad real de proyectos por comuna.

## Regla para usar horizonte de compra

- Horizonte corto: enfatizar brechas actuales de pie, deuda y dividendo.
- Horizonte medio: permitir alternativas Cercanas con recomendaciones de ahorro y reduccion de deuda.
- Horizonte largo: mostrar escenarios de preparacion gradual, siempre como orientacion y no como promesa de acceso futuro.

El horizonte de compra no debe aumentar el score ni convertir un escenario incompatible en Compatible por si solo.

## Regla de comparacion de alternativas

El escenario actual es el proyecto referencial o valor manual que el usuario esta evaluando. Cada alternativa accesible puede incluir una accion `Comparar` o `Comparar con escenario actual` para contrastarse directamente contra ese escenario actual.

Al comparar, la interfaz debe desplazar la vista hacia el bloque de comparacion para que el usuario vea el resultado generado. La comparacion debe identificar explicitamente:

- `Escenario A`: escenario actual;
- `Escenario B`: alternativa seleccionada.

La comparacion debe mostrar:

- valor vivienda;
- pie minimo;
- pie recomendado;
- ahorro disponible;
- brecha de pie;
- estado de compatibilidad;
- brecha principal;
- comuna;
- tipo de vivienda;
- analisis breve de cual alternativa parece mas conveniente.

Si no hay escenario actual, la UI debe mostrar un mensaje controlado: `Primero selecciona un proyecto o ingresa un valor manual para comparar`.

La comparacion es referencial y no crea un score nuevo; reutiliza los indicadores calculados para cada escenario.

Si el usuario selecciona primero el proyecto comparador y despues completa o cambia el escenario actual, la comparacion debe recalcularse automaticamente. El aviso por datos faltantes debe aparecer una sola vez y solo cuando falte el escenario actual o la alternativa.

La comparacion no debe limitarse a mostrar dos columnas de valores. Debe derivar, usando solo indicadores ya calculados por HU6:

- diferencias de valor de vivienda en UF;
- diferencias de pie minimo;
- diferencias de pie recomendado;
- diferencias de brecha de pie;
- diferencia de estado de compatibilidad;
- diferencia de comuna;
- diferencia de tipo de vivienda;
- coincidencia o no con comuna objetivo y tipo preferido.

La comparacion debe separar:

- ventajas del escenario actual;
- ventajas de la alternativa;
- puntos a considerar o tradeoffs.

Reglas simples de recomendacion referencial:

- Si un escenario tiene mejor compatibilidad, menor brecha y menor valor, puede marcarse como mas conveniente.
- Si un escenario es financieramente mejor pero menos alineado a preferencias, mostrarlo como tradeoff.
- Si un escenario coincide mejor con preferencias pero exige mayor ahorro, mostrarlo como tradeoff.
- Si ambos escenarios son similares, indicar que la decision depende mas de comuna, tipo de vivienda u horizonte.
- Si faltan datos suficientes, no forzar recomendacion.

El resultado de comparacion solo puede ser:

- `escenario_actual`;
- `alternativa`;
- `similar`;
- `sin_datos_suficientes`.

Este resultado no es una decision financiera formal ni una recomendacion bancaria. La comparacion puede usar graficos simples HTML/CSS para visualizar diferencias, sin librerias externas ni calculos hipotecarios avanzados.

Las vistas graficas permitidas para HU6 son:

- `Metas`: compara ahorro disponible contra pie minimo/pie recomendado, y dividendo declarado contra limite prudente si existe.
- `Barras`: compara indicadores clave entre Escenario A y Escenario B.
- `Diferencias`: resume el cambio entre ambos escenarios con texto breve y valores visibles.

No se deben usar graficos circulares, radar o visualizaciones que dependan de tooltip para entender el resultado principal.

## Regla de presentacion y ayudas conceptuales

La vista de HU6 puede usar un contenedor mas ancho que otras vistas para mejorar lectura y comparacion. Este ajuste debe quedar acotado a `Simulacion` y no cambiar el layout global de RutaHogar.

La UI debe evitar marcos anidados excesivos. Se deben preferir separadores, columnas, espaciado y jerarquia visual. Los marcos se reservan para:

- resultado principal del escenario;
- comparacion;
- disclaimers o advertencias;
- tarjetas repetidas de alternativas cuando ayuden a escanear opciones.

HU6 debe mostrar las preferencias preliminares que considera si estan disponibles:

- comuna objetivo;
- tipo de vivienda preferido;
- horizonte o plazo de compra;
- objetivo inmobiliario declarado.

HU6 debe explicar conceptos clave con textos breves, sin convertir la pantalla en documentacion extensa. Conceptos minimos:

- pie minimo;
- pie recomendado;
- brecha de pie;
- rango referencial por ahorro;
- dividendo maximo prudente;
- Compatible;
- Cercano;
- Requiere ajuste.

Cuando exista la ruta o seccion `Academia`, la pantalla puede ofrecer un CTA para revisar conceptos alli.

Las explicaciones de HU6 deben ser deterministicas o verificables. La IA no debe decidir compatibilidad, calcular brechas, modificar estado ni reemplazar reglas financieras. Si Groq se usa en otras partes del proyecto, debe quedar fuera de la decision de compatibilidad de HU6.

## Supuestos financieros

- Los datos son autodeclarados.
- El valor UF usado debe provenir de configuracion o reglas vigentes al implementar.
- Pie minimo referencial: 10%.
- Pie recomendado referencial: 20%.
- Dividendo prudente referencial: hasta 25% del ingreso usado para capacidad.
- La deuda mensual vigente puede limitar la compatibilidad; su umbral debe venir de `docs/REGLAS_SCORING.md`.
- Beneficios, subsidios o FOGAES no deben mejorar automaticamente la compatibilidad sin reglas validadas.
- La simulacion no contempla seguros, gastos operacionales, tasacion, impuestos, CAE ni costo total del credito.

## Mensajes sugeridos para usuario

Compatible:

```text
Este escenario parece compatible con tu perfil actual de forma referencial.
```

Cercano:

```text
Estas cerca de este escenario, pero deberias revisar la brecha principal antes de avanzar.
```

Requiere ajuste:

```text
Este escenario esta por sobre tu capacidad actual estimada. Prueba con menor valor, otra comuna o un plan de mejora.
```

Brecha de pie:

```text
La principal brecha es el pie disponible. Necesitarias aumentar tu ahorro para acercarte a este objetivo.
```

Brecha de deuda:

```text
La deuda mensual actual reduce tu holgura para asumir un dividendo.
```

Brecha de ingreso/dividendo:

```text
El dividendo estimado podria ser alto para tu ingreso actual.
```

## Advertencias de caracter referencial

Todo resultado de HU6 debe incluir una advertencia equivalente a:

```text
Esta simulacion es referencial y se basa en datos declarados. No corresponde a aprobacion bancaria, preaprobacion, tasacion ni cotizacion formal.
```

Cuando se usen proyectos fake:

```text
Los proyectos mostrados son referenciales para simulacion y pueden no representar disponibilidad real.
```

## Casos de prueba manuales

| Caso | Entrada | Resultado esperado |
| --- | --- | --- |
| Compatible por pie e ingreso | Ahorro >= 20%, dividendo dentro de 25% del ingreso | Escenario Compatible. |
| Pie insuficiente | Ahorro < 10% del valor | Requiere ajuste, brecha principal pie. |
| Escenario cercano | Ahorro cubre minimo, pero no recomendado; dividendo cerca del limite | Escenario Cercano. |
| Deuda alta | Deuda mensual supera umbral vigente | Brecha principal deuda o carga financiera. |
| Valor objetivo alto | Valor sobre maximo estimado | Requiere ajuste, brecha valor objetivo. |
| Ordenamiento de alternativas | Varias alternativas con distinta compatibilidad y preferencias | Se ordenan primero por compatibilidad, luego menor brecha, comuna, tipo de vivienda y valor. |
| Preferencia por departamento | Usuario declara departamento y existen mocks de departamento | Se priorizan departamentos. |
| Comuna objetivo disponible | Usuario declara comuna con proyectos mock | Se prioriza esa comuna. |
| Comuna objetivo sin mocks | No hay mocks en comuna objetivo | Se muestran otras comunas con disclaimer. |
| Horizonte corto | Plazo de compra cercano | Mensajes enfatizan brecha inmediata. |
| Horizonte largo | Plazo de compra mayor | Mensajes permiten plan de ahorro/mejora gradual. |
| Datos incompletos | Falta dividendo o valor | Mostrar mensaje de datos insuficientes o estimacion conservadora. |
| Rendimiento | Simulacion ejecutada con lista mock | Respuesta menor a 30 segundos. |
