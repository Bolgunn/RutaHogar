# Usuarios de prueba — Supabase

Proyecto: **adgnxtjkqedtvkwcizzn** (RutaHogar — East US Ohio)  
Creados: 2026-06-04 vía Admin API (`email_confirm: true`)

---

## Cuentas

| Email | Contraseña | Rol | UUID |
| :---- | :--------- | :-- | :--- |
| `test.usuario@scoreleads.dev` | `TestUser123!` | `usuario` | `3092fc95-e5b7-4068-bf3e-eb5a9686a429` |
| `test.ejecutivo@scoreleads.dev` | `TestExec123!` | `ejecutivo` | `e557f592-759b-405b-8bb1-e0f19647dbf1` |

---

## Para qué sirve cada uno

**`test.usuario`** — flujo del comprador:
- Onboarding → formulario de pre-evaluación → resultado → recomendaciones
- Sirve para verificar el redirect E6 (Alto → home, Medio/Bajo → recomendaciones)
- Sirve para confirmar que las evaluaciones se guardan en Supabase

**`test.ejecutivo`** — flujo del ejecutivo comercial:
- Login → Dashboard Leads con leads reales de la DB
- Sirve para verificar los contadores de filtro (Todos / Alto / Medio / Bajo)
- Sirve para confirmar que el rol `ejecutivo` resuelve correctamente y que la navbar muestra "Dashboard Leads"

---

## Cómo usarlos

Correr el frontend en dev (`npm run dev`) apuntando al proyecto de Supabase real (`.env` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` configurados).

No se necesita el backend para login ni para el dashboard. Sí se necesita para calcular el score (`POST /score`).
