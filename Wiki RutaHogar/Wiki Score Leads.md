# Wiki RutaHogar

> **RutaHogar** es una plataforma de precalificación y acompañamiento financiero para el sector inmobiliario. Evalúa la viabilidad crediticia preliminar de un usuario, lo clasifica según su perfil y le entrega recomendaciones personalizadas — todo antes de que ingrese a una evaluación bancaria formal.

---

## Contenido

1. [¿Qué es RutaHogar?](#1-qué-es-rutahogar)
2. [Problema que resuelve](#2-problema-que-resuelve)
3. [Propuesta de valor](#3-propuesta-de-valor)
4. [Flujo general del sistema](#4-flujo-general-del-sistema)
5. [Motor de scoring](#5-motor-de-scoring)
6. [Estructura del repositorio](#6-estructura-del-repositorio)
7. [Cómo correr el proyecto](#7-cómo-correr-el-proyecto)
8. [API](#8-api)
9. [Equipo](#9-equipo)
10. [Documentos de referencia](#10-documentos-de-referencia)

---

## 1. ¿Qué es RutaHogar?

RutaHogar es una plataforma profesional de precalificación financiera inmobiliaria que permite a un usuario interesado en comprar una vivienda ingresar sus datos financieros básicos y recibir en segundos:

- Un **score de 0 a 100** basado en reglas del mundo hipotecario real.
- Una **clasificación**: Alto, Medio o Bajo.
- Una **explicación** de los factores que determinaron el resultado.
- Un **plan de mejora personalizado** si no cumple los requisitos actuales.

Para la inmobiliaria, los leads con score Alto quedan disponibles en un panel priorizado para que el ejecutivo comercial los contacte directamente.

El sistema **no aprueba créditos** y **no reemplaza** una evaluación bancaria formal. Es una herramienta orientativa de precalificación temprana. La IA no decide el score: solo redacta explicaciones a partir del resultado calculado por reglas auditables.

---

## 2. Problema que resuelve

Las inmobiliarias reciben ~2.000 leads anuales por proyecto, pero solo ~240 (12%) tienen viabilidad financiera real para acceder a un crédito hipotecario.

El proceso actual es:

1. El usuario manifiesta interés.
2. Un ejecutivo lo contacta.
3. Se recopilan antecedentes manualmente.
4. Se hace una evaluación preliminar.
5. Recién se descubre que el usuario no califica — ya invertido el tiempo.

**Consecuencias:** baja eficiencia operativa, saturación del equipo comercial, ciclos de venta de hasta 12 meses, y pérdida de leads viables que se van a la competencia.

El contexto actual agrava el problema: dividendos en alza (de ~$300.000 a ~$790.000 en 5 años), tasas de interés más altas y menor cantidad de compradores realmente aptos.

---

## 3. Propuesta de valor

| Actor | Valor entregado |
| :---- | :-------------- |
| **Lead (usuario)** | Sabe en minutos si está en condiciones de comprar, qué puede comprar y qué debe mejorar, sin hablar con ningún ejecutivo. |
| **Ejecutivo comercial** | Recibe una cartera ya filtrada con leads de score Alto, con indicadores que justifican la prioridad de cada uno. |
| **Inmobiliaria** | Reduce el ciclo de venta de ~12 meses a ~3 meses al concentrar el esfuerzo humano solo en leads viables. |

**Diferenciación frente a la competencia:**

| Solución | Cuándo interviene | Limitación |
| :------- | :---------------- | :--------- |
| Creditú | Etapa avanzada (solicitud de crédito) | Solo evalúa si el usuario puede comprar hoy |
| lidz.ai | Optimización interna comercial | No aborda al usuario final ni lo prepara |
| tuhipotecario.cl | Simulación estática | No acompaña ni genera plan de mejora |
| **RutaHogar** | **Etapa inicial (antes de la promesa)** | **Evalúa, explica, prioriza y prepara** |

---

## 4. Flujo general del sistema

```
┌─────────────────────────────────────────────────────────────┐
│  Etapa 1 – Objetivo del usuario                             │
│  ¿Qué quiere comprar? ¿En qué comuna? ¿Cuánto dividendo?   │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  Etapa 2 – Formulario de pre-evaluación financiera          │
│  Ingreso · Deuda · Ahorro · Contrato · Continuidad laboral  │
│  Morosidad · Cargas · Complemento de renta · Consentimiento │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  Etapa 3 – Motor de scoring (backend / FastAPI)             │
│  Reglas hipotecarias + cálculo de score 0–100               │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  Etapa 4 – Clasificación                                    │
│  Alto (≥ 70) · Medio (40–69) · Bajo (< 40)                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
         ┌─────────────────┴──────────────────┐
         ▼                                    ▼
┌────────────────────┐             ┌────────────────────────┐
│  Score ALTO        │             │  Score MEDIO / BAJO    │
│                    │             │                        │
│  → Panel ejecutivo │             │  → Plan de mejora      │
│  → Resumen financ. │             │  → Recomendaciones IA  │
│  → Sugerencia de   │             │  → Flujo de educación  │
│    acción comercial│             │    financiera          │
└────────────────────┘             └────────────────────────┘
```

---

## 5. Motor de scoring

El scoring está implementado en `backend/app/scoring.py`. Combina **reglas del mundo hipotecario real** con una capa de **explicación asistida por IA**.

### Variables de entrada

| Campo | Tipo | Descripción |
| :---- | :--- | :---------- |
| `ingreso_mensual` | float | Ingreso mensual en CLP |
| `deuda_mensual` | float | Deuda mensual total en CLP |
| `ahorro_disponible` | float | Ahorro disponible en CLP |
| `tipo_contrato` | string | `indefinido` / `plazo_fijo` / `independiente` |
| `continuidad_laboral` | string | `menos_6_meses` / `entre_6_y_12_meses` / `entre_1_y_3_anios` / `mas_3_anios` |
| `morosidad_actual` | string | `si` / `no` / `no_lo_se` |
| `comuna_objetivo` | string | Comuna deseada (RM) |
| `dividendo_estimado` | float | Dividendo esperado en CLP |
| `complemento_renta` | bool | Si hay complemento de renta |
| `consentimiento` | bool | Consentimiento de datos (obligatorio) |

### Reglas principales

| Regla | Efecto en score |
| :---- | :-------------- |
| Ingreso ≥ 4× dividendo | +25 |
| Deuda > 40% del ingreso | −20 |
| Ahorro ≥ 20% del precio referencial de la comuna | +15 |
| Ahorro ≥ 10% del precio referencial (pie mínimo) | +5 |
| Ahorro insuficiente para el objetivo | −20 |
| Contrato indefinido | +10 |
| Contrato independiente | −5 |
| Continuidad laboral > 3 años | +5 |
| Continuidad laboral 6–12 meses | −8 |
| Continuidad laboral < 6 meses | −15 |
| Morosidad declarada | −30 |
| Morosidad incierta | −12 |
| Complemento de renta | +5 |

### Clasificación final

| Rango | Clasificación |
| :---- | :------------ |
| 70 – 100 | **Alto** |
| 40 – 69 | **Medio** |
| 0 – 39 | **Bajo** |

### Salida del scoring

```json
{
  "score": 74.5,
  "classification": "Alto",
  "risks": ["..."],
  "recommendations": ["..."],
  "ai_explanation": "Tu perfil no muestra riesgos principales evidentes...",
  "improvement_plan": ["..."]
}
```

### Precios de referencia por comuna

El sistema incluye una tabla de precios referenciales en UF para ~50 comunas de la RM (desde La Pintana a 2.200 UF hasta Lo Barnechea a 10.500 UF). Se usa para calcular pie mínimo (10%) y pie recomendado (20%) y evaluar la coherencia entre el ahorro declarado y el objetivo real del usuario.

---

## 6. Estructura del repositorio

```
RutaHogar/
├── backend/
│   ├── app/
│   │   ├── main.py        # FastAPI app + endpoint POST /score
│   │   └── scoring.py     # Motor de scoring + explicación IA + plan de mejora
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   └── src/               # React app (formulario + visualización de resultado)
├── agents/
│   ├── AGENTS.md          # Contexto general para agentes IA
│   ├── backend.md         # Instrucciones agente backend
│   ├── frontend.md        # Instrucciones agente frontend
│   ├── devops.md          # Instrucciones agente DevOps
│   └── qa.md              # Instrucciones agente QA
├── Wiki RutaHogar/
│   ├── Wiki Score Leads.md        # ← este archivo
│   ├── Tech Stack.md              # Stack tecnológico detallado
│   └── informes_entregas/
│       ├── Informe RutaHogar.md  # E1 – Justificación de propuesta
│       └── E2 - GPI 2026 - RutaHogar.md  # E2 – Historias de usuario
├── contexto-RutaHogar.md  # Contexto consolidado del proyecto
├── README.md               # Instrucciones de instalación y ejecución
└── Makefile
```

---

## 7. Cómo correr el proyecto

### Backend (FastAPI)

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# Linux / macOS / WSL
source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API disponible en: `http://localhost:8000`
Documentación automática: `http://localhost:8000/docs`

### Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

App disponible en: `http://localhost:5173`

### Atajo con Makefile (Linux/WSL/Git Bash)

```bash
make run
```

---

## 8. API

### `POST /score`

Recibe los datos financieros del usuario y retorna el resultado de la evaluación.

**Request body:**

```json
{
  "ingreso_mensual": 1500000,
  "deuda_mensual": 200000,
  "ahorro_disponible": 8000000,
  "tipo_contrato": "indefinido",
  "continuidad_laboral": "mas_3_anios",
  "morosidad_actual": "no",
  "comuna_objetivo": "Maipú",
  "dividendo_estimado": 300000,
  "complemento_renta": false,
  "consentimiento": true
}
```

**Response:**

```json
{
  "score": 80.0,
  "classification": "Alto",
  "risks": [],
  "recommendations": ["Mejorar ahorro o reducir deuda para pasar a clasificación Alto"],
  "ai_explanation": "Tu perfil no muestra riesgos principales evidentes en esta pre-evaluación...",
  "improvement_plan": ["Mantén un fondo de ahorro separado para pie...", "..."]
}
```

**Validaciones aplicadas:**
- Todos los montos deben ser ≥ 0
- `tipo_contrato`: solo `indefinido`, `plazo_fijo`, `independiente`
- `continuidad_laboral`: solo `menos_6_meses`, `entre_6_y_12_meses`, `entre_1_y_3_anios`, `mas_3_anios`
- `morosidad_actual`: solo `si`, `no`, `no_lo_se`
- `consentimiento`: debe ser `true`; si es `false`, retorna error 422
- Si `complemento_renta` es `true`, son obligatorios: `complemento_nombre`, `complemento_monto`, `complemento_relacion`

---

## 9. Equipo

| Nombre              | Rol              |
| :------------------ | :--------------- |
| Andrés Jablonca     | CPO — Hippie     |
| Isaías Carte        | CEO — Hustler    |
| Rodrigo Ramírez     | COO — Operations |
| Claudio Jiménez     | CTO — Hacker     |
| Benjamín Olguín     | CMO — Growth     |
| Mauro Castillo      | CFO — Finance    |

**Contraparte cliente:** Ellison De Moraes Caram — Gerente de Inteligencia de Negocios, Inmobiliaria Echeverría Izquierdo — ecaram@ei.cl

---

## 10. Documentos de referencia

| Documento | Descripción |
| :-------- | :---------- |
| [[Tech Stack]] | Stack tecnológico completo con justificaciones, integraciones futuras y decisiones de diseño |
| [[informes_entregas/Informe RutaHogar]] | E1 — Justificación de propuesta: problema, cliente, solución, riesgos e hipótesis |
| [[informes_entregas/E2 - GPI 2026 - RutaHogar]] | E2 — Historias de usuario corregidas, criterios de aceptación y rúbrica |
| [[informes_entregas/E4 - GPI Plan de Proyecto 2026]] | E4 — Plan de proyecto 2026: actores, atributos de calidad, riesgos, distribución en 3 sprints y detalle de 2 spikes + 33 HUs |
| [[UserStories/index\|User Stories]] | Backlog actualizado (HU 1–29 + RNF `NFR-*` y `OutOfBacklog-*`) con estado, sprint, mapeo E4→nuevo y páginas por historia |
| [[Distribucion\|Distribución / Sprints]] | Plan de 3 sprints + 2 spikes con totales de SP |
| [[Riesgos\|Riesgos técnicos]] | 9 riesgos técnicos con fórmula de prioridad y mitigaciones |
| [[AtributosDeCalidad\|Atributos de calidad (RNF)]] | 8 atributos de calidad con metas SMART y verificación |
| [[Actores\|Actores / Roles]] | Los 4 actores del sistema con niveles de manejo tecnológico y de contexto |
| `contexto-RutaHogar.md` | Contexto consolidado: visión, flujo, variables de scoring y reglas del mundo hipotecario |
| `agents/AGENTS.md` | Instrucciones generales para agentes IA del proyecto |
| `README.md` | Instrucciones rápidas de instalación y ejecución |
