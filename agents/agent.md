# RutaHogar — Instrucciones Generales para Agentes

Instrucciones consolidadas para Codex, Claude Code, Antigravity u otros agentes de IA que trabajen en este repositorio.

Referencia detallada: `.claude/CLAUDE.md` (fuente más completa del repo).

## Identidad del proyecto

El producto se llama **RutaHogar**.
No usar **ScoreLeads** como nombre activo del producto. Si aparece en documentación, textos visibles, README o wiki, debe reemplazarse por RutaHogar.
El sistema no aprueba créditos ni reemplaza evaluación bancaria formal. El score es orientativo, explicable y calculado por reglas auditables.

## Arquitectura y Stack

| Frontend | Backend | DB/Auth | Deploy | AI |
|----------|---------|---------|--------|----|
| React 18 + Vite 8 | FastAPI + Pydantic v2 | Supabase (PostgreSQL, RLS) | Vercel SPA + Edge Functions | Groq (llama-3.1-8b-instant) |

- **Supabase es condicional**: sin env vars todo funciona con localStorage.
- **Scoring profesional**: `calculate_score()` en `scoring.py` integra `scoring_engine/`. `SCORING_VERSION = "1.1.0"`.
- **AI real** en `backend/app/ai.py` usando `GROQ_API_KEY`.
- **scoring_history**: tabla inmutable `public.scoring_history` + servicio `getScoringHistory.js`.
- **utils/text.js**: `normalizeDisplayList()` y `normalizeDisplayText()` corrigen ortografía española.

## Comandos

```powershell
# Backend
cd backend; python -m venv .venv; .venv\Scripts\pip install -r requirements.txt
.venv\Scripts\uvicorn app.main:app --reload --port 8000

# Tests backend (pytest)
cd backend; .venv\Scripts\python -m pytest tests\test_score_professional.py -q

# Frontend
cd frontend; npm install; npm run dev
```

## Guardrails y Reglas de Nombre

- No implementar HUs sin instrucción explícita.
- No modificar scoring, endpoints, migraciones, autenticación, permisos ni base de datos en tareas documentales.
- No renombrar identificadores técnicos `scoreleads_*`, paquetes, imports, tablas, claves de almacenamiento o variables de entorno si eso puede romper funcionalidad.
- Cambiar el nombre anterior por RutaHogar en documentación y textos visibles cuando sea seguro.
- Reportar cualquier referencia heredada que quede por razones técnicas o históricas.
- No agregar HdU 5+ sin instrucción explícita.
- No consultar datos financieros externos sin consentimiento explícito.

## Tareas Pendientes

- **HU 12 - Sistema de Derivación e Integración Comercial:** La fase de planificación está completada (ver `docs/stories/HU12/PLAN.md` y `KICKOFF.md`). Falta implementar la fase de *Build* (migración de DB para `crm_sync_status`, DB Webhook, y Edge Function `sync-crm-lead` conectada al CRM mock).
