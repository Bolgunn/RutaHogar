# KICKOFF.MD — PROMPT DE DESARROLLO PARA HU8: DETECTOR DE BENEFICIOS HABITACIONALES APLICABLES
<!--
  Este archivo es EFÍMERO y está GITIGNORADO (docs/stories/HU8/KICKOFF.md).
  Funciona como un "paste buffer" (búfer de copiado) autocontenido.
  Copia todo este archivo y pégalo directamente al iniciar una nueva sesión de desarrollo con tu agente de IA.
  REGLA DE ORO: No agregues ninguna regla lógica o de negocio en este archivo que no esté explícitamente detallada en el PLAN.md o en el Engineering Handbook.
-->

## 🤖 INSTRUCCIÓN INICIAL (PROMPT)
> **Actúa como un desarrollador experto del equipo de RutaHogar.**
> Estás iniciando una **sesión de desarrollo completamente nueva y limpia** (Fresh Build Session) para implementar la Historia de Usuario **HU8: Detector de beneficios habitacionales aplicables**.
> Tu objetivo es implementar esta funcionalidad siguiendo de forma estricta e intransigente las reglas arquitectónicas, salvaguardas y normas del proyecto que se detallan a continuación.
> **No asumas, no improvises y no inventes números o umbrales lógicos.** Si encuentras alguna ambigüedad o vacío frente a los algoritmos y criterios obtenidos en el Spike 1, detente de inmediato y repórtalo.

---

## 📋 INFORMACIÓN DE LA HISTORIA DE USUARIO (HU8)
* **ID de la Historia:** HU8 — Detector de beneficios habitacionales aplicables (Applicable Housing Benefits Detector)
* **Rama Git:** `feature/HU8-criterios-E1-E2`
* **Rama Base:** `develop`
* **Puntos de Historia:** 5 SP
* **Documento del Plan de Referencia:** `docs/stories/HU8/PLAN.md`
* **Documento de Algoritmo/Investigación Asociado:** Spike 1 (Investigación de Beneficios Habitacionales y Reglas de Comunicación)

### 1. Descripción de la Funcionalidad
```text
Como lead interesado en comprar una vivienda,
quiero saber si mi perfil podría ser compatible con beneficios habitacionales como subsidios, FOGAES u otros apoyos,
para entender caminos alternativos de financiamiento sin asumir que ya estoy aprobado.
```

### 2. Criterios de Aceptación (Acceptance Criteria)
Debes implementar exactamente los siguientes criterios, asegurando que cada uno sea observable y verificable:
* **E1 — Indicación de ruta de beneficio (Benefit route indication):** Dado que el usuario tiene una evaluación financiera, cuando revise su resultado, entonces el sistema debe indicar si existe una posible ruta de beneficio habitacional aplicable.
* **E2 — Descargo de responsabilidad referencial (Reference disclaimer):** Dado que los beneficios dependen de requisitos externos, cuando se muestre una sugerencia, entonces debe aclararse que es referencial y no garantiza aprobación.

---

## 🏗️ REGLAS DE NEGOCIO (INCORPORANDO SPIKE 1)

El motor de evaluación de la HU8 debe procesar de forma automatizada las condiciones de elegibilidad basadas en los datos declarados en el perfil del lead para sugerir las siguientes rutas:

### A. FOGAES (Fondo de Garantías Especiales - Apoyo a la Vivienda)
* **Valor máximo de la propiedad:** Hasta 4.500 UF.
* **Propiedad previa:** `FALSO` (El usuario no debe ser propietario de una vivienda).
* **Beneficios previos:** `FALSO` (No debe haber recibido subsidios habitacionales estatales con anterioridad).
* **Efecto / Mecánica:** Sugiere que garantiza el 10% del valor de la vivienda, permitiendo financiamiento bancario del 90% (reduciendo el pie exigido al 10%).

### B. Fondo Solidario de Elección de Vivienda (DS49)
* **Edad mínima:** 18 años.
* **Vulnerabilidad (RSH):** El hogar debe pertenecer al 40% más vulnerable según el Registro Social de Hogares.
* **Propiedad previa:** `FALSO` (Ni el postulante, ni cónyuge/conviviente civil ni integrantes del grupo familiar pueden ser dueños de una propiedad).
* **Ahorro mínimo:** 10 UF depositadas en la cuenta de ahorro para la vivienda.
* **Condición familiar:** Debe postular con un grupo familiar conformado en el RSH (`VERDADERO`). Excepciones para postular solo: personas mayores de 60 años, viudos/as, acreditados con discapacidad, calidad indígena o informe Valech.

### C. Programa de Acompañamiento a Deudores Hipotecarios (PADHI)
* **Público objetivo:** Familias con incapacidad financiera para cumplir sus condiciones de crédito hipotecario (morosidad vigente).
* **Beneficio previo:** `VERDADERO`. Exige haber sido beneficiario de un subsidio habitacional para sectores medios y haber complementado con un crédito hipotecario que actualmente presenta morosidad.
* **Comportamiento en HU8:** Se utiliza como criterio de orientación educativa para redirigir a la sección correspondiente en la Academia Financiera si el usuario declara propiedad previa con deuda hipotecaria vigente.

### D. Subsidio Clase Media para Compra de Viviendas (DS1)
* **Antigüedad del ahorro:** La cuenta de ahorro para la vivienda debe tener un mínimo de 12 meses (1 año) de antigüedad.
* **Propiedad previa:** `FALSO` (No ser propietario ni el postulante ni cónyuge/conviviente).
* **Tramos y condiciones (Región Metropolitana y Zona Central):**
  * **Tramo I:**
    * RSH: Hasta el 60% (90% para adultos mayores).
    * Ahorro mínimo: 30 UF.
    * Tope valor vivienda: 1.100 UF.
  * **Tramo II:**
    * RSH: Hasta el 80% (90% para adultos mayores).
    * Ahorro mínimo: 40 UF.
    * Tope valor vivienda: 1.600 UF.
  * **Tramo III:**
    * RSH: Estar inscrito, cumpliendo con el límite de renta líquida máxima fijado por el MINVU.
    * Ahorro mínimo: 80 UF.
    * Tope valor vivienda: 2.200 UF.

### E. Subsidio para Contratos de Arrendamiento con Promesa de Compraventa (Leasing Habitacional)
* **Edad mínima:** 18 años.
* **Registro (RUI):** `VERDADERO`. Debe estar inscrito en el Registro Único de Inscritos del SERVIU.
* **Cuenta de Ahorro específica:** Debe ser titular de una Cuenta de Ahorro para Arrendamiento de Viviendas con Promesa de Compraventa.
* **Propiedad previa:** `FALSO` (Postulante y cónyuge).
* **Beneficios previos:** `FALSO` (No haber sido beneficiario anteriormente de vivienda o subsidio estatal).
* **Condición de contrato:** No tener suscrito más de un contrato de arrendamiento con promesa de compraventa con inmobiliarias.

### F. Subsidio al Dividendo para Adquirir Viviendas Nuevas (Ley N° 21.748)
* **Mecánica Financiera:** Reducción automática de 60 puntos base (0,6%) en la tasa de interés del crédito hipotecario.
* **Tipo de beneficiario:** Persona natural (`VERDADERO`).
* **Tope valor vivienda:** 4.000 UF.
* **Condición del inmueble:** Vivienda `NUEVA` exclusivamente (`vivienda_nueva = VERDADERO`).
* **Vigencia del beneficio:** Parámetro dinámico tratable (vence el 27 de mayo de 2027 o hasta agotar 50.000 cupos).

---

## 📊 MAPEO DE PARÁMETROS TÉCNICOS

Para procesar estas reglas en el backend, utiliza exclusivamente el siguiente mapeo de parámetros acordado en el Spike 1 (sin hardcodear valores en la lógica pura):

| Parámetro | Tipo | Origen del dato |
| :--- | :--- | :--- |
| `propiedad_previa` | boolean | Formulario lead |
| `beneficio_previo` | boolean | Formulario lead |
| `edad` | integer | Formulario lead / RUT |
| `rsh_tramo` | enum (%) | Consulta RSH (Opcional, autoinformado) |
| `ahorro_uf` | decimal | Formulario lead |
| `ahorro_antiguedad_meses` | integer | Formulario lead |
| `valor_propiedad_uf` | decimal | Formulario lead / Proyecto |
| `vivienda_nueva` | boolean | Formulario lead / Proyecto |
| `registro_rui` | boolean | Consulta SERVIU (Opcional, autoinformado) |
| `deuda_hipotecaria_vigente` | boolean | Formulario lead |
| `uf_valor_actual` | decimal | Constante / API externa (mindicador.cl) |

---

## 🔒 SALVAGUARDAS Y REGLAS DE COMUNICACIÓN (ÉTICA Y UX)

Debes alinear estrictamente la interfaz y los textos de la HU8 a las directrices éticas y legales del manual de ingeniería:

1. **Lenguaje Condicional Obligatorio (UX/UI):**
   * **TÉRMINOS PROHIBIDOS:** "Aprobado", "Eres beneficiario", "Crédito garantizado", o cualquier derivado que asegure la obtención del beneficio.
   * **TÉRMINOS PERMITIDOS:** "Perfil compatible", "Podrías calificar para", "Cumples con los requisitos iniciales", "Resultado referencial".
2. **Descargo de Responsabilidad Visible (Disclaimer):**
   * Cada vez que se muestre una ruta de beneficio sugerida, es un requisito estricto y no negociable mostrar de forma visible el siguiente texto:
     > *"La información es estrictamente referencial, no garantiza la obtención del subsidio o beneficio, y no reemplaza la evaluación oficial de las entidades bancarias o del MINVU."*
3. **Enlaces a la Academia Financiera:**
   * Al mostrar una sugerencia compatible, debes incluir un enlace de acceso directo al módulo de educación correspondiente (Academia RutaHogar) para guiar al usuario en los pasos siguientes.

---

## 🏗️ ARQUITECTURA Y UBICACIÓN DE ARCHIVOS
* **Lógica pura de evaluación (Backend):** Toda la lógica condicional que compara los parámetros del usuario con los beneficios debe estar desacoplada en el backend en `backend/app/scoring_engine/benefits_detector.py`.
* **Parámetros y topes financieros:** Todos los valores numéricos de los subsidios (los topes de 4500 UF, 1100 UF, 1600 UF, 2200 UF, los montos de ahorro, etc.) deben estar centralizados exclusivamente en `backend/app/scoring_engine/constants.py`. **Prohibido hardcodear números en funciones lógicas.**
* **Lógica del Frontend:** En `src/lib/` para lógica pura y `src/features/benefits/` para componentes y vistas de la HU8.
* **Regla de Importación:** Recuerda que `src/features/benefits/` no debe importar elementos de otras features del frontend.

---

## 🧪 ESTRATEGIA DE VERIFICACIÓN Y PRUEBAS
1. **Pruebas Backend (pytest):**
   * Implementa pruebas automatizadas en `backend/tests/test_benefits_detector.py` que validen cada uno de los subsidios basándose en combinaciones específicas de inputs lógicos (ej: un perfil sin propiedad previa, con 30 UF de ahorro y un valor de propiedad de 1000 UF debe clasificar para el Tramo I del DS1).
2. **Pruebas Frontend (vitest):**
   * Valida unitariamente en `src/lib/` la correcta resolución del disclaimer y los enlaces según el tipo de subsidio.
3. **Pruebas End-to-End (Playwright Journeys):**
   * Valida que el flujo de revisión de resultados despliegue correctamente la sugerencia, el descargo de responsabilidad visible, y que el enlace a la Academia funcione sin errores.

---

## ✅ CHECKLIST DE DEFINICIÓN DE TERMINADO (DoD) PARA ESTA HISTORIA
- [ ] El detector de beneficios evalúa correctamente FOGAES, DS49, PADHI, DS1, Leasing Habitacional y la Ley N° 21.748 en base a los parámetros autoinformados del lead.
- [ ] Todos los umbrales numéricos de los beneficios están centralizados en `backend/app/constants.py`.
- [ ] El disclaimer de responsabilidad obligatorio se muestra visiblemente en pantalla ante cualquier sugerencia de beneficio.
- [ ] El vocabulario del dominio se escribe en Español ("vivienda_nueva", "propiedad_previa", etc.) y la lógica general en Inglés.
- [ ] Cada sugerencia incluye un enlace contextual directo a la Academia Financiera.
- [ ] No se utiliza ningún término prohibido como "Aprobado" o "Crédito garantizado".
- [ ] Se incluyeron las pruebas automáticas asociadas (`pytest` para lógica de backend y `vitest`/`Playwright` para frontend).
