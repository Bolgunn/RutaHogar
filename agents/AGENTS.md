# RutaHogar — Plataforma Profesional

Referencia detallada: `.claude/CLAUDE.md` (fuente más completa del repo).

RutaHogar ya no debe tratarse como MVP. Documentar y construir como plataforma
profesional de precalificación financiera inmobiliaria, con scoring explicable,
reglas versionadas, trazabilidad, privacidad, priorización comercial y plan de
mejora financiero.

El sistema no aprueba créditos ni reemplaza evaluación bancaria formal. El score
es orientativo, explicable y calculado por reglas auditables. La IA no decide el
score: solo redacta explicaciones, resúmenes y guías comerciales a partir del
resultado.

## Stack

| Frontend | Backend | DB/Auth | Deploy | AI |
|----------|---------|---------|--------|----|
| React 18 + Vite 8 + axios | FastAPI + Pydantic v2 | Supabase (PostgreSQL, RLS) | Vercel SPA + serverless Python | Groq (llama-3.1-8b-instant) live |

## Arquitectura clave (no obvio desde los nombres)

- **No hay react-router**: el ruteo es por estado (`page` en `App.jsx`). Navegar: `setPage("nombre")`, ir a evaluar usa `startEvaluation()`.
- **Supabase es condicional**: sin env vars todo funciona con localStorage. `isSupabaseDataConfigured` controla cada servicio.
- **Scoring**: `calculate_score()` en `scoring.py`, base 50, clamped [0,100]. ≥70 Alto, ≥40 Medio.
- **AI real** en `backend/app/ai.py`: `generate_executive_summary` (ejecutivo), `generate_commercial_guidance` (acción comercial), `generate_user_explanation` (usuario). Requiere `GROQ_API_KEY` (no ANTHROPIC_API_KEY como dice CLAUDE.md).
- **scoring_history**: tabla inmutable `public.scoring_history` + servicio `getScoringHistory.js`. Se escribe en cada `createEvaluation()` (Supabase y localStorage).
- **arco_requests**: tabla para solicitudes de datos ARCO (acceso/rectificación/cancelación). Servicio en `profileService.js`.
- **utils/text.js**: `normalizeDisplayList()` y `normalizeDisplayText()` corrigen ortografía española. Úsalos al mostrar datos del backend.
- **Dead code**: `formatPhoneDisplay()` en `ProfilePage.jsx` está definido pero nunca llamado. Eliminar en próxima limpieza.

## Comandos

```powershell
# Backend
cd backend; python -m venv .venv; .venv\Scripts\pip install -r requirements.txt
.venv\Scripts\uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend; npm install; npm run dev
```

Backend `http://localhost:8000/docs`. Frontend `http://localhost:5173`.
Makefile: solo WSL/Git Bash (`make run`).

## Variables de entorno

```
# frontend/.env
VITE_SUPABASE_URL=https://adgnxtjkqedtvkwcizzn.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_API_URL=http://127.0.0.1:8000

# backend/.env (opcional, para AI)
GROQ_API_KEY=gsk_...
```

## Cambios recientes que agents previos suelen errar

- `VALOR_UF_CLP` ahora es **40695** (no 45408 como dice backend.md).
- Tipos de contrato: `indefinido`, `plazo_fijo`, `independiente`, `honorarios_variable`.
- `antiguedad_morosidad` penaliza más si es reciente (<12 meses: -35, ≥12 meses: -25).
- `complemento_relacion` excluye `{"amigo", "otro"}` (son `relaciones_debiles`, no aportan a capacidad).
- `generate_ai_explanation` fue reemplazada por `generate_user_explanation` (firma distinta: recibe classification, score, lists planos).

## Archivos de instrucciones existentes

| Archivo | Estado |
|---------|--------|
| `.claude/CLAUDE.md` | Fuente primaria detallada (actualizada) |
| `agents/AGENTS.md` | Este archivo — compacto, corrige omisiones |
| `agents/backend.md` | Parcialmente desactualizado (scoring rules, AI mock claim) |
| `agents/frontend.md` | Parcialmente desactualizado |
| `agents/devops.md` | Mayormente vigente |
| `agents/qa.md` | Mayormente vigente |

## Guardrails

- No asumir Supabase disponible — flujo offline con localStorage es el primary path en dev.
- No modificar `PRECIOS_REFERENCIA_UF` en `scoring.py` sin contexto del negocio.
- No reemplazar scoring de reglas por ML.
- No agregar HdU 5+ sin instrucción explícita.
- No hardcodear API keys.
- No romper localStorage, Supabase condicional, Groq ni el endpoint `POST /score`.
- No consultar datos financieros externos sin consentimiento explícito.
- Evolucionar scoring con reglas versionadas, bloqueadores, componentes
  ponderados, compatibilidad con proyecto, prioridad comercial y auditoría.
- Si existe un nombre heredado como `comunasMvp`, no renombrarlo sin una tarea
  técnica explícita porque podría romper imports.
