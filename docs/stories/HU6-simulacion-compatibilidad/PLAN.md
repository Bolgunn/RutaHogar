# HU6 — Simulacion de compatibilidad y alternativas accesibles

## Objetivo funcional

Permitir que un usuario que ya completo su evaluacion pueda simular distintos escenarios de compra de vivienda y entender si cada alternativa es compatible, cercana o requiere ajustes respecto de su perfil financiero actual.

La simulacion debe ayudar al usuario a comparar valores de vivienda, comunas, plazos, tipo de vivienda y proyectos referenciales sin presentar el resultado como aprobacion bancaria, cotizacion formal ni promesa de financiamiento.

## Actor principal

Lead / usuario interesado en comprar vivienda.

## Categoria y estimacion

- Categoria: Esencial.
- Sprint: Sprint 1.
- Story points: 8 SP.

## Alcance

- Documentar como se calculara la compatibilidad de escenarios.
- Documentar el uso de proyectos fake o referenciales.
- Documentar como se mostrara el valor maximo estimado de vivienda como rango referencial por ahorro, en UF y CLP.
- Documentar como se propondran alternativas accesibles.
- Documentar los datos del usuario utilizados desde evaluacion y preguntas preliminares.
- Documentar reglas, supuestos, limites y criterios de prueba manual.

## Fuera de alcance

- Catalogo real de proyectos inmobiliarios, correspondiente a HU7.
- Cotizacion formal por proyecto, correspondiente a HU9.
- Matching para ejecutivos comerciales, correspondiente a HU10.
- Ranking avanzado de proyectos por brecha minima, correspondiente a HU19.
- Simulador hipotecario avanzado con tasa, plazo y costo total, correspondiente a HU18/HU29.
- Consulta a bancos, CMF, Dicom, CRM o APIs externas.
- Persistencia historica de simulaciones.
- Aprobacion, preaprobacion o garantia de credito hipotecario.
- Carga de documentos o validacion formal de antecedentes.
- Cambios al scoring vigente o al contrato `POST /score`.

## Decisiones cerradas

1. HU6 se mostrara como una pagina o pestana aparte llamada `Simulacion`.
2. HU6 trabajara con proyectos fake o referenciales por ahora.
3. Los proyectos fake deben vivir en `frontend/src/data/mockProjects.js`.
4. La estructura de proyectos fake debe quedar preparada para acoplarse despues a HU7.
5. HU6 permitira elegir un proyecto referencial o ingresar manualmente un valor de vivienda.
6. HU6 debe usar los datos del usuario obtenidos en la evaluacion y preguntas preliminares.
7. HU6 no crea un scoring nuevo; se apoya en el resultado financiero actual del usuario.
8. HU6 debe declarar siempre que sus resultados son referenciales.
9. El valor maximo estimado debe mostrarse en UF y CLP.
10. El valor maximo estimado es una orientacion por ahorro/capacidad declarada, no financiamiento real ni monto aprobado.
11. El pie minimo y el pie recomendado siempre se calculan sobre el valor del escenario; no deben confundirse con el rango referencial por ahorro.
12. Las alternativas accesibles deben incluir una accion `Comparar` o `Comparar con escenario actual` para contrastarlas directamente contra el escenario actual.
13. La vista debe priorizar primero el resultado del escenario actual, antes de mostrar la comparacion visual.
14. La comparacion visual reemplaza las tarjetas numericas `Escenario A` y `Escenario B`; no debe duplicar datos en cards redundantes.
15. Al comparar desde una tarjeta, la vista debe desplazarse al panel de comparacion visual para que el usuario vea el resultado creado.
16. No se usara la idea de `Seleccionar simulacion` en las tarjetas mientras la UI real use comparacion directa.
17. La vista `Simulacion` puede usar un contenedor mas ancho que el resto de vistas para aprovechar mejor el espacio horizontal, sin cambiar el layout global de la aplicacion.
18. La UI debe evitar exceso de marcos anidados; priorizar secciones limpias, separadores y columnas. Los marcos deben reservarse para resultado principal, comparacion, advertencias y elementos repetidos donde aporten claridad.
19. HU6 debe mostrar un resumen discreto de las preferencias preliminares consideradas: comuna objetivo, tipo de vivienda, horizonte/plazo y objetivo inmobiliario si existen.
20. HU6 debe explicar conceptos clave con ayudas breves y enlazar a Academia cuando sea posible.
21. Las explicaciones de HU6 deben ser deterministicas o verificables. La IA no decide compatibilidad, no calcula estados y no modifica reglas.
22. La comparacion no debe limitarse a valores lado a lado; debe explicar ventajas, desventajas, tradeoffs y una recomendacion referencial.
23. La comparacion debe usar solo indicadores ya calculados por HU6 y no crear un score nuevo.
24. La comparacion debe usar un grafico tipo barras comparativas o dumbbell hecho con HTML/CSS, sin radar chart ni dependencias externas.
25. Academia se mantiene como CTA final de la vista y no forma parte del calculo de compatibilidad.

## Dependencias

- Evaluacion previa completada por el usuario.
- Resultado financiero vigente: score, clasificacion, riesgos, recomendaciones y/o bloqueador principal si esta disponible.
- Datos preliminares capturados en onboarding o preguntas iniciales.
- Reglas actuales de scoring documentadas en `docs/REGLAS_SCORING.md` y, como contexto historico, `backend/app/REGLAS_SCORING.md`.
- Futuro catalogo real de proyectos de HU7.

## Criterios de aceptacion

### E1 — Simulacion de valores de vivienda

Dado que el usuario ya completo su evaluacion, cuando ingrese distintos valores de vivienda, entonces el sistema debe mostrar si cada escenario es compatible con su capacidad de compra.

### E2 — Ajustes minimos para acceder

Dado que el usuario no califica para su objetivo declarado, cuando el usuario quiera evaluar otros objetivos con sus resultados, entonces el sistema debe proponer distintas alternativas que sean lo mas accesibles para este usuario.

### E3 — Estimacion de capacidad de compra

Dado que el usuario recibio su evaluacion, cuando visualice el resultado, entonces el sistema debe mostrar el valor maximo estimado de vivienda que podria financiar.

### E4 — Tiempo maximo de respuesta

Dado que el usuario realiza la simulacion de compatibilidad, cuando este termine, entonces no tiene que exceder un tiempo de respuesta de 30 segundos.

## Diseno funcional propuesto

La vista `Simulacion` deberia permitir dos caminos:

- seleccionar un proyecto referencial desde una lista mock;
- ingresar manualmente un valor de vivienda y parametros simples.

Para cada escenario, el sistema deberia mostrar:

- estado del escenario: Compatible, Cercano o Requiere ajuste;
- valor de vivienda usado;
- pie minimo estimado y pie recomendado;
- ahorro disponible del usuario;
- brecha de pie si existe;
- dividendo maximo prudente estimado;
- comparacion con dividendo estimado o dividendo referencial;
- brecha principal detectada;
- recomendaciones de ajuste simples;
- advertencia de caracter referencial.

La simulacion debe priorizar alternativas que respeten preferencias del usuario cuando existan: tipo de vivienda, comuna objetivo, comunas de interes y horizonte de compra.

## Presentacion visual de la vista

La pantalla `Simulacion` puede usar un ancho mayor que las vistas generales para mostrar selector, rango referencial, resultado, comparacion y alternativas sin comprimir la informacion.

La vista debe reducir marcos anidados innecesarios. Se recomiendan:

- superficie principal limpia, sin caja grande adicional cuando ya existe el marco global;
- secciones separadas por espaciado, titulos y lineas suaves;
- marcos visibles solo en resultado principal, comparacion, disclaimers, advertencias y tarjetas repetidas;
- layout responsive que vuelva a una columna en pantallas pequenas.

La pantalla debe incluir un resumen `Preferencias consideradas` con datos preliminares disponibles. Este resumen no permite editar preferencias dentro de HU6; solo informa que datos se estan usando.

Tambien debe incluir ayudas breves tipo `Que significa` para conceptos como pie minimo, pie recomendado, brecha de pie, rango referencial por ahorro, dividendo maximo prudente y estados de compatibilidad. Cuando exista la ruta de Academia, se puede incluir un CTA para profundizar alli sin interrumpir el flujo de simulacion.

Las explicaciones visibles en HU6 deben ser deterministicas o verificables. Si el proyecto usa Groq en otras vistas para explicaciones generales, HU6 no debe delegar en IA la decision de compatibilidad ni el calculo de brechas.

## Aclaracion de unidades

Los valores de vivienda pueden mostrarse en UF y CLP. Los calculos deben mantener unidades consistentes:

```text
pie_minimo = valor_vivienda * 10%
pie_recomendado = valor_vivienda * 20%
brecha_pie = max(0, pie_minimo - ahorro_disponible)
```

Si el escenario esta en UF, el pie minimo y recomendado deben poder expresarse en UF y CLP. Si los datos del usuario estan en CLP, convertir usando el valor UF vigente del proyecto antes de mostrar la equivalencia.

El valor maximo referencial por ahorro no es pie requerido. Por ejemplo, para una vivienda de 5000 UF:

- pie minimo requerido: 500 UF;
- pie recomendado: 1000 UF.

Un valor como 4906 UF puede representar rango referencial por ahorro/capacidad declarada, pero nunca debe mostrarse como pie minimo.

La tarjeta de rango referencial por ahorro debe usar textos que indiquen valor de vivienda estimado, por ejemplo:

- `Vivienda estimada con pie recomendado`: hasta X UF.
- `Vivienda estimada con pie minimo`: hasta Y UF.

Tambien puede usar frases completas:

- `Segun tu ahorro, podrias cubrir el pie recomendado de una vivienda cercana a X UF`.
- `Segun tu ahorro, podrias cubrir el pie minimo de una vivienda cercana a Y UF`.

## Separacion visual obligatoria

La UI debe mostrar por separado:

- valor de vivienda;
- pie minimo requerido;
- pie recomendado;
- ahorro disponible;
- brecha de pie;
- rango referencial por ahorro, si se muestra.

El rango referencial por ahorro debe etiquetarse como orientacion separada, no como requisito del escenario.

## Explicacion del estado

Todo escenario debe mostrar una explicacion breve que indique:

- por que quedo en Compatible, Cercano o Requiere ajuste;
- cual es la brecha principal;
- que podria mejorar el usuario.

El score general alto no garantiza compatibilidad con cualquier vivienda. Pero si el score es alto y las brechas son moderadas, el sistema debe preferir `Cercano` antes que `Requiere ajuste`, siempre que no exista bloqueo financiero critico como deuda alta, dividendo claramente fuera de capacidad, falta importante de pie o datos criticos incompletos.

## Datos de entrada esperados

Desde evaluacion financiera:

- `ingreso_mensual`;
- `deuda_mensual`;
- `ahorro_disponible`;
- `dividendo_estimado`;
- `classification` o clasificacion financiera;
- bloqueador principal, riesgos o factor determinante si esta disponible;
- datos de complemento de renta cuando existan y sean validos.

Desde preguntas preliminares:

- tipo de vivienda preferida: departamento o casa/vivienda;
- comuna objetivo o comunas de interes;
- plazo esperado para comprar;
- objetivo inmobiliario declarado.

Desde simulacion manual o proyecto fake:

- valor de vivienda en UF y/o CLP;
- comuna;
- tipo de vivienda;
- estado del proyecto referencial;
- datos opcionales como dormitorios, entrega estimada, inmobiliaria y descripcion corta.

## Datos de salida esperados

- Valor maximo estimado de vivienda como rango referencial por ahorro, mostrado en UF y CLP.
- Estado de compatibilidad del escenario.
- Brecha principal: ingreso, pie, deuda, plazo/dividendo o valor objetivo.
- Brecha de pie en CLP y/o UF cuando corresponda.
- Mensaje explicativo para usuario.
- Alternativas accesibles priorizadas.
- Disclaimer de resultado referencial.

## Uso de datos preliminares del usuario

- Si existe preferencia de tipo de vivienda, priorizar proyectos fake del mismo tipo.
- Si existe comuna objetivo, priorizar proyectos fake de esa comuna o comunas cercanas disponibles en el mock.
- Si el plazo esperado para comprar es corto, destacar brechas inmediatas de pie, deuda y dividendo.
- Si el plazo esperado es mayor, permitir alternativas que dependan de ahorro gradual o mejora financiera.
- Si existe complemento de renta valido, usarlo solo segun las reglas financieras vigentes y sin inventar reglas nuevas.
- Si existe clasificacion financiera Baja o bloqueador fuerte, mostrar alternativas mas conservadoras y mensajes de preparacion.

## Ordenamiento de alternativas

Las alternativas deben ordenarse por:

1. Compatible antes que Cercano.
2. Cercano antes que Requiere ajuste.
3. Menor brecha principal primero.
4. Coincidencia de comuna.
5. Coincidencia de tipo de vivienda.
6. Menor valor cuando los criterios anteriores empatan.

El horizonte de compra ajusta mensajes, no cambia el score ni reemplaza el orden financiero.

Cada alternativa debe incluir un boton `Comparar` o `Comparar con escenario actual` para contrastarla directamente contra el escenario actual. Si no hay escenario actual, la UI debe mostrar un mensaje controlado: `Primero selecciona un proyecto o ingresa un valor manual para comparar`.

La vista debe presentar primero el resultado del escenario actual, porque responde que ocurre con el proyecto o valor que el usuario eligio. Despues de ese resultado, si existe una alternativa seleccionada, debe aparecer la comparacion visual.

La comparacion visual reemplaza las tarjetas numericas `Escenario A` y `Escenario B`. Debe incluir lectura rapida, grafico comparativo tipo barras o dumbbell, ventajas y tradeoffs, integrando ahi los datos necesarios para entender escenario actual y alternativa sin duplicar cards lado a lado. No debe usar radar/pentagono, porque esa lectura dificulta entender rapidamente que escenario exige menor pie, menor brecha o mejor compatibilidad. Si aun no hay alternativa, la seccion de comparacion no necesita ocupar espacio principal; las opciones accesibles deben seguir disponibles mas abajo para iniciar la comparacion.

Cuando se genere una comparacion desde una tarjeta, la interfaz debe llevar la vista al panel de comparacion visual para que el usuario no tenga que buscar el resultado al final de la pagina.

La comparacion debe ir mas alla de una tabla de valores. Debe explicar, de forma deterministica y referencial:

- ventajas del escenario actual;
- ventajas de la alternativa;
- tradeoffs entre compatibilidad financiera y preferencias declaradas;
- diferencias principales en valor, pie minimo, pie recomendado y brecha de pie;
- una recomendacion referencial: escenario actual, alternativa, similar o sin datos suficientes.

Ejemplos de tradeoff:

- menor valor, pero comuna distinta a la objetivo;
- menor brecha de pie, pero tipo de vivienda no preferido;
- escenario Compatible menos alineado a preferencias;
- escenario Cercano mas alineado a comuna/tipo declarado.

Si un escenario tiene mejor compatibilidad, menor brecha y menor valor, puede marcarse como mas conveniente de forma referencial. Si financieramente es mejor pero se aleja de preferencias, debe explicarse como tradeoff. Si ambos son similares, la decision debe quedar asociada a preferencias de comuna, tipo de vivienda u horizonte de compra.

La comparacion no crea score nuevo, no reemplaza la evaluacion bancaria y no cambia el resultado financiero principal del usuario. Solo reorganiza indicadores ya calculados por HU6 para explicar diferencias y tradeoffs de forma referencial. La seccion de Academia debe mantenerse al final como CTA de apoyo conceptual, sin alterar el flujo de calculo ni reemplazar la comparacion.

## Reglas de integracion con proyectos fake

Los proyectos fake deben documentarse y prepararse con una estructura simple, reemplazable por HU7:

```json
{
  "id": "mock-proyecto-001",
  "nombre": "Proyecto referencial",
  "comuna": "Santiago",
  "tipo_vivienda": "departamento",
  "valor_uf": 2800,
  "valor_clp": null,
  "estado": "referencial",
  "dormitorios": 2,
  "entrega_estimada": "2027-01",
  "inmobiliaria": "Inmobiliaria referencial",
  "descripcion_corta": "Alternativa mock para simulacion temprana."
}
```

Campos minimos recomendados:

- `id`;
- `nombre`;
- `comuna`;
- `tipo_vivienda`;
- `valor_uf`;
- `estado`.

Campos opcionales recomendados:

- `valor_clp`;
- `dormitorios`;
- `entrega_estimada`;
- `inmobiliaria`;
- `descripcion_corta`.

El archivo acordado para implementacion es `frontend/src/data/mockProjects.js`.

## Acople futuro con HU7

HU6 no debe depender de un catalogo real en Sprint 1. Sin embargo, el mock debe anticipar la estructura de HU7 para que el reemplazo posterior sea directo:

- `id` del mock sera equivalente al identificador del proyecto real.
- `comuna`, `tipo_vivienda`, `valor_uf` y `estado` deben conservar nombres estables.
- El estado del proyecto debe permitir excluir proyectos agotados cuando HU7 exista.
- La vista de HU6 deberia consumir una fuente abstracta de proyectos para que despues pueda cambiar desde mock local a catalogo real.
- HU6 no debe asumir datos comerciales internos del proyecto que pertenezcan a ejecutivos o administradores.

## Riesgos

- Confundir una simulacion referencial con aprobacion bancaria.
- Duplicar logica de scoring en vez de reutilizar reglas o indicadores existentes.
- Inventar umbrales financieros no validados por el equipo.
- Acoplar el mock de proyectos a una estructura incompatible con HU7.
- Mostrar alternativas poco utiles si faltan datos preliminares del usuario.
- Exponer al lead informacion comercial interna que debe reservarse para ejecutivos.
- Generar frustracion si los mensajes no explican claramente la brecha principal.

## Supuestos

- El usuario ya completo al menos una evaluacion financiera.
- Los datos son autodeclarados y pueden no estar validados formalmente.
- La UF usada en conversiones debe provenir de la configuracion/reglas existentes cuando se implemente.
- Los porcentajes de pie minimo, pie recomendado, carga financiera y dividendo prudente deben alinearse con reglas vigentes y no definirse de forma aislada en codigo de HU6.
- El umbral de deuda/carga financiera debe provenir explicitamente de `docs/REGLAS_SCORING.md`: deuda mensual superior al 40% del ingreso mensual se considera carga alta.
- Los proyectos fake son solo insumos de simulacion temprana.

## Validaciones manuales esperadas

- Usuario con ahorro suficiente y carga prudente ve al menos un escenario Compatible.
- Usuario con ahorro insuficiente ve brecha principal de pie y alternativas de menor valor.
- Usuario con deuda alta ve brecha principal de deuda o carga financiera.
- Usuario con dividendo objetivo alto ve brecha de plazo/dividendo o valor objetivo.
- Usuario con preferencia de departamento ve primero proyectos mock de departamento si existen.
- Usuario con comuna objetivo ve primero proyectos mock de esa comuna o cercanos si existen.
- Usuario con horizonte corto ve mensajes enfocados en brechas inmediatas.
- Usuario con horizonte largo ve mensajes de ahorro/mejora gradual.
- La simulacion responde en menos de 30 segundos.
- La pantalla muestra que el resultado es referencial y no equivale a aprobacion bancaria.

## Preguntas SDD minimas

| Pregunta | Respuesta |
| --- | --- |
| Toca scoring o reglas financieras | Si. Toca reglas financieras de compatibilidad, pero no debe modificar el scoring vigente ni crear un score nuevo. |
| Cambia el contrato `POST /score` | No. HU6 debe consumir datos ya disponibles o derivados, sin cambiar el contrato del endpoint. |
| Necesita migracion | No. No se guardaran simulaciones historicas ni se crearan tablas en esta HU. |
| Tiene impacto en privacidad/consentimiento | Bajo a medio. Usa datos financieros ya declarados por el usuario; no debe solicitar documentos ni consultar fuentes externas. Debe respetar consentimiento existente. |
| Que pruebas o casos manuales validarian la HU | Casos con ahorro suficiente, ahorro insuficiente, deuda alta, dividendo alto, comuna preferida, tipo de vivienda preferido, horizonte corto/largo, datos incompletos y respuesta menor a 30 segundos. |

## Pendientes documentales

- Confirmar con el equipo si `docs/REGLAS_SCORING.md` debe copiar reglas vigentes desde `backend/app/REGLAS_SCORING.md` o mantenerse como indice central liviano.
