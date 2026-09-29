# Spike 2 · E4 — Investigación de fuentes de datos externas

**Fecha de consulta:** 2026-09-15. **Estado:** investigación documental terminada; recomendaciones pendientes de revisión del equipo. No constituye autorización ni diseño aprobado de integración.

## 1. Objetivo

Documentar el criterio solicitado: **E4 — Investigación de fuentes de datos externas**.

> Dado que existen datos financieros e inmobiliarios actualmente estáticos o hardcodeados, cuando el equipo investigue fuentes externas disponibles, entonces debe identificar APIs o fuentes confiables para obtener información como UF, tasas e indicadores financieros o inmobiliarios, definiendo disponibilidad, frecuencia de actualización, formato de datos, límites de uso y comportamiento esperado ante fallos.

Se leyó primero el [handbook](../HANDBOOK.md), que declara estar en borrador pendiente de ratificación, y se revisaron el [backlog vigente](../BACKLOG_HUS_RUTAHOGAR.md), el [método Scrum + SDD acotado](../SCRUM_SDD_ACOTADO_RUTAHOGAR.md) y la documentación de Sprint 2. Se sigue la ubicación y nomenclatura del [precedente de investigación](spike1-e4-lead-project-matching-criteria.md). Este entregable prepara decisiones; no inicia una fase Build ni crea un PLAN o algoritmo de una HU no encargada.

**Discrepancia documental:** [el resumen ampliado](../../agents/BACKLOG_HUS_RUTAHOGAR.md) y [el informe de proyecto, sección Spike 2](<../../Wiki RutaHogar/informes_entregas/E4 - GPI Plan de Proyecto 2026.md>) todavía denominan E4 a documentos y E5 a integraciones. Aquí prevalece el criterio exacto del encargo. No se renumeran ni modifican esos documentos; su reconciliación queda pendiente.

## 2. Alcance y nivel de evidencia

- UF, tasa hipotecaria agregada e indicador inmobiliario del Banco Central de Chile (BCCh); API CMF como alternativa financiera.
- Fuera de alcance: datos personales financieros, REDEC, DICOM, Open Finance, APIs bancarias individuales, CRM, código, migraciones, contratos y cambios de scoring.
- **Oficial:** información publicada por la institución, enlazada mediante las referencias de §11.
- **Recomendación técnica:** propuesta para RutaHogar, principalmente §6–9; no requisito de negocio aprobado.
- **Pendiente:** decisión del equipo o comprobación no realizada, identificada expresamente.

**Disponibilidad verificada:** se consultaron documentación pública y fichas BDE. No se solicitaron credenciales ni se hicieron consultas autenticadas; por tanto, no se certifican respuesta operativa de las APIs, latencia, continuidad ni acceso efectivo de una cuenta RutaHogar. Una página accesible o un endpoint documentado no acredita un SLA. Tampoco se toman los valores de ejemplo de la documentación como datos actuales.

## 3. Situación actual / problema

La lectura del repositorio identifica estos candidatos; los valores siguientes son **evidencia del código actual, no valores oficiales de mercado**:

| Ubicación | Evidencia | Implicación |
| --- | --- | --- |
| [Motor preparatorio, constantes](../../backend/app/scoring_engine/constants.py) | `VALOR_UF_CLP = 40695`, `VALOR_UF_FECHA = "2026-08-16"`, `TASA_REFERENCIA_UF_ANUAL = 0.040` | UF fija y tasa base del cálculo de capacidad; el encabezado del archivo declara carácter preparatorio. |
| [Scoring existente](../../backend/app/scoring.py) | `VALOR_UF_CLP = 40695` y uso de `uf_value_clp` con fallback | No basta reemplazar una constante para resolver todos los consumidores. |
| [Formulario](../../frontend/src/components/ScoreForm.jsx), [compatibilidad](../../frontend/src/lib/simulation/compatibility.js), [simulación](../../frontend/src/components/SimulationPage.jsx), [plan de ahorro](../../frontend/src/services/housingSavingsPlanService.js) | Valores UF de respaldo/fijos `40695` | Riesgo de divergencia entre vistas y evaluaciones. |
| [Dividendo hipotecario](../../frontend/src/lib/mortgage.js) | Fallback anual `0.049`; admite `VITE_REFERENTIAL_MORTGAGE_RATE` | Coexiste con otra referencia anual en el backend. No se decide aquí que ambas deban cambiar simultáneamente. |
| [Seguimiento financiero](../../frontend/src/services/financialTracking.js) | `ESTIMATED_ANNUAL_UF_INCREASE = 0.04` | Es un supuesto de proyección; una UF observada o el IPV no lo sustituyen automáticamente. |

No se establece equivalencia entre una constante, una observación estadística y una regla financiera. No se identificó un IPV hardcodeado que deba reemplazarse: es una fuente potencial de contexto, no una funcionalidad nueva comprometida.

## 4. Fuentes investigadas

### 4.1 Banco Central de Chile — BDE API: acceso común

**Oficial.** Institución responsable: BCCh. REST usa `https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx`, con `function=GetSeries`, `timeseries=<serie>`, `token=<token>` y filtros opcionales `firstdate`/`lastdate` en `YYYY-MM-DD`. Se consulta cada serie por separado. Devuelve JSON, con `Codigo`, `Descripcion` y `Series.Obs`; cada observación incluye `indexDateString`, `value` y `statusCode`. Los ejemplos contemplan valores como cadenas y observaciones `ND`/`NaN`. También existe SOAP/XML. [B2]

Se requiere cuenta BDE y habilitación de API; REST admite API Key Token, mientras SOAP utiliza usuario/contraseña. [B1] La ayuda declara acceso gratuito, token con vigencia de **un año**, máximo **cinco series por segundo por cuenta**, sin tope total diario; el incumplimiento puede suspender el acceso. Esto no equivale a servicio ilimitado ni garantiza continuidad. [B3]

Los términos permiten reutilización con atribución y diferencian los datos originales de las adaptaciones propias. No se identificó SLA contractual de disponibilidad en la documentación consultada. [B4] **Recomendación:** acceso futuro desde servidor, ocultar credenciales en registros y URLs observables, limitar consultas globalmente por cuenta y asignar responsable de renovación.

### 4.2 BDE — UF

**Oficial.** Serie `F073.UFF.PRE.Z.D`, identificada por la ayuda BDE. [B3] UF expresada en pesos por unidad. La CMF explica que el BCCh calcula una tabla mensual con valores diarios que cubre del **día 10 al 9 del mes siguiente**. Distinguir periodicidad diaria del valor y publicación de la tabla; no se verificó una hora de carga de BDE ni una garantía de sincronización entre proveedores. [C2]

**Disponibilidad:** serie y acceso documentados; última observación de la API no verificada. Endpoint, autenticación, formato y límites: §4.1. **Uso propuesto:** conversiones CLP/UF con fecha efectiva. **Fallo:** utilizar UF persistida para la fecha solicitada; si solo existe una anterior, mostrar su fecha y advertencia. Respaldo opcional CMF para la misma unidad/fecha, sujeto a validación (§7).

### 4.3 BDE — tasa promedio de créditos de vivienda en UF

**Oficial.** Serie `F022.VIV.TIP.MA03.UF.Z.M`, créditos de vivienda en UF a más de **tres años**, porcentaje anual, frecuencia **mensual**, desfase declarado de **siete días**. La ficha consultada muestra agosto de 2026, **4,04 %**, actualizada el **7 de septiembre de 2026**. Es un promedio ponderado de operaciones efectivas de Gran Santiago; incluye diversas modalidades hipotecarias, también algunas de fines generales. Una celda vacía puede significar ausencia de operaciones informadas. [B5]

**Disponibilidad:** ficha pública con observación reciente; extracción autenticada pendiente. Condiciones API: §4.1. **Uso propuesto:** tasa base orientativa, identificando cobertura, mes y fuente; nunca oferta bancaria, CAE, tasa personalizada ni aprobación crediticia. **Fallo:** último mes válido con su procedencia; no sustituir por TIP, TMC o TAB sin demostrar equivalencia. La conversión de porcentaje a fracción deberá verificarse antes de cualquier consumo futuro.

### 4.4 BDE — Índice de Precios de Vivienda (IPV)

**Oficial.** Serie general `F034.IPV.FLU.BCCH.2008.0.T`, índice con base **2008**, frecuencia trimestral y desfase de **cuatro meses**. La ficha muestra primer trimestre de 2026, **222,5**, actualizada el **31 de julio de 2026**. Usa transacciones de viviendas nuevas y usadas procedentes de registros del SII. Mantiene revisiones durante **tres años** y los últimos **dos trimestres** son provisorios; pertenece a estadísticas experimentales. [B6] La publicación ocurre el último día hábil de enero, abril, julio y octubre desde el cambio anunciado en 2023; no confundir documentación antigua de difusión semestral con la vigente. [B7]

**Disponibilidad:** ficha pública y serie identificada; API autenticada pendiente. Condiciones API: §4.1. **Uso propuesto:** contexto agregado del mercado, no tasación de un proyecto, precio por comuna ni predicción. **Fallo:** conservar último trimestre/versionado, indicando período y estado provisorio cuando aplique; no interpolar datos ausentes ni bloquear flujos principales.

### 4.5 Comisión para el Mercado Financiero — API CMF Bancos v3

**Oficial.** Servicio de la CMF; la documentación vigente enlazada prescribe v3 sobre HTTPS. Admite `apikey` y `formato=json` o `xml` (predeterminado); los errores pueden llegar en XML incluso si se solicita JSON. [C1] La clave se solicita mediante formulario. Cuota publicada: **10.000 peticiones mensuales por usuario**; tras agotarla se recupera acceso al cumplirse el período mensual. No se identificó un límite por segundo ni el instante exacto de reinicio de cuota. [C3] Es gratuito, exige atribución y puede suspenderse sin obligación de mantenimiento. [C4]

**UF como alternativa.** `https://api.cmfchile.cl/api-sbifv3/recursos_api/uf` o `/uf/<AAAA>/<MM>/dias/<DD>`, con parámetros de autenticación/formato anteriores. Entrega fecha y valor; sus ejemplos usan separador de miles y coma decimal. Periodicidad del dato: la tabla descrita en §4.2; no se publica allí SLA de carga de CMF respecto de BCCh. [C2] **Disponibilidad:** documentación accesible; entrega actual con clave y fecha de última observación pendientes. **Uso propuesto:** respaldo de UF, no una medición independiente del BCCh. **Fallo:** conservar dato local; no agotar cuota en reintentos.

**TIP como alternativa evaluada, no intercambiable.** Recurso `/api-sbifv3/recursos_api/tip/<AAAA>/<MM>`, misma autenticación, formatos y cuota. La CMF describe tasas promedio ponderadas por montos, publicación mensual antes del **día 15**, con campos `Fecha` y `Hasta` de vigencia; el último puede estar vacío. [C5] No se acreditó correspondencia exacta con la serie hipotecaria BDE. No se recomienda usarla como fallback automático de esa tasa; tampoco se identificó en el catálogo consultado un sustituto directo del IPV. Disponibilidad operativa no probada. Ante fallo, conservar únicamente la última observación del mismo indicador si en el futuro se aprueba su uso.

## 5. Matriz comparativa del criterio E4

Los hechos remiten a §4 y §11. Toda conducta ante fallos es **recomendación técnica**; la política común se detalla en §7.

| Fuente / dato | Disponibilidad | Frecuencia de la fuente | Formato | Límites | Comportamiento ante fallos |
| --- | --- | --- | --- | --- | --- |
| BDE / UF | Serie documentada; API autenticada pendiente | Valores diarios, tabla mensual; hora de carga no verificada [C2] | JSON REST; XML SOAP [B2] | Cinco series/s/cuenta; sin tope diario declarado [B3] | Persistido por fecha → alternativa CMF validada → anterior con advertencia |
| BDE / tasa vivienda UF | Ficha reciente consultada; API pendiente [B5] | Mensual; desfase de siete días [B5] | Igual a BDE | Igual a BDE | Último mes válido; no cambiar tipo de tasa |
| BDE / IPV | Ficha consultada; API pendiente [B6] | Trimestral, desfase de cuatro meses [B6–B7] | Igual a BDE | Igual a BDE | Último trimestre y versión; respetar calendario antes de declarar atraso |
| CMF / UF | Recurso documentado; clave/operación pendientes | Valores diarios; carga de réplica sin SLA identificado [C2] | JSON/XML; errores XML [C1] | 10.000 peticiones/mes/usuario; otros topes no identificados [C3] | Caché local; suspender consultas al agotar cuota |
| CMF / TIP | Documentada; equivalencia hipotecaria no acreditada | Mensual, antes del día 15 [C5] | JSON/XML [C5] | Igual a CMF | No reemplaza tasa BDE; conservar misma serie si se aprobara |

## 6. Estrategia de actualización y caché

**Recomendación técnica, pendiente de aprobación:** separar la obtención programada de la lectura de datos por los flujos principales. No consultar fuentes externas por cada formulario o cálculo. Esta propuesta no define tablas ni modifica contratos.

| Dato | Consulta propuesta de RutaHogar | Qué persistir / cuándo considerar atraso |
| --- | --- | --- |
| UF | Revisión diaria de cobertura; descargar el tramo publicado cuando falten fechas, especialmente en el cambio de tabla | Valores por fecha efectiva, incluidos futuros ya publicados, sin usarlos antes de su fecha. Si falta la fecha de hoy en Chile y se usa una anterior, indicar dato desactualizado. |
| Tasa referencial | Consulta en la ventana mensual de publicación; si falta el período esperado, comprobación diaria hasta recuperarlo, bajo presupuesto de reintentos | Mes estadístico y última observación válida. No declarar atraso solo porque el dato no sea del día actual; contrastar calendario de publicación. |
| IPV | Consulta tras cada publicación prevista; comprobación diaria si esa publicación no se obtiene | Trimestre, base y versiones revisadas. Recuperar también el tramo sujeto a revisión. No confundir rezago oficial con fallo del recolector. |
| CMF UF | Bajo demanda del proceso de actualización cuando falte UF válida de BDE, compartiendo resultado entre consumidores | Misma fecha/unidad y procedencia CMF; sin generar llamadas por usuario. TIP no se programa por ahora. |

La periodicidad **diaria** de comprobación es una propuesta operativa de RutaHogar, no una promesa de la fuente ni un criterio de negocio. El equipo debe aprobar horario y margen de espera después de cada publicación; no se fija aquí un TTL universal.

Persistir conceptualmente: indicador, institución, serie, valor original y normalizado, unidad, fecha efectiva o período, fecha de publicación/revisión si existe, **fecha y hora en que RutaHogar obtuvo el valor**, estado provisional si se informa y versión. Registrar por separado último intento y última consulta exitosa: un fallo no debe renovar la antigüedad aparente del dato. Mantener el último valor válido en almacenamiento durable, con caché de lectura para servirlo; conservar la referencia utilizada por cada evaluación para reproducibilidad, sin recalcular históricos silenciosamente. Diseño físico y retención quedan pendientes.

## 7. Manejo de fallos

**Política propuesta para todas las fuentes:**

1. Aplicar timeout finito de conexión y respuesta, y un presupuesto total por ejecución. Duraciones pendientes de medición; no son requisitos de negocio.
2. Reintentar solo fallos transitorios (red, timeout, indisponibilidad), con cantidad máxima configurable, espera creciente y variación aleatoria. Respetar `Retry-After` si existe. Al agotar el presupuesto, finalizar y esperar la siguiente ejecución; ningún bucle indefinido ni reintento por cada usuario.
3. Credenciales inválidas, parámetros incorrectos o cuota agotada requieren tratamiento específico, no reintento inmediato. CMF documenta códigos propios además del HTTP; inspeccionar ambos y el cuerpo XML. [C6] Notificar al responsable operativo sin registrar secretos ni datos del lead.
4. Validar indicador, unidad, fecha/período, número finito y estado de observación. Rechazar HTML, JSON/XML malformado, errores funcionales, `ND`/`NaN` y series equivocadas. Una respuesta HTTP exitosa no basta. No convertir ausencia a cero ni reemplazar un registro válido por un error.
5. Servir primero el valor válido persistido apropiado para la fecha. Si falta UF de esa fecha, probar CMF bajo el mismo presupuesto; registrar el cambio de proveedor. Si ambas fuentes discrepan para la misma fecha, conservar evidencia y pedir revisión operativa; no promediar ni reemplazar silenciosamente.
6. Si no se obtiene actualización, usar el último valor conocido, mostrar fecha efectiva, fuente y aviso de desactualización cuando corresponda. **Una falla externa no bloquea los flujos principales cuando existe un valor anterior válido.** Un valor leído de caché no está necesariamente desactualizado: puede ser la última publicación vigente.
7. Sin ningún valor válido, informar indisponibilidad de la cifra o cálculo dependiente y mantener disponibles los flujos independientes. No inventar un valor ni usar silenciosamente el literal histórico. Cualquier valor inicial manual requeriría fuente, fecha y aprobación explícita del equipo.

En una implementación futura deberían verificarse, como mínimo: timeout con dato anterior; error de autenticación; cuota agotada; cuerpo inválido; ausencia de observaciones; dato futuro de UF; revisión de IPV; y arranque sin caché. Son escenarios de aceptación propuestos, no tests ni integración implementados por este spike.

## 8. Recomendación para RutaHogar

| Decisión propuesta | Motivo / alcance |
| --- | --- |
| **Primaria UF: BCCh BDE, `F073.UFF.PRE.Z.D`** | Institución que calcula el indicador; permite trazabilidad por fecha. |
| **Primaria tasa hipotecaria referencial: BCCh BDE, `F022.VIV.TIP.MA03.UF.Z.M`** | Serie específica identificada, con límites de cobertura documentados en §4.3. Uso sujeto a aprobación del supuesto financiero. |
| **Indicador inmobiliario: IPV general BCCh** | Contexto agregado; no usar para revalorizar automáticamente proyectos ni alterar scoring. |
| **Secundaria: CMF v3 para UF** | Canal alternativo documentado; no elimina la dependencia del origen BCCh. No hay reemplazo automático acreditado para tasa/IPV. |
| **Retirar hardcodes en trabajo posterior: UF operativa y tasa base aprobada** | Inventario de §3. Centralizar procedencia y fechas antes de conectar consumidores; conservar fixtures como tales. No reemplazar supuestos de inflación, umbrales o reglas de beneficios por estas series. |
| **Persistir y cachear los valores validados** | UF por día, tasa por mes e IPV por trimestre/versionado; conservar los valores usados históricamente y servir consultas sin dependencia sincrónica de la API. |

Toda presentación mantiene el carácter referencial de RutaHogar: una tasa promedio no constituye oferta bancaria, evaluación individual ni aprobación crediticia.

## 9. Impacto en historias relacionadas

**HU17 vigente — [Reportar leads inconsistentes o fraudulentos](../../Wiki%20RutaHogar/UserStories/HU17-reporte-leads-inconsistentes.md).** El impacto es indirecto: fuente, fecha y versión ayudarían a distinguir una diferencia por parámetros desactualizados de una contradicción declarada por el lead. UF, tasa promedio e IPV no prueban fraude ni verifican sus ingresos o deudas. Se recomienda que un fallo de proveedor o cambio de tasa no genere automáticamente una alerta de fraude, descarte ni cambio de estado. No se implementa HU17 ni se añaden criterios a esa historia.

Existen referencias históricas a HU17 como catálogo; el backlog vigente lo denomina **HU7**. Para evitar ampliar alcance, este documento usa la numeración vigente. HU9 (cotización orientativa), HU10 (matching) y HU18 (escenarios hipotecarios) podrían consumir parámetros con procedencia en trabajos posteriores. No se aprueban dependencias nuevas ni cambios en sus algoritmos o contratos.

## 10. Riesgos / decisiones pendientes del equipo

| Pendiente | Decisión o evidencia requerida |
| --- | --- |
| Revisión del spike | Aprobar recomendación de fuentes y reconciliar numeración E4/E5 del material anterior. |
| Acceso real | Designar cuenta responsable, habilitar BDE y solicitar clave CMF en una tarea posterior; validar extracción, cobertura y condiciones vigentes. No se crearon cuentas aquí. |
| Supuesto hipotecario | Confirmar que cobertura y modalidades de la serie sirven al caso referencial; resolver diferencias entre tasas actuales sin cambiar scoring en este entregable. |
| Operación | Aprobar horarios, timeout, cantidad máxima de reintentos, presupuesto de llamadas y responsable de renovación/alertas. |
| Vigencia | Aprobar margen de publicación y política ante antigüedad prolongada; conservar explícita la continuidad con valor válido y su advertencia. |
| Persistencia e historia | Decidir retención, revisiones y referencia de parámetros por evaluación en el diseño futuro, respetando contratos y reproducibilidad. |
| Respaldo | Aprobar conmutación CMF solo para UF; determinar tratamiento de discrepancias entre proveedores y arranque sin datos. |
| Calidad documental externa | CMF mantiene páginas con fechas antiguas y referencias SBIF; ratificar condiciones al habilitar cuenta. Una ausencia de límite documentado no autoriza uso ilimitado. |

## 11. Fuentes consultadas

Fuentes oficiales consultadas el **2026-09-15**. Los enlaces identifican evidencia documental; no certifican disponibilidad futura del servicio.

- **B1:** [BCCh — Acceso a API BDE](https://si3.bcentral.cl/estadisticas/Principal1/Web_Services/acceso_api.html): cuenta, habilitación y autenticación.
- **B2:** [BCCh — Documentación API BDE](https://si3.bcentral.cl/estadisticas/Principal1/Web_Services/documentacion.html): REST/SOAP, parámetros, formatos y estados.
- **B3:** [BCCh — Ayuda y soporte](https://si3.bcentral.cl/estadisticas/Principal1/Web_Services/ayuda_soporte.html): UF, cuota, token y acceso.
- **B4:** [BCCh — Términos y condiciones](https://si3.bcentral.cl/estadisticas/Principal1/Web_Services/terminos_condiciones.html): atribución y condiciones de uso.
- **B5:** [BDE — Tasa promedio de vivienda en UF](https://si3.bcentral.cl/siete/ES/Siete/Cuadro/CAP_TASA_INTERES/MN_TASA_INTERES_09/TSF_27?idSerie=F022.VIV.TIP.MA03.UF.Z.M): cobertura, unidad, periodicidad, desfase y observación publicada.
- **B6:** [BDE — IPV general](https://si3.bcentral.cl/siete/ES/Siete/Cuadro/CAP_ESTADIST_EXPERIM/MN_EXPERIM01/IS_GENERAL_PROPIEDAD_08?idSerie=F034.IPV.FLU.BCCH.2008.0.T): serie, período, revisión y restricciones.
- **B7:** [BCCh — Cambio de publicación del IPV, 28 de abril de 2023](https://www.bcentral.cl/documents/33528/6454628/ndp-28042023.pdf/03f1adad-4c53-ca5c-89b4-08f3047922fc): calendario trimestral de difusión.
- **C1:** [CMF — Documentación API](https://api.cmfchile.cl/documentacion/index.html): versión, HTTPS y formatos.
- **C2:** [CMF — Recurso UF](https://api.cmfchile.cl/documentacion/UF.html): publicación de tabla, rutas y representación.
- **C3:** [CMF — Uso de API Key](https://api.cmfchile.cl/uso-de-api-key.html): cuota mensual y solicitud de clave.
- **C4:** [CMF — Términos de uso](https://api.cmfchile.cl/terminos-de-uso.html): gratuidad, atribución y posible suspensión.
- **C5:** [CMF — Tasa de Interés Promedio](https://api.cmfchile.cl/documentacion/TIP.html): definición, frecuencia y vigencia.
- **C6:** [CMF — Códigos de error](https://api.cmfchile.cl/api-codigos-de-error.html): tratamiento diferenciado de fallos.

Las fuentes internas están enlazadas junto a cada hallazgo (§1, §3 y §9). Se conservaron identificadores técnicos y referencias históricas; no se efectuó una renumeración general del proyecto.

## 12. Conclusión respecto al cumplimiento de E4

La investigación cubre documentalmente las cinco exigencias mediante la matriz de §5: disponibilidad comprobada al nivel indicado, frecuencia de fuente diferenciada del consumo de RutaHogar, formatos, límites publicados y estrategia ante fallos. Identifica fuentes primarias y secundaria, candidatos a retirar de hardcodes y tratamiento de datos persistidos. Explicita tanto limitaciones semánticas como validaciones operativas pendientes.

El cumplimiento propuesto corresponde al **criterio de investigación del encargo** y queda sujeto a revisión del equipo; no afirma integración terminada ni aceptación formal del Sprint. Solo se crea este documento: **sin cambios de código de producto, frontend, backend, Supabase, scoring, contratos, migraciones o dependencias**.
