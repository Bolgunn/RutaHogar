# HU 1 - Ingreso de datos financieros

> **✅ Implementada - PMV.** Captura inicial de datos: un formulario web guiado por pasos que recoge la información financiera y laboral del lead, la valida en tiempo real y lo dirige al resultado del scoring, sin documentos ni contacto con un ejecutivo.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Compleja |
| **Puntos de Historia** | 5 |
| **Actor** | Lead |
| **Sprint** | PMV |
| **Estado** | ✅ Implementada |

---

## Historia de usuario

> **Como** lead (persona interesada en comprar vivienda), **quiero** completar un formulario web guiado con mis datos financieros y alta facilidad de uso, **para** iniciar mi evaluación de viabilidad crediticia sin tener que hablar con un ejecutivo comercial.

---

## Criterios de aceptación

### E1 - Completado exitoso del formulario

**Dado** que el usuario accede a la plataforma RutaHogar por primera vez, **cuando** completa todos los campos obligatorios (ingresos, deudas, tipo de contrato, edad) y acepta el consentimiento de datos, **entonces** el sistema registra su perfil y lo redirige automáticamente al resultado de su evaluación.

### E2 - Inconsistencia en los datos declarados

**Dado** que el usuario está completando el formulario, **cuando** declara un monto de deuda mensual mayor que su ingreso declarado, **entonces** el sistema muestra una advertencia visual en el campo correspondiente antes de permitirle continuar al siguiente paso.

### E3 - Consentimiento de datos

**Dado** que se recibe una solicitud de precalificación en la que no se aceptó el consentimiento de tratamiento de datos, **cuando** el sistema valida los requisitos de la solicitud, **entonces** la evaluación y los datos no deben almacenarse, para proteger la privacidad de la información.

### E4 - Complemento de renta

**Dado** que la evaluación de viabilidad crediticia del lead se configura en modo de evaluación conjunta (renta complementada), **cuando** el sistema estructura la solicitud de precalificación, **entonces** debe instanciar un requerimiento de datos asociado, solicitando obligatoriamente los ingresos y deudas del codeudor para ejecutar el calculo de scoring consolidado.

---

## Notas

- El formulario es deliberadamente liviano: no hay carga de documentos en esta etapa. La carga de documentos es una historia aparte ([[HU24-carga-documentos|HU 24]]).
- El complemento de renta (`complemento_renta`) activa campos obligatorios adicionales: `complemento_nombre`, `complemento_monto`, `complemento_relacion`.
- La validación de consentimiento (E3) se aplica en el backend, no solo en la UI.
- La versión móvil de este flujo se documenta como [[../RNF/RNF6-experiencia-movil-lead|RNF 6]].

---

## Estado frente al código

Verificación criterio por criterio contra el código entregado. ✅ implementado · ⚠️ parcial · ❌ no implementado.

| Criterio | Estado | Evidencia |
| :------- | :----- | :-------- |
| `E1` | ✅ | `frontend/src/components/ScoreForm.jsx:914` envía `consentimiento` junto al resto del payload; la redirección posterior la resuelve `App.jsx:1210`. |
| `E2` | ✅ | `ScoreForm.jsx:383` calcula `debtExceedsIncome` y `ScoreForm.jsx:1120` renderiza la advertencia visual en el campo `deuda_mensual`. |
| `E3` | ✅ | `backend/app/main.py:217` valida `consentimiento` con un `field_validator` que rechaza la solicitud si es `false`. La validación está en el borde, no solo en la UI. |
| `E4` | ✅ | `ScoreForm.jsx:407` marca `complementFieldsIncomplete` y `ScoreForm.jsx:709` bloquea el avance mientras falten los campos del codeudor. |

> Esta tabla se revisa cuando cambia el código de la historia. Un criterio sin evidencia citable
> es un criterio no verificado, no un criterio cumplido.
