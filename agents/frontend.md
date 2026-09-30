# Frontend — RutaHogar Plataforma Profesional

React 18 + Vite 8 + axios. Sin librería de UI. react-router-dom v6 está instalado
(`main.jsx` envuelve App con `<BrowserRouter>`), pero el ruteo real es por estado
(`page` en `App.jsx`).

RutaHogar ya no es MVP. El frontend debe comunicar una plataforma profesional
de precalificación financiera inmobiliaria. El score es orientativo y explicable:
no aprueba créditos ni reemplaza evaluación bancaria formal. La IA solo redacta
explicaciones; no decide el score.

## Estructura actual

```
frontend/src/
├── components/
│   ├── AcademiaFinanciera.jsx  # Academia Financiera (página `academia`)
│   ├── AdminArcoRequests.jsx   # Gestión de solicitudes ARCO para admin
│   ├── AdminPanel.jsx          # Vista admin
│   ├── AnonHeader.jsx          # Cabecera del flujo anónimo
│   ├── AuthPanel.jsx           # Login/registro con Supabase auth
│   ├── DashboardLeads.jsx      # Dashboard leads para ejecutivos
│   ├── DataConsent.jsx         # Consentimiento datos personales
│   ├── FieldTooltip.jsx        # Tooltips de ayuda en formularios
│   ├── FinancialTracking.jsx   # Seguimiento financiero (metas, hitos, plan ahorro)
│   ├── GlossaryTerm.jsx        # Término con glosario/tooltip
│   ├── HousingSavingsPlan.jsx  # Plan de ahorro vivienda (página `housing-plan`)
│   ├── LandingPage.jsx         # Landing pública
│   ├── MonthlyPlan.jsx         # Plan mensual de una meta
│   ├── Navbar.jsx              # Navegación según rol
│   ├── NotificationToast.jsx   # Notificación de nuevos leads
│   ├── ObjectiveReview.jsx     # Revisión objetivo inmobiliario
│   ├── Onboarding.jsx          # Captura objetivo inmobiliario inicial
│   ├── ProfilePage.jsx         # Perfil + historial evaluaciones + scoring_history
│   ├── Recommendations.jsx     # Recomendaciones basadas en última evaluación (text + benefit)
│   ├── RegisterMilestone.jsx   # Registro de hitos (página `register-milestone`)
│   ├── Result.jsx              # Muestra score, clasificación, riesgos
│   ├── ScoreForm.jsx           # Formulario principal, POST /score
│   └── SignupOffer.jsx         # Oferta de registro tras evaluación anónima
├── services/
│   ├── arcoService.js              # Consultas ARCO (formulario/estado)
│   ├── auth.js                     # getStoredAuth, signIn, signUp, signOut, roles
│   ├── evaluationService.js        # CRUD evaluaciones (normaliza con utils/text)
│   ├── feedbackService.js          # Envía feedback (edge function submit-feedback)
│   ├── financialTracking.js        # buildFinancialTracking()
│   ├── getScoringHistory.js        # Historial inmutable scoring_history
│   ├── goalsService.js             # CRUD metas
│   ├── housingSavingsPlanService.js # Plan de ahorro vivienda
│   ├── moneyFormat.js              # Formato CLP/UF
│   ├── monthlyPlanService.js       # Plan mensual de meta
│   ├── monthTimeline.js            # Timeline mensual del plan
│   ├── profileService.js           # CRUD perfiles + consent + arco_requests
│   ├── realtimeService.js          # Suscripciones realtime (leads nuevos)
│   └── recommendationService.js    # Retorna {text, benefit} en recommendations
├── utils/
│   ├── supabase.ts           # Cliente Supabase (null si faltan env vars)
│   ├── text.js               # normalizeDisplayList / normalizeDisplayText
│   ├── phone.js              # formatPhone, normalizePhone, onlyPhoneDigits
│   └── helpers.js            # calculateAge, formatScore, etc.
├── constants/
│   ├── index.js              # plazoLabels, propertyLabels
│   ├── comunas.js            # comunasMvp[] (nombre heredado, no renombrar sin tarea explícita)
│   └── academyContent.js     # Contenido de Academia Financiera
├── App.jsx                   # Entry point + state machine de páginas
├── main.jsx                  # createRoot + <BrowserRouter> wrapper
└── styles.css                # Único stylesheet
```

## Flujo principal

1. AuthPanel → login/registro (Supabase auth o localStorage)
2. Onboarding → captura comuna + plazo + tipo propiedad
3. DataConsent → acepta consentimiento
4. ScoreForm → POST /score → resultado
5. Result + Recommendations → muestra score, riesgos, plan
6. ProfilePage → historial (evaluations + scoring_history)

## Flujo anónimo

1. `landing` (LandingPage) → CTA "evalúa gratis"
2. `anon-onboarding` → objetivo, comuna y plazo
3. `anon-evaluate` → ScoreForm anónimo → resultado
4. `signup-offer` → ofrece registrar para guardar el resultado y continuar
5. Registro → flujo normal (`home`)

## Otras páginas nuevas

- `housing-plan` (HousingSavingsPlan): plan de ahorro para el pie, con servicio `housingSavingsPlanService.js`.
- `register-milestone` (RegisterMilestone): registro de hitos financieros ligado a FinancialTracking.
- `academia` (AcademiaFinanciera): contenido educativo desde `constants/academyContent.js`.
- `admin`: incluye AdminPanel + AdminArcoRequests (gestión de solicitudes ARCO).
- `tracking` (FinancialTracking): metas, hitos y acceso al plan de ahorro.

## Normalización de texto

`utils/text.js` exporta `normalizeDisplayList` y `normalizeDisplayText`. Se aplican en:
- `evaluationService.js` — al leer evaluaciones desde Supabase (`normalizeEvaluation`) y desde localStorage (`normalizeLocalEvaluation`)
- `App.jsx` — al construir `resultSnapshot` en `handleResult`

Úsalos siempre que muestres datos del backend al usuario.

## Constantes centralizadas

- `constants/index.js`: `plazoLabels` y `propertyLabels` — importados por ObjectiveReview, App, ProfilePage.
- `constants/comunas.js`: `comunasMvp` — lista plana de comunas. Mantener el nombre heredado salvo refactor explícito.
- `constants/academyContent.js`: módulos de Academia Financiera.
- No duplicar labels inline; importar desde constants.

## Evolución de vistas financieras

Preparar nuevas vistas o extensiones sin romper el flujo actual:

- Score financiero: desglose por componentes ponderados y versión del algoritmo.
- Bloqueador principal: razón dominante que impide avanzar o exige preparación.
- Project fit: compatibilidad entre comuna, tipo de propiedad, plazo, valor y
  capacidad financiera.
- Prioridad comercial: señal para ejecutivos separada del score financiero.
- Historial versionado: comparar evaluaciones por `algorithm_version`,
  componentes, bloqueadores y textos generados.

Mantener el contrato de `POST /score`, el fallback localStorage, Supabase
condicional y la integración Groq. No hardcodear API keys ni consultar datos
financieros externos sin consentimiento explícito.

## Páginas (estado `page`)

| page | Componente | Rol |
|------|-----------|-----|
| `landing` | LandingPage | cualquiera |
| `auth` | AuthPanel | cualquiera |
| `anon-onboarding` | Onboarding (anónimo) | anónimo |
| `anon-evaluate` | ScoreForm (anónimo) | anónimo |
| `signup-offer` | SignupOffer | anónimo |
| `home` | Hero + Result | cualquiera |
| `onboarding` | Onboarding | user |
| `dataconsent` | DataConsent | user |
| `evaluate` | ScoreForm | user |
| `profile` | ProfilePage | user |
| `tracking` | FinancialTracking | user |
| `monthly-plan` | MonthlyPlan | user |
| `housing-plan` | HousingSavingsPlan | user |
| `register-milestone` | RegisterMilestone | user |
| `objective-review` | ObjectiveReview | user |
| `recommendations` | Recommendations | user |
| `academia` | AcademiaFinanciera | cualquiera |
| `leads` | DashboardLeads | sales |
| `admin` | AdminPanel + AdminArcoRequests | admin |

## Notas

- `formatPhoneDisplay()` en ProfilePage.jsx está definido pero **nunca se llama** — dead code.
- Playwright aparece en `package.json` como dependencia pero no hay tests frontend configurados. El backend sí tiene tests pytest (`backend/tests/test_score_professional.py`).
