# QA — RutaHogar Plataforma Profesional

Validación manual de RutaHogar como plataforma profesional de precalificación
financiera inmobiliaria. No tratar como MVP.

El score es orientativo, explicable y basado en reglas. RutaHogar no aprueba
créditos ni reemplaza una evaluación bancaria formal. La IA no decide el score:
solo redacta explicaciones y guías desde datos calculados por el sistema.

## Smoke Test General

1. Levantar backend:
   `cd backend && .venv\Scripts\uvicorn app.main:app --reload --port 8000`
2. Levantar frontend:
   `cd frontend && npm run dev`
3. Abrir `http://localhost:8000/docs` y verificar que FastAPI carga sin error.
4. Abrir `http://localhost:5173` y revisar que no haya errores críticos en consola.
5. Ejecutar flujo completo desde login/registro hasta resultado.
6. Confirmar que `POST /score` responde con `score`, `base_score`,
   `adjusted_score`, `classification`, `component_scores`,
   `financial_indicators`, `blockers`, `main_blocker`, `project_fit`,
   `commercial_priority_detail`, `structured_improvement_plan` y campos de
   explicación cuando correspondan.

## Tests Automatizados (Backend)

1. `cd backend && .venv\Scripts\python -m pytest tests\test_score_professional.py -q`
2. Todos los tests deben pasar en verde.
3. `backend/test_thresholds.py` complementa con verificaciones de umbrales de
   clasificación; validar su estado antes de usarlo como gate de PR.

## Flujo Offline LocalStorage

Probar sin variables Supabase configuradas.

1. Registrar usuario en modo localStorage.
2. Completar onboarding: objetivo, tipo de propiedad, comuna y plazo.
3. Aceptar consentimiento de tratamiento de datos.
4. Completar evaluación financiera con datos válidos.
5. Ver resultado en `Result`.
6. Ver historial en `ProfilePage`.
7. Crear una segunda evaluación con datos distintos.
8. Confirmar que ambas evaluaciones quedan disponibles y que el historial no se
   sobrescribe.
9. Confirmar que los snapshots guardan datos profesionales si existen:
   `algorithm_version`, `component_scores`, `financial_indicators`, `blockers`,
   `project_fit`, `commercial_priority_detail` y `structured_improvement_plan`.

## Flujo Con Supabase

1. Configurar `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`.
2. Crear una evaluación desde el frontend.
3. Verificar registro nuevo en `public.evaluations`.
4. Verificar registro nuevo en `public.scoring_history`.
5. Crear una segunda evaluación con datos distintos.
6. Confirmar que `scoring_history` tiene un registro adicional, no una
   actualización del anterior.
7. Verificar que se guarda `algorithm_version` si existe.
8. Verificar que `snapshot` contiene input/result profesional o equivalente.
9. Confirmar que evaluaciones antiguas siguen mostrándose sin error.

## Flujo Anónimo

1. Desde `landing`, ejecutar "evalúa gratis" sin registro.
2. Completar `anon-onboarding` (objetivo, comuna, plazo).
3. Completar `anon-evaluate` y ver resultado.
4. Confirmar que `signup-offer` aparece y que el resultado no se pierde al
   registrarse.
5. Tras registrarse, el resultado debe quedar disponible en el flujo normal.

## Flujo Plan De Ahorro Vivienda

1. En `tracking`, abrir el plan de ahorro vivienda (`housing-plan`).
2. Definir objetivo (valor, pie, plazo) y ahorro mensual.
3. Confirmar proyección de meses y que no se rompe con valores extremos.
4. Guardar y reabrir: los datos persisten (Supabase o localStorage).

## Flujo Registro De Hitos

1. Desde `tracking`, abrir el registro de hito (`register-milestone`).
2. Crear un hito (nombre, fecha, monto, tipo).
3. Confirmar que aparece en el seguimiento financiero.
4. Verificar persistencia y que no rompe hitos previos.

## Flujo Feedback Y ARCO

1. Enviar feedback desde el formulario y confirmar envío; con edge functions
   desplegadas debe llegar correo vía Resend.
2. Crear solicitud ARCO desde el perfil y confirmar que aparece en `admin`
   (`AdminArcoRequests`) para gestión del admin.

## Casos De Scoring Profesional

### Alto Preparado

Datos: alto ingreso, buen pie, baja deuda, contrato indefinido, continuidad alta
y sin morosidad.

Esperado:
- `classification`: `Alto` (score ≥ 75)
- `project_fit`: `Compatible`
- `commercial_priority_detail.action`: `Contactar ahora`
- Sin texto de crédito aprobado.

### Buen Ingreso + Bajo Pie

Datos: ingreso suficiente, deuda baja o moderada, ahorro bajo frente al objetivo.

Esperado:
- `classification`: puede quedar `Medio`
- `main_blocker.code`: `pie_insuficiente`
- `project_fit`: `Cercano` o `Fuera de alcance`
- `structured_improvement_plan` incluye `increase_savings`

### Buen Ingreso + Morosidad Vigente

Datos: buen ingreso, buen pie, pero `morosidad_actual: "si"`.

Esperado:
- El score puede ser alto por componentes, pero `classification` máxima: `Medio`
- `main_blocker.code`: `morosidad_vigente`
- `commercial_priority_detail.action`: `No derivar todavía`
- No debe aparecer ninguna promesa de aprobación bancaria.

### Buen Pie + Deuda Alta

Datos: ahorro suficiente, pero deuda mensual o carga total alta.

Esperado:
- Bloqueador `deuda_actual_alta` o `carga_total_alta`
- `structured_improvement_plan` incluye `reduce_debt`
- Explicación orienta reducir carga antes de avanzar.

### Complemento De Renta Incompleto

Datos: `complemento_renta: true` con campos relevantes del complementario
incompletos.

Esperado:
- `classification`: `Requiere antecedentes`
- Bloqueador `complemento_incompleto`
- Prioridad comercial: `Solicitar antecedentes`

### Complemento Débil

Datos: complementario con `relacion_complementario` en `amigo` u `otro`.

Esperado:
- Bloqueador `complemento_debil`
- El complemento no debe fortalecer excesivamente capacidad de pago.
- Explicación debe mantener cautela y pedir revisión.

### Edad + Plazo Riesgoso

Datos: edad y plazo hipotecario proyectan edad final superior al umbral de
riesgo.

Esperado:
- Bloqueador `edad_plazo_riesgoso`
- `structured_improvement_plan` incluye `adjust_credit_term`
- `project_fit` refleja el riesgo si corresponde.

### Objetivo Inmobiliario Fuera De Alcance

Datos: ingreso y/o pie insuficientes para el valor objetivo.

Esperado:
- `project_fit.classification`: `Fuera de alcance`
- Prioridad comercial: `Reorientar a otro proyecto` o `Nutrir con plan de mejora`
- La comuna/valor objetivo no debe castigar por sí sola el score financiero.

### Datos Incompletos

Datos: faltan antecedentes clave o vienen valores opcionales vacíos.

Esperado:
- Backend no debe romper.
- Debe pedir antecedentes si corresponde.
- No debe inventar datos faltantes.
- El resultado debe conservar lenguaje orientativo.

## Validaciones De Privacidad

- `consentimiento: false` debe rechazar el cálculo.
- No solicitar credenciales bancarias.
- No mostrar textos como "crédito aprobado" o "aprobado para crédito".
- No consultar datos financieros externos sin consentimiento explícito.
- Mantener flujo ARCO: solicitudes de acceso, rectificación, cancelación u
  oposición deben seguir operando.
- Usuario normal ve solo sus datos; ejecutivo/admin según permisos definidos.

## Validaciones De IA

- Sin `GROQ_API_KEY`, backend no debe fallar.
- Con `GROQ_API_KEY`, la IA puede redactar explicaciones usando el contexto del
  scoring profesional.
- La IA no debe cambiar `score` ni `classification`.
- La IA no debe prometer aprobación bancaria, subsidios ni financiamiento.
- Las explicaciones determinísticas deben existir como base aunque Groq no esté
  disponible.

## Validaciones De Historial

- Cada evaluación nueva crea un registro nuevo en `scoring_history`.
- Cada recálculo o nueva evaluación debe conservar registros anteriores.
- No hacer `UPDATE` ni `DELETE` sobre registros históricos.
- Se guarda `created_at` o timestamp equivalente.
- Se guarda `algorithm_version` si existe.
- Se guarda `input_snapshot` si existe.
- Se guarda `result_snapshot` o `snapshot` equivalente.
- Se guarda `calculation_reason`; si no existe motivo explícito, usar
  `new_evaluation`.
- Evaluaciones antiguas sin campos profesionales siguen funcionando.
- En localStorage, el historial no debe sobrescribir registros previos.
- En Supabase, `scoring_history` debe tratarse como historial inmutable.

## Validaciones Backend Directas

Probar `POST /score` desde `/docs`, curl o cliente equivalente.

- `consentimiento: false` → rechazo por validación.
- `ingreso_mensual: -1` → rechazo por validación.
- `tipo_contrato` inválido → rechazo por validación.
- `tipo_contrato: "honorarios_variable"` → válido si el resto del payload es correcto.
- `morosidad_actual: "si"` sin antecedentes requeridos → validar comportamiento esperado.
- `complemento_renta: true` sin campos relevantes → debe bloquear o pedir antecedentes.
- Payload completo y válido → 200 con score profesional y campos nuevos.

## Checklist Final Antes De PR

- [ ] Backend levanta y `/docs` carga.
- [ ] Frontend levanta sin errores críticos.
- [ ] `pytest` backend pasa en verde.
- [ ] Flujo localStorage completo funciona.
- [ ] Flujo Supabase completo funciona si hay variables configuradas.
- [ ] `POST /score` mantiene contrato compatible.
- [ ] El score ponderado entrega valores entre 0 y 100.
- [ ] `component_scores` contiene los componentes esperados.
- [ ] `financial_indicators` no rompe con datos faltantes.
- [ ] `blockers` y `main_blocker` aparecen cuando corresponde.
- [ ] `project_fit` se mantiene separado del score financiero.
- [ ] `commercial_priority_detail` orienta, no ejecuta derivaciones reales.
- [ ] `structured_improvement_plan` es determinístico.
- [ ] Explicaciones determinísticas aparecen sin depender de Groq.
- [ ] IA no decide score, clasificación ni aprobación.
- [ ] No aparece lenguaje de crédito aprobado.
- [ ] Flujo anónimo → registro conserva el resultado.
- [ ] Plan de ahorro vivienda funciona y persiste.
- [ ] Registro de hitos funciona y persiste.
- [ ] Feedback y solicitudes ARCO llegan a admin.
- [ ] Cada evaluación crea nuevo `scoring_history`.
- [ ] Historial previo no se sobrescribe ni elimina.
- [ ] Evaluaciones antiguas siguen visibles sin errores.
- [ ] No se hardcodean API keys ni secretos.
- [ ] No se consulta información financiera externa sin consentimiento.

Validación sugerida para esta guía:

```bash
git diff agents/qa.md
```
