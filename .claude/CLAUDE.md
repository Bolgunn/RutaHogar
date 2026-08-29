# CLAUDE.md — RutaHogar

## Qué es este proyecto

RutaHogar es una plataforma web de precalificación financiera para el sector inmobiliario. Permite a un usuario interesado en comprar vivienda ingresar sus datos financieros básicos y recibir en segundos un score de 0 a 100, una clasificación (Alto / Medio / Bajo), una explicación de los factores que determinaron el resultado, y un plan de mejora personalizado.

Para la inmobiliaria, los leads con score Alto quedan disponibles en un panel priorizado para que el ejecutivo comercial los contacte.

RutaHogar **ya no debe tratarse ni documentarse como MVP**. Es una plataforma profesional de precalificación financiera inmobiliaria, con scoring explicable, reglas versionadas, trazabilidad, privacidad, priorización comercial y plan de mejora financiero.

El sistema **no aprueba créditos** y **no reemplaza** una evaluación bancaria formal. Es una herramienta orientativa de precalificación temprana. La IA no decide el score: solo redacta explicaciones, resúmenes o guías a partir del resultado calculado por reglas auditables.

## Cliente y equipo

**Cliente:** Inmobiliaria Echeverría Izquierdo — Ellison De Moraes Caram (ecaram@ei.cl)

| Nombre | Rol |
| :----- | :-- |
| Andrés Jablonca | CPO — Hippie |
| Isaías Carte | CEO — Hustler |
| Rodrigo Ramírez | COO — Operations |
| Claudio Jiménez | CTO — Hacker |
| Benjamín Olguín | CMO — Growth |
| Mauro Castillo | CFO — Finance |

## Stack tecnológico

| Capa | Tecnología |
| :--- | :--------- |
| Frontend | React + Vite |
| Backend | FastAPI + Python |
| Base de datos | Supabase + PostgreSQL (omitida en desarrollo local) |
| IA | Groq para explicaciones y orientación comercial |

## Estructura del repositorio

```
RutaHogar/
├── backend/
│   └── app/
│       ├── main.py        # FastAPI app + endpoint POST /score
│       └── scoring.py     # Motor de scoring + explicación mock + plan de mejora
├── frontend/
│   └── src/
│       ├── App.jsx        # Routing por estado de página + lógica de sesión
│       ├── components/    # Componentes por vista
│       └── services/      # Llamadas a Supabase y al backend
├── Wiki RutaHogar/       # Documentación del proyecto
└── .claude/CLAUDE.md      # Este archivo
```

## Cómo correr el proyecto

### Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
API en `http://localhost:8000` — docs en `http://localhost:8000/docs`

### Frontend
```bash
cd frontend
npm install
npm run dev
```
App en `http://localhost:5173`

Supabase **no es necesaria** para desarrollo local. El backend calcula scores sin base de datos. El frontend muestra errores silenciosos cuando Supabase no está configurada — eso es esperado en local.

## Alcance activo — plataforma profesional

| HdU | Descripción |
| :-- | :---------- |
| HdU 1 | Ingreso de datos financieros (formulario guiado + consentimiento + complemento de renta) |
| HdU 2 | Priorización de leads calificados (dashboard del ejecutivo comercial) |
| HdU 3 | Generación de scoring híbrido con explicación inteligente |
| HdU 4 | Generador de planes de mejora personalizados |

**Fuera de alcance — no implementar sin instrucción explícita:**
- HdU 5: integración con CRM
- HdU 6: algoritmo de estrés (simulación de tasas / UF)
- Nuevos sistemas de autenticación (ya existe uno)
- Integración con APIs externas: CMF, Dicom, bancos
- OCR de documentos
- Modelos ML entrenados propios para scoring
- Almacenamiento de credenciales bancarias o documentos sensibles
- Consulta de datos financieros externos sin consentimiento explícito

## Convenciones de código

- **Variables de dominio:** español (`ingreso_mensual`, `deuda_mensual`, `clasificacion`, `tipo_contrato`)
- **Construcciones genéricas de programación:** inglés (`handleSubmit`, `useState`, `calculate_score`, `clamp`)
- Sin comentarios obvios — solo cuando el motivo no es evidente
- Sin abstracciones prematuras — no crear helpers ni contextos sin tres usos reales
- Sin manejo de errores para escenarios imposibles — validar solo en los límites del sistema

## Guardrails — qué NO hacer

1. No agregar dependencias sin necesidad concreta
2. No reemplazar el motor de scoring basado en reglas por un modelo ML
3. No asumir que Supabase está disponible — el flujo debe funcionar sin ella localmente
4. No hardcodear claves de API en el código fuente
5. No romper el contrato del endpoint `POST /score` (ver sección Backend)
6. No agregar funcionalidades fuera de HdU 1–4 sin instrucción explícita del equipo
7. No modificar `PRECIOS_REFERENCIA_UF` en `scoring.py` sin contexto del negocio
8. No romper localStorage, Supabase condicional, Groq ni los flujos de auditoría/historial
9. No consultar datos financieros externos sin consentimiento explícito y alcance aprobado

## Variables de entorno

```env
# Backend
GROQ_API_KEY=gsk_...           # Opcional para explicaciones y orientación comercial

# Frontend
VITE_SUPABASE_URL=https://...
VITE_SUPABASE_ANON_KEY=...
```

Ninguna variable es obligatoria para correr el proyecto localmente.

---

## Backend

### Archivos clave

```
backend/app/
├── main.py      # FastAPI app, modelo Pydantic ScoreRequest, endpoint POST /score
└── scoring.py   # Motor de scoring, explicación mock, plan de mejora
```

### Contrato de `POST /score`

**Campos obligatorios:**

| Campo | Tipo | Valores válidos |
| :---- | :--- | :-------------- |
| `ingreso_mensual` | float | ≥ 0 |
| `deuda_mensual` | float | ≥ 0 |
| `ahorro_disponible` | float | ≥ 0 |
| `dividendo_estimado` | float | ≥ 0 |
| `tipo_contrato` | string | `indefinido` / `plazo_fijo` / `independiente` |
| `continuidad_laboral` | string | `menos_6_meses` / `entre_6_y_12_meses` / `entre_1_y_3_anios` / `mas_3_anios` |
| `morosidad_actual` | string | `si` / `no` / `no_lo_se` |
| `consentimiento` | bool | debe ser `true` |

**Campos opcionales:**

| Campo | Tipo | Notas |
| :---- | :--- | :---- |
| `comuna_objetivo` | string | Activa la lógica de precio referencial por comuna |
| `complemento_renta` | bool | Si `true`, requiere `complemento_nombre`, `complemento_monto`, `complemento_relacion` |
| `complemento_nombre` | string | — |
| `complemento_monto` | float | ≥ 0 |
| `complemento_relacion` | string | — |

**Respuesta:**
```json
{
  "score": 74.5,
  "classification": "Alto",
  "risks": ["..."],
  "recommendations": ["..."],
  "ai_explanation": "...",
  "improvement_plan": ["..."]
}
```

### Reglas del motor de scoring (`scoring.py`)

Score base: 50. Se ajusta con estas reglas:

| Regla | Efecto |
| :---- | :----- |
| Ingreso ≥ 4× dividendo | +25 |
| Ingreso < 4× dividendo | −15 |
| Deuda > 40% del ingreso | −20 |
| Ahorro ≥ 20% precio referencial de la comuna | +15 |
| Ahorro ≥ 10% precio referencial (pie mínimo) | +5 |
| Ahorro insuficiente para el objetivo | −20 |
| Contrato indefinido | +10 |
| Contrato independiente | −5 |
| Continuidad > 3 años | +5 |
| Continuidad 6–12 meses | −8 |
| Continuidad < 6 meses | −15 |
| Morosidad declarada (`si`) | −30 |
| Morosidad incierta (`no_lo_se`) | −12 |
| Complemento de renta | +5 |

Score clampado a [0, 100]. Clasificación: Alto ≥ 70, Medio ≥ 40, Bajo < 40.

### Capa de IA

La IA debe limitarse a redactar explicaciones, resúmenes ejecutivos y orientación comercial a partir del resultado calculado por reglas. No debe decidir ni recalcular el score.

`risk_codes` disponibles: `ingreso_dividendo`, `deuda_alta`, `ahorro_bajo`, `precio_objetivo`, `contrato_independiente`, `continuidad_baja`, `continuidad_media`, `morosidad_alta`, `morosidad_media`.

Evolución esperada: el scoring debe avanzar con reglas versionadas, bloqueadores, componentes ponderados, compatibilidad con proyecto inmobiliario, prioridad comercial, auditoría e historial de versiones. No reemplazar reglas por ML sin instrucción explícita.

### Cómo agregar una regla de scoring

1. Añadir la lógica en `calculate_score()` — ajustar `score`, agregar a `risk_codes` si aplica, agregar mensajes a `riesgos` / `recomendaciones`
2. Si el `risk_code` es nuevo, registrarlo también en `generate_ai_explanation` y `generate_improvement_plan`
3. No crear clases nuevas — la función es deliberadamente plana

---

## Frontend

### Routing

Sin React Router. El routing se maneja con estado `page` en `App.jsx`. Para navegar: `setPage("nombre-pagina")`. Para ir a `evaluate` usar `startEvaluation()` — resetea resultado previo y verifica onboarding.

### Componentes

```
frontend/src/components/
├── AdminPanel.jsx        # Vista admin — solo rol admin
├── AuthPanel.jsx         # Login / registro — pantalla inicial sin sesión
├── DashboardLeads.jsx    # Dashboard de leads — solo rol sales
├── FinancialTracking.jsx # Seguimiento financiero con metas — rol user
├── MonthlyPlan.jsx       # Plan mensual de una meta específica — rol user
├── Navbar.jsx            # Navegación — adapta opciones según rol
├── ObjectiveReview.jsx   # Revisión del objetivo inmobiliario — rol user
├── Onboarding.jsx        # Captura objetivo inicial — rol user
├── ProfilePage.jsx       # Perfil + historial de evaluaciones — rol user
├── Recommendations.jsx   # Recomendaciones basadas en la última evaluación — rol user
├── Result.jsx            # Visualización del resultado del score
└── ScoreForm.jsx         # Formulario de preevaluación financiera
```

### Roles

Definidos en `services/auth.js` como `roles`:

| Rol | Páginas accesibles |
| :-- | :----------------- |
| `roles.user` | onboarding, evaluate, home, profile, tracking, monthly-plan, objective-review, recommendations |
| `roles.sales` | leads |
| `roles.admin` | admin |

### Páginas (estado `page`)

| Valor | Componente | Rol |
| :---- | :--------- | :-- |
| `home` | Hero + Result + mapa de módulos | Cualquiera |
| `onboarding` | Onboarding | user |
| `evaluate` | ScoreForm | user |
| `profile` | ProfilePage | user |
| `tracking` | FinancialTracking | user |
| `monthly-plan` | MonthlyPlan | user |
| `objective-review` | ObjectiveReview | user |
| `recommendations` | Recommendations | user |
| `leads` | DashboardLeads | sales |
| `admin` | AdminPanel | admin |

### Supabase en local

Los servicios en `services/` llaman a Supabase. Sin Supabase configurada, fallan silenciosamente — `App.jsx` captura los errores y los muestra en `dataError`. Comportamiento esperado en local.

### Cómo agregar una página nueva

1. Crear `components/NombreComponente.jsx`
2. Importarlo en `App.jsx`
3. Agregar condición `page === "nombre"` en el bloque de renderizado
4. Agregar opción en `Navbar.jsx` con restricción de rol si corresponde
5. No agregar React Router — seguir el patrón existente
