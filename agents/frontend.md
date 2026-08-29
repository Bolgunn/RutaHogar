# Frontend — RutaHogar Plataforma Profesional

React 18 + Vite 8 + axios. Sin react-router (ruteo por estado en App.jsx). Sin librería de UI.

RutaHogar ya no es MVP. El frontend debe comunicar una plataforma profesional
de precalificación financiera inmobiliaria. El score es orientativo y explicable:
no aprueba créditos ni reemplaza evaluación bancaria formal. La IA solo redacta
explicaciones; no decide el score.

## Estructura actual

```
frontend/src/
├── components/
│   ├── ScoreForm.jsx         # Formulario principal, POST /score
│   ├── Result.jsx            # Muestra score, clasificación, riesgos
│   ├── AuthPanel.jsx         # Login/registro con Supabase auth
│   ├── DataConsent.jsx       # Consentimiento datos personales
│   ├── Onboarding.jsx        # Captura objetivo inmobiliario inicial
│   ├── ProfilePage.jsx       # Perfil + historial evaluaciones + scoring_history
│   ├── FinancialTracking.jsx # Seguimiento financiero con metas
│   ├── MonthlyPlan.jsx       # Plan mensual de una meta
│   ├── Recommendations.jsx   # Recomendaciones basadas en última evaluación (text + benefit)
│   ├── ObjectiveReview.jsx   # Revisión objetivo inmobiliario
│   ├── Navbar.jsx            # Navegación según rol
│   ├── AdminPanel.jsx        # Vista admin
│   ├── DashboardLeads.jsx    # Dashboard leads para ejecutivos
│   ├── NotificationToast.jsx # Notificación de nuevos leads
│   └── FieldTooltip.jsx      # Tooltips de ayuda en formularios
├── services/
│   ├── auth.js               # getStoredAuth, signIn, signUp, signOut, roles
│   ├── profileService.js     # CRUD perfiles + consent + arco_requests
│   ├── evaluationService.js  # CRUD evaluaciones (normaliza con utils/text)
│   ├── getScoringHistory.js  # Historial inmutable scoring_history
│   ├── goalsService.js       # CRUD metas
│   ├── financialTracking.js  # buildFinancialTracking()
│   ├── recommendationService.js  # Retorna {text, benefit} en recommendations
│   └── monthlyPlanService.js
├── utils/
│   ├── supabase.ts           # Cliente Supabase (null si faltan env vars)
│   ├── text.js               # normalizeDisplayList / normalizeDisplayText
│   ├── phone.js              # formatPhone, normalizePhone, onlyPhoneDigits
│   └── helpers.js            # calculateAge, formatScore, etc.
├── constants/
│   ├── index.js              # plazoLabels, propertyLabels
│   └── comunas.js            # comunasMvp[] (nombre heredado, no renombrar sin tarea explícita)
├── App.jsx                   # Entry point + state machine de páginas
├── main.jsx                  # createRoot(document.getElementById("root"))
└── styles.css                # Único stylesheet
```

## Flujo principal

1. AuthPanel → login/registro (Supabase auth o localStorage)
2. Onboarding → captura comuna + plazo + tipo propiedad
3. DataConsent → acepta consentimiento
4. ScoreForm → POST /score → resultado
5. Result + Recommendations → muestra score, riesgos, plan
6. ProfilePage → historial (evaluations + scoring_history)

## Normalización de texto

`utils/text.js` exporta `normalizeDisplayList` y `normalizeDisplayText`. Se aplican en:
- `evaluationService.js` — al leer evaluaciones desde Supabase (`normalizeEvaluation`) y desde localStorage (`normalizeLocalEvaluation`)
- `App.jsx` — al construir `resultSnapshot` en `handleResult`

Úsalos siempre que muestres datos del backend al usuario.

## Constantes centralizadas

- `constants/index.js`: `plazoLabels` y `propertyLabels` — importados por ObjectiveReview, App, ProfilePage.
- `constants/comunas.js`: `comunasMvp` — lista plana de comunas. Mantener el nombre heredado salvo refactor explícito.
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
| `home` | Hero + Result | cualquiera |
| `onboarding` | Onboarding | user |
| `evaluate` | ScoreForm | user |
| `profile` | ProfilePage | user |
| `tracking` | FinancialTracking | user |
| `monthly-plan` | MonthlyPlan | user |
| `objective-review` | ObjectiveReview | user |
| `recommendations` | Recommendations | user |
| `leads` | DashboardLeads | sales |
| `admin` | AdminPanel | admin |
| `dataconsent` | DataConsent | user |

## Notas

- `formatPhoneDisplay()` en ProfilePage.jsx está definido pero **nunca se llama** — dead code.
- Playwright aparece en `package.json` como dependencia pero no hay tests configurados.
