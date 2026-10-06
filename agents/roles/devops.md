# DevOps — RutaHogar Plataforma Profesional

RutaHogar ya no es MVP. Operar como plataforma profesional de precalificación
financiera inmobiliaria, cuidando secretos, deploy reproducible, trazabilidad,
privacidad y auditoría de scoring.

## Local setup

### Backend (Python 3.10+)
```powershell
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\uvicorn app.main:app --reload --port 8000
```

### Frontend (Node 22 — ver `.nvmrc`)
```powershell
cd frontend
npm install
npm run dev
```

### Tests backend (pytest)
```powershell
cd backend
.venv\Scripts\python -m pytest tests\test_score_professional.py -q
```

### Makefile (WSL / Git Bash)
```bash
make run           # instala deps + corre ambos servidores
make run-backend   # solo backend
make run-frontend  # solo frontend
```

Makefile usa comandos bash: no funciona en PowerShell nativo.

## Variables de entorno

`frontend/.env` — **ninguna es obligatoria** (todo funciona offline con localStorage):
```
VITE_SUPABASE_URL=https://...
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_API_URL=http://127.0.0.1:8000
```

`backend/.env` (opcional, para AI):
```
GROQ_API_KEY=gsk_...
```

`supabase/functions/.env` (secrets para edge functions locales; ver `supabase/functions/.env.example`):
```
RESEND_API_KEY=
FEEDBACK_TO_EMAIL=
FEEDBACK_FROM_EMAIL=RutaHogar <onboarding@resend.dev>
```

## Deploy (Vercel)

1. **Root `vercel.json`** — build frontend + rewrite `/score` → `/api/score`
2. **`backend/vercel.json`** — serverless Python para `/api/score`

Entrypoints serverless: `api/score.py` y `backend/api/index.py` (shims que importan `app.main` con sys.path).

No romper el endpoint `POST /score`, la compatibilidad con localStorage,
Supabase condicional ni Groq. Los cambios de deploy deben preservar historial y
trazabilidad de evaluaciones.

## Edge Functions (Supabase)

En `supabase/functions/`:
- `submit-feedback` — recibe feedback del tester y envía correo vía Resend. Env vars: `RESEND_API_KEY`, `FEEDBACK_TO_EMAIL`, `FEEDBACK_FROM_EMAIL`.
- `notify-admin-arco` — notifica al admin sobre solicitudes ARCO.

## CI/CD

- **`.github/workflows/deploy-supabase-functions.yml`** — despliega las Edge
  Functions (por ahora `submit-feedback`) en push a `main` / `master` /
  `deploy` / `Isaias` cuando cambian `supabase/functions/**`.
- Secrets del workflow: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`,
  `RESEND_API_KEY`, `FEEDBACK_TO_EMAIL`, `FEEDBACK_FROM_EMAIL`.

No hay CI/CD para frontend/backend (deploy Vercel manual).

## Dependencias

- Backend: `fastapi`, `uvicorn[standard]`, `pydantic`, `groq`.
- Frontend: `react`, `react-dom`, `axios`, `react-router-dom` (v6, solo wrapper en main.jsx), `@supabase/supabase-js`, `playwright` (sin tests), `vite` (dev).

## Database (Supabase)

Schema en `supabase/schema.sql`. Ejecutar en SQL Editor de Supabase.

Tablas: `profiles`, `evaluations`, `improvement_goals`, `scoring_history`, `arco_requests`.

Row Level Security activo con políticas por `auth.uid()`. Helper `public.get_my_role()` para consultas cross-user (ejecutivos ven todas las evaluaciones).

## Branch protection

`ruleset.json` — protege `main` y `master`: requiere PR (sin reviewers obligatorios), no permite push directo ni delete.

## Notas

- No hay Docker.
- CI/CD configurado solo para Edge Functions de Supabase (no frontend/backend).
- Tests backend con pytest: `backend/tests/test_score_professional.py`.
- No hay linting ni typecheck.
- El backend no requiere base de datos local (todo vía Supabase HTTP).
- Nunca hardcodear API keys, tokens Supabase, claves Groq ni secrets de correo.
- No imprimir secrets en logs de deploy o workflows.
- No habilitar consultas a datos financieros externos sin consentimiento
  explícito y aprobación de alcance.
