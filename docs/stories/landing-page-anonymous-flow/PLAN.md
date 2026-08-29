# Plan de Implementación — Landing Page + Flujo Anónimo

**Fecha:** 2026-06-11  
**Estado:** Aprobado — pendiente de implementación

---

## Contexto

Feedback recibido: la plataforma orientada al "Usuario" no explica su propósito y genera baja adopción. Se rediseña el punto de entrada para incluir una landing page pública y un flujo de evaluación sin requerir registro previo.

---

## Orden de implementación

**Paso 1 — Diseño (ui-ux-pro-max):** invocar el skill con el brief de diseño para producir `LandingPage.jsx` antes de escribir código.

**Paso 2 — Código:** implementar todos los componentes desde el output del diseño.

---

## Brief para ui-ux-pro-max

| Parámetro | Valor |
| :-- | :-- |
| Dirección visual | Trustworthy fintech |
| Layout | Full-width, fuera de `.app-shell`, CSS propio |
| Viewport | Mobile-first, escala a desktop |
| Paleta | `#172033` hero bg, `#246354` acento primario, `#eef3f8` secciones claras, tarjetas blancas |
| Tipografía | Inter (ya cargada) |
| Logo | `frontend/public/Logo ScoreLeads.png` en navbar |
| Sección EI | Solo tratamiento tipográfico, sin logo |

### 7 secciones a diseñar

1. **Hero** — fondo oscuro (`#172033`), logo arriba izquierda, "Iniciar sesión" arriba derecha, titular grande, subtítulo, CTA primario "Evalúa tu perfil gratis", ilustración de score/gauge
2. **Cómo funciona** — fondo claro, flujo horizontal de 3 pasos con íconos
3. **Por qué ScoreLeads** — grilla de value props (rápido, sin documentos, orientativo, respaldado)
4. **Para quién es** — layout dividido, dirigido al comprador de primera vivienda
5. **FAQs** — acordeón, ~5 preguntas
6. **Respaldo EI** — trust badge tipográfico, centrado
7. **Footer** — minimal, nota legal, links

---

## Archivos nuevos

| Archivo | Propósito |
| :-- | :-- |
| `frontend/src/components/LandingPage.jsx` | Landing pública (diseñada por ui-ux-pro-max) |
| `frontend/src/components/AnonHeader.jsx` | Header mínimo para el flujo anónimo (logo + link login) |
| `frontend/src/components/SignupOffer.jsx` | Página de conversión post-score |

---

## Archivos modificados

| Archivo | Cambio |
| :-- | :-- |
| `frontend/src/App.jsx` | `"landing"` como default cuando `!profile`; estado `anonOnboarding` + `anonResult` + sessionStorage; `handleResult` anónimo (sin escritura a Supabase, siempre rutea a `"signup-offer"`); handler de sign-up (crea cuenta → guarda eval → `prependEvaluation` → notifica ejecutivo si Alto → `setPage("recommendations")`); recuperación ante fallo de guardado |
| `frontend/src/components/Onboarding.jsx` | Paso de DataConsent al final para usuarios anónimos (alcance: solo procesamiento para scoring) |
| `frontend/src/components/ScoreForm.jsx` | Campo de fecha de nacimiento renderizado solo cuando el prop `birthDate` está ausente |
| `frontend/src/components/AuthPanel.jsx` | Extraer lógica del formulario de sign-up para reutilizar en `SignupOffer` |

---

## Flujo anónimo completo

```
landing
  → onboarding (+ consentimiento "procesar para scoring" al final)
  → evaluate (campo fecha nacimiento para anónimos; sin escritura a Supabase)
  → signup-offer (score mostrado sin importar clasificación)
      → sign-up + DataConsent para almacenamiento permanente
          → evaluación guardada → notificar ejecutivo si Alto → recommendations
      → "Continuar sin cuenta" → landing (sessionStorage limpiado)
```

---

## Consentimiento en dos etapas

| Etapa | Dónde | Alcance |
| :-- | :-- | :-- |
| 1 | Final de Onboarding (anónimo) | "Acepto que mis datos sean procesados para calcular mi score — no se almacenan permanentemente" |
| 2 | Formulario de sign-up en SignupOffer | Componente `DataConsent` existente — bloquea creación de cuenta hasta aceptar; cubre almacenamiento permanente |

---

## Página SignupOffer

1. **Tarjeta de resumen de score** — número + clasificación (copy varía por Alto/Medio/Bajo)
2. **Bloque de beneficios** — enfocado en conversión: historial de evaluaciones, plan de mejora personalizado, seguimiento financiero, notificaciones de progreso
3. **Formulario de sign-up** — nombre, email, contraseña
4. **DataConsent embebido** — bloquea envío hasta aceptar
5. **"Continuar sin cuenta"** — limpia sessionStorage, vuelve a landing

---

## Seguridad de datos anónimos

- `anonResult` + `anonOnboarding` persistidos en `sessionStorage` durante el flujo anónimo
- Se limpian al crear cuenta o al usar "Continuar sin cuenta"
- Si `createEvaluation()` falla post sign-up: mantener al usuario en `signup-offer`, mostrar error + botón "Reintentar" (la sesión ya está activa, el reintento es seguro)

---

## Notificación al ejecutivo

- Solo se dispara después de crear cuenta + evaluación persistida en Supabase
- Leads Alto anónimos no generan notificación (sin datos de contacto disponibles)

---

## Restricciones y guardrails

- No se persiste ningún dato en Supabase para usuarios que no crean cuenta (cumple E3 de HdU1)
- El campo "número de dependientes" (HdU1 E1) queda fuera del alcance de este plan
- No se modifica el contrato de `POST /score`
- No se agrega React Router — se mantiene el patrón de estado `page` existente
- La landing page usa layout full-width propio, no hereda `.app-shell`
