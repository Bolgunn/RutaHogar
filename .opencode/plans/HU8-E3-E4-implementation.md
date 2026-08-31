# Plan de implementación: E3 + E4 — Cápsulas Academy + Deep-link

## Archivos a modificar

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | `frontend/src/constants/academyContent.js` | +6 artículos cápsula + `ACADEMY_BENEFIT_CAPSULES` |
| 2 | `frontend/src/components/AcademiaFinanciera.jsx` | Prop `initialArticleId` + useEffect |
| 3 | `frontend/src/App.jsx` | Pasar `articleId` al navegar a academia |
| 4 | `frontend/src/components/SimulacionBeneficios.jsx` | Deep-link con `ACADEMY_BENEFIT_CAPSULES` |
| 5 | `frontend/src/components/Recommendations.jsx` | Link a cápsula en teaser |
| 6 | `backend/app/scoring_engine/housing_benefits.py` | Sin cambios (E3 ya cubierto) |
| 7 | Tests | Verificar articles + mapping |

---

## Paso 1 + 2: `academyContent.js` — Cápsulas + Mapping

### Nuevos artículos en `ACADEMY_ARTICLES` (después de `vivienda-3`)

```js
{
  id: "subsidios-fogaes",
  topic: "subsidios",
  title: "FOGAES: financiamiento para vivienda nueva",
  summary: "Qué es FOGAES, quién puede postular y cómo esta garantía estatal facilita el acceso a un crédito hipotecario con menor pie.",
  level: "Básico",
  minutes: 4,
  tags: ["subsidio", "pie", "vivienda"],
  body:
    "FOGAES (Fondo de Garantías para Empresas de Seguros) es un sistema de garantías estatales diseñado para facilitar el acceso a crédito hipotecario. Su objetivo es que más personas puedan financiar una vivienda nueva con un pie más bajo del que los bancos usualmente exigen.\n\nCómo funciona: el Estado respalda parcialmente el crédito, lo que reduce el riesgo para el banco y permite ofrecer mejores condiciones al solicitante. Esto significa que puedes acceder a un crédito hipotecario con un pie mínimo del 10%, cuando normalmente los bancos piden entre 15% y 20%.\n\nRequisitos principales: la vivienda debe ser nueva (no usada), el valor de la propiedad no puede exceder las 4.000 UF, y debes contar con un pie mínimo equivalente al 10% del valor de la propiedad. El banco evaluará también tu renta, continuidad laboral y comportamiento de pago.\n\nDónde postular: los bancos adheridos al sistema FOGAES. Puedes consultar la lista de entidades autorizadas en el sitio oficial de FOGAES o preguntar directamente en tu banco.\n\nRecuerda: esta información es referencial. La aprobación final depende de la evaluación bancaria formal.",
},
{
  id: "subsidios-ds49",
  topic: "subsidios",
  title: "DS49: Fondo Solidario de Elección de Vivienda",
  summary: "El subsidio estatal para familias en situación de vulnerabilidad que buscan su primera vivienda.",
  level: "Básico",
  minutes: 4,
  tags: ["subsidio", "vivienda"],
  body:
    "El DS49 (Decreto Supremo 49) es el Fondo Solidario de Elección de Vivienda, un subsidio estatal no reembolsable dirigido a familias en situación de vulnerabilidad socioeconómica.\n\nQuién puede postular: personas mayores de 18 años, inscritas en el Registro Social de Hogares (RSH) con un tramo de vulnerabilidad de hasta el 40% (o hasta el 100% si eres adulto mayor de 60 años), que no sean propietarias de otra vivienda, que cuenten con un ahorro mínimo de 10 UF en una cuenta de ahorro para la vivienda, y que postulen con un grupo familiar acreditado.\n\nEl monto del subsidio varía según el tramo de vulnerabilidad y la zona geográfica. Es un aporte estatal directo que reduce el monto que necesitas financiar con crédito.\n\nProceso de postulación: se realiza a través del SERVIU (Servicio de Vivienda y Urbanismo). Es importante reunir la documentación requerida (certificado de RSH, comprobante de ahorro, certificado de grupo familiar) antes de iniciar el proceso.\n\nRecuerda: esta información es referencial. La aprobación final depende de la evaluación del SERVIU.",
},
{
  id: "subsidios-padhi",
  topic: "subsidios",
  title: "PADHI: Acompañamiento a Deudores Hipotecarios",
  summary: "Programa de orientación para personas con deuda hipotecaria vigente que fueron beneficiarias previas de subsidios.",
  level: "Intermedio",
  minutes: 3,
  tags: ["subsidio", "morosidad"],
  body:
    "PADHI (Programa de Acompañamiento a Deudores Hipotecarios) no es un subsidio nuevo, sino un programa de orientación y acompañamiento para personas que ya tienen una deuda hipotecaria vigente y que anteriormente fueron beneficiarias de un subsidio habitacional.\n\nQuién puede acceder: debes contar con una deuda hipotecaria activa y haber sido beneficiario previo de un subsidio habitacional (como DS49, DS1 u otro programa similar).\n\nQué ofrece el programa: orientación financiera para reestructurar deudas, asesoría sobre opciones de pago, y acompañamiento durante el proceso de normalización de la deuda. El objetivo es ayudarte a salir de la morosidad y recuperar la estabilidad financiera.\n\nEste programa es parte del conjunto de herramientas que el Estado ofrece para proteger a las familias que ya accedieron a una vivienda con apoyo estatal.\n\nSi no cumples con los requisitos de PADHI pero tienes deuda hipotecaria, te recomendamos revisar la sección de Crédito Hipotecario en la Academia Financiera para entender tus opciones.\n\nRecuerda: esta información es referencial. El acceso al programa depende de la entidad administradora.",
},
{
  id: "subsidios-ds1",
  topic: "subsidios",
  title: "DS1: Subsidio Clase Media para compra de vivienda",
  summary: "El subsidio para la clase media que busca facilitar la compra de una primera vivienda con ahorro previo.",
  level: "Intermedio",
  minutes: 4,
  tags: ["subsidio", "ahorro", "vivienda"],
  body:
    "El DS1 (Decreto Supremo 1) es el Subsidio Clase Media para Compra de Viviendas, dirigido a personas que desean adquirir su primera vivienda y que cuentan con un ahorro acumulado.\n\nEl subsidio se organiza en tres tramos, cada uno con requisitos distintos de ahorro, valor de propiedad y tramo RSH:\n\nTramo I: ahorro mínimo de 30 UF, valor de propiedad hasta 1.100 UF, RSH hasta el 60% (o hasta 90% si eres adulto mayor).\n\nTramo II: ahorro mínimo de 40 UF, valor de propiedad hasta 1.600 UF, RSH hasta el 80% (o hasta 90% si eres adulto mayor).\n\nTramo III: ahorro mínimo de 80 UF, valor de propiedad hasta 2.200 UF, con inscripción en el RSH.\n\nRequisitos comunes: no ser propietario de otra vivienda, contar con antigüedad mínima de 12 meses en la cuenta de ahorro para la vivienda, y cumplir con los requisitos del tramo al que postulas.\n\nEl monto del subsidio varía según el tramo y se entrega como aporte estatal no reembolsable que complementa tu pie o reduce el monto del crédito.\n\nRecuerda: esta información es referencial. La aprobación final depende de la evaluación del SERVIU.",
},
{
  id: "subsidios-leasing",
  topic: "subsidios",
  title: "Leasing Habitacional: arrendamiento con promesa de compraventa",
  summary: "Una alternativa al crédito hipotecario que te permite arrendar una vivienda con la opción de comprarla eventualmente.",
  level: "Intermedio",
  minutes: 3,
  tags: ["subsidio", "vivienda"],
  body:
    "El Leasing Habitacional es un subsidio que funciona como arrendamiento con promesa de compraventa de vivienda. En lugar de obtener un crédito hipotecario convencional, arriendas la vivienda con la opción de comprarla en el futuro.\n\nCómo funciona: pagas una cuota mensual por el arrendamiento, y una parte de esa cuota se acumula como descuento del precio de compra. Al final del plazo, tienes la opción de comprar la vivienda con el descuento acumulado.\n\nRequisitos: ser mayor de 18 años, estar inscrito en el Registro Único de Inscritos (RUI), no ser propietario de otra vivienda, y no haber sido beneficiario previo de un subsidio habitacional.\n\nVentajas: es una alternativa para quienes no califican para un crédito hipotecario convencional pero tienen la capacidad de pagar una cuota mensual. También permite acumular ahorro para el pie mientras habitas la vivienda.\n\nEl leasing habitacional es gestionado por entidades autorizadas por el Estado. Consulta las opciones disponibles en tu zona.\n\nRecuerda: esta información es referencial. Las condiciones específicas dependen de la entidad administradora.",
},
{
  id: "subsidios-ley21748",
  topic: "subsidios",
  title: "Ley 21.748: reducción de tasa para vivienda nueva",
  summary: "Beneficio que reduce la tasa de interés en 0.60 puntos porcentuales para créditos de vivienda nueva.",
  level: "Básico",
  minutes: 3,
  tags: ["subsidio", "tasa", "vivienda"],
  body:
    "La Ley N° 21.748 establece una reducción de la tasa de interés de 0.60 puntos porcentuales para créditos hipotecarios destinados a la compra de vivienda nueva.\n\nQué significa en la práctica: si tu tasa de interés es de, por ejemplo, 3.50%, con la Ley 21.748 pasaría a 2.90%. Esto reduce directamente tu dividendo mensual durante toda la vida del crédito, lo que puede representar un ahorro significativo.\n\nRequisitos: la vivienda debe ser nueva (no usada), debes ser persona natural (no empresa), y el valor de la propiedad no puede exceder las 4.000 UF.\n\nCómo se aplica: el banco aplica la reducción automáticamente cuando el crédito cumple con los requisitos de la ley. No necesitas realizar un trámite adicional; el banco verifica que la vivienda sea nueva y que el valor esté dentro del tope.\n\nEste beneficio es acumulable con otros subsidios habitacionales, lo que puede mejorar significativamente las condiciones de tu crédito.\n\nRecuerda: esta información es referencial. La aplicación efectiva de la reducción depende de la entidad bancaria.",
},
```

### Nuevo export después de `ACADEMY_ARTICLES`

```js
// Mapeo academy_module (backend) → articleId (frontend) para deep-link
// desde tarjetas de beneficios directamente a la cápsula educativa.
export const ACADEMY_BENEFIT_CAPSULES = {
  fogaes: "subsidios-fogaes",
  ds49: "subsidios-ds49",
  padhi: "subsidios-padhi",
  ds1: "subsidios-ds1",
  leasing: "subsidios-leasing",
  ley_21748: "subsidios-ley21748",
};
```

---

## Paso 3: `AcademiaFinanciera.jsx` — Prop `initialArticleId`

Cambiar la firma del componente principal:

```jsx
// Antes:
export default function AcademiaFinanciera({ evaluation, onStartEvaluation, onNavigate }) {

// Después:
export default function AcademiaFinanciera({ evaluation, onStartEvaluation, onNavigate, initialArticleId }) {
```

Cambiar el useState:

```jsx
// Antes:
const [openArticleId, setOpenArticleId] = useState(null);

// Después:
const [openArticleId, setOpenArticleId] = useState(initialArticleId || null);
```

Agregar useEffect para sincronizar:

```jsx
import React, { useMemo, useState, useEffect } from "react";

// Después del useState:
useEffect(() => {
  if (initialArticleId) setOpenArticleId(initialArticleId);
}, [initialArticleId]);
```

---

## Paso 4: `App.jsx` — Pasar `initialArticleId`

En el rendering de `AcademiaFinanciera` (aprox línea 1478):

```jsx
// Antes:
page === "academia" && profile.role === roles.user ? (
  <AcademiaFinanciera evaluation={currentEvaluation} onStartEvaluation={startEvaluation} onNavigate={navigateToPage} />
)

// Después — buscar en el state de navegación si hay un articleId:
page === "academia" && profile.role === roles.user ? (
  <AcademiaFinanciera
    evaluation={currentEvaluation}
    onStartEvaluation={startEvaluation}
    onNavigate={navigateToPage}
    initialArticleId={navigationState?.articleId}
  />
)
```

Nota: revisar cómo `App.jsx` maneja el state de navegación (`navigateToPage`) para pass-through del articleId. Puede que se use un objeto state o parámetros separados.

---

## Paso 5: `SimulacionBeneficios.jsx` — Deep-link

```jsx
// Agregar import:
import { ACADEMY_BENEFIT_CAPSULES } from "../constants/academyContent";

// Reemplazar openAcademy:
const openBenefitCapsule = (academyModule) => {
  const articleId = ACADEMY_BENEFIT_CAPSULES[academyModule];
  onNavigate?.("academia", { articleId });
};

// En los botones:
// Botón "Ver pasos en la Academia Financiera" (beneficio elegible):
<button
  type="button"
  className="primary-button"
  onClick={() => openBenefitCapsule(benefit.academy_module)}
>
  Ver pasos en la Academia Financiera
</button>

// Botón "Descubre cómo cumplir este requisito" (beneficio no elegible):
<button
  type="button"
  className="text-button"
  onClick={() => openBenefitCapsule(benefit.academy_module)}
>
  Descubre cómo cumplir este requisito en nuestra Academia Financiera
</button>
```

---

## Paso 6: `Recommendations.jsx` — Link en teaser

```jsx
// Importar:
import { ACADEMY_BENEFIT_CAPSULES } from "../constants/academyContent";

// En el teaser (líneas 185-195), agregar botón de cápsula:
{data.housing_benefits?.applicable_benefits?.length > 0 && (
  <div className="simulation-teaser" ...>
    <strong>Simulación de beneficios habitacionales</strong>
    <p ...>
      Descubre qué beneficios como FOGAES, DS49, DS1 o Ley 21.748 podrían ser compatibles con tu perfil.
    </p>
    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
      <button type="button" className="secondary-button" onClick={() => onNavigate?.("simulacion")}>
        Ver simulación completa
      </button>
      {data.housing_benefits.applicable_benefits
        .filter((b) => b.eligible)
        .slice(0, 1)
        .map((b) => {
          const capsuleId = ACADEMY_BENEFIT_CAPSULES[b.academy_module];
          return capsuleId ? (
            <button
              key={b.type}
              type="button"
              className="text-button"
              onClick={() => onNavigate?.("academia", { articleId: capsuleId })}
            >
              Explorar cápsula: {b.name}
            </button>
          ) : null;
        })}
    </div>
  </div>
)}
```

---

## Paso 7: Backend — E3 ya cubierto

Sin cambios en `housing_benefits.py`. Los detectores ya cruzan parámetros de vivienda objetivo donde la regulación lo exige. Las anotaciones `*E3 check*` en el PLAN.md documentan esto.

---

## Paso 8: Tests

### Test de artículos cápsula (nuevo archivo o en existente)

```python
# Verificar que los 6 article IDs existen
BENEFIT_CAPSULE_ARTICLES = [
    "subsidios-fogaes",
    "subsidios-ds49",
    "subsidios-padhi",
    "subsidios-ds1",
    "subsidios-leasing",
    "subsidios-ley21748",
]

# Verificar que ACADEMY_BENEFIT_CAPSULES tiene todos los academy_module conocidos
KNOWN_MODULES = ["fogaes", "ds49", "padhi", "ds1", "leasing", "ley_21748"]
```

### Frontend test (si existe vitest)

Verificar que:
1. `ACADEMY_BENEFIT_CAPSULES` tiene 6 entries
2. Cada value es un articleId que existe en `ACADEMY_ARTICLES`
3. `SimulacionBeneficios` renderiza links con los articleIds correctos
