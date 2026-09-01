# Deuda Técnica — RutaHogar

Registro de decisiones tomadas conscientemente que implican un riesgo técnico o de seguridad a resolver en el futuro.

---

## CORS abierto en el backend (`allow_origins=["*"]`)

**Archivo:** `backend/app/main.py`
**Decisión:** Mantener `allow_origins=["*"]` temporalmente para simplificar el despliegue inicial.
**Riesgo:** Cualquier origen puede hacer peticiones al endpoint `/score`. En producción esto no es un problema crítico dado que el endpoint no expone datos sensibles, pero sí es una superficie de abuso.

**Acción pendiente:** Una vez estabilizado el dominio de producción en Vercel, reemplazar:
```python
allow_origins=["*"]
```
por:
```python
allow_origins=[os.getenv("CORS_ORIGIN", "http://localhost:5173")]
```
y agregar `CORS_ORIGIN=https://tu-dominio.vercel.app` como variable de entorno en el proyecto backend de Vercel.

---

---

## `docs/algorithms/` está vacío

**Archivos:** `backend/app/scoring_engine/` (9 módulos), `docs/algorithms/` (inexistente)

**Situación:** El handbook define que toda lógica de negocio con números discutibles vive en un
`ALG-N.md` con narrativa, tabla de reglas y un `ALG-N-cases.json` que la suite de pruebas verifica,
y nombra explícitamente todo `scoring_engine/` más la clasificación y la prioridad comercial. Hoy
existen `blockers.py`, `commercial_priority.py`, `components.py`, `constants.py`, `explanations.py`,
`improvement_plan.py`, `indicators.py`, `project_fit.py` y `property_value.py`, y ningún documento
ALG.

**Riesgo:** Sin `ALG-N-cases.json` no hay gobierno: se puede cambiar un umbral sin que nada se
ponga en rojo, que es exactamente el problema que el handbook describe en su apertura. Tampoco
existe el registro de supuestos que el handbook exige para cada número decidido por criterio del
desarrollador.

**Acción pendiente:** Escribir los ALG. El handbook lo asigna a una persona, no a una sesión
agéntica, y exige que se escriban **antes** del código que los implementa. Historias que van a
tocar números y necesitan su ALG primero: [[UserStories/HU18-simulador-escenarios-hipotecarios\|HU 18]]
(umbral prudente de dividendo), [[UserStories/HU28-gastos-iniciales\|HU 28]] (porcentajes de gastos
iniciales) y [[UserStories/HU23-parametros-scoring\|HU 23]] (edición de los tunables).

---

## La arquitectura del handbook no existe en el código

**Archivos:** `frontend/src/`

**Situación:** El handbook describe `frontend/src/features/{auth,scoring,leads,tracking,academy,admin}`,
una carpeta `lib/` pura, una `shared/` con tres consumidores reales y una regla de importación
verificada por ESLint. El código real es plano: 26 componentes en `components/`, 15 servicios en
`services/`, y `lib/` contiene una sola cosa (`simulation/`).

**Riesgo:** Un documento normativo que describe un código que no existe deja de leerse, y arrastra
consigo las reglas del mismo documento que sí son exigibles.

**Acción pendiente:** Existe `docs/stories/REFACTOR/PLAN.md`, que es quien debería cerrarlo. Hasta
entonces la sección de arquitectura del handbook describe una intención, no el repositorio. Cerrar
la brecha es refactor o enmienda al handbook: cualquiera de las dos, en su propio PR con la causa
declarada, como pide el propio handbook.
