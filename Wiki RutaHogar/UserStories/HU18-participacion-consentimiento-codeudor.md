# HU 18 - Participación y consentimiento del co-deudor

> **✅ Implementada - Sprint 2.** El lead puede invitar a su co-deudor para aportar sus propios datos y otorgar su propio consentimiento.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Importante |
| **Puntos de Historia** | 3 |
| **Actor** | Lead · **Co-deudor** *(actor nuevo)* |
| **Sprint** | Sprint 2 |
| **Estado** | ✅ Implementada |

---

## Historia de usuario

> Como lead que se evalúa con complemento de renta, quiero invitar a mi co-deudor a completar y confirmar sus propios datos, para que la evaluación se apoye en información que esa persona entregó y autorizó, y no en lo que yo supuse de ella.

---

## Criterios de aceptación

### E1 - Invitación con caducidad

**Dado** que el lead declaró complemento de renta, **cuando** termine de declararlo, **entonces** debe poder invitar a esa persona a completar sus propios antecedentes, y esa invitación debe caducar si no se responde en el plazo definido.

### E2 - El co-deudor aporta sus datos y consiente

**Dado** que el co-deudor accede a la invitación, **cuando** complete su renta, deuda, tipo de contrato, continuidad y morosidad, **entonces** debe hacerlo sin ver el resto de los datos financieros del lead y debe otorgar su propio consentimiento de tratamiento de datos, registrado por separado del consentimiento del lead.

### E3 - Declarado frente a confirmado

**Dado** que el co-deudor no ha respondido, **cuando** el lead solicite su evaluación, **entonces** debe recibir su resultado con los datos declarados por el lead y marcados como no confirmados; y **cuando** el co-deudor confirme valores distintos, **entonces** deben prevalecer los suyos en una actualización de score solicitada explícitamente por el lead. La confirmación por sí sola no recalcula la evaluación.

### E4 - Revocación

**Dado** que el co-deudor otorgó su consentimiento, **cuando** decida revocarlo, **entonces** sus datos deben dejar de usarse en evaluaciones posteriores y dejar de mostrarse al ejecutivo.

## Notas

- **Captura de contacto.** El lead declara RUT y correo del co-deudor dentro de la precalificación, junto con el complemento de renta. El RUT se normaliza y valida por formato/dígito verificador, pero no se verifica externamente ni participa en scoring. Tras persistir el score se envía la invitación; Recommendations queda para estado, reintento, reemplazo y actualización explícita del score.

- **El problema, verificado.** `ScoreRequest` captura `ingreso_mensual_complementario`,
  `deuda_mensual_complementario`, `tipo_contrato_complementario`,
  `continuidad_laboral_complementario`, `morosidad_complementario` y `relacion_complementario`
  (`backend/app/main.py:100`), todos digitados por el lead. Y el modelo tiene **un solo**
  `consentimiento: bool` (`backend/app/main.py:111`): el del lead. **La morosidad de un tercero se
  declara sin que ese tercero lo sepa.**
- **No es solo privacidad, también es calidad del dato.** El lead adivina la deuda de su pareja o de
  su padre. Ese número entra directo al cálculo de capacidad, y hoy además decide si el complemento
  se considera o se descarta por completo (`indicators.py:32`).
- **E3 es la salvaguarda de no-regresión.** El flujo de [[HU1-ingreso-datos-financieros|HU 1]]
  entrega un resultado en segundos y eso no puede depender de que un tercero conteste. La
  confirmación **enriquece** la evaluación; no es un requisito para obtenerla.
- **El marcado de "no confirmado" de E3 es lo que lo hace útil.** Un dato no confirmado sigue sirviendo, pero el ejecutivo tiene
  que saber que lo es antes de apoyarse en él para una derivación bancaria.
- **Esta historia introduce un actor nuevo.** El co-deudor no está en
  [[../Actores|Actores / Roles]]: no es Lead, no es Ejecutivo, no es Administrador. Participa, no
  navega la plataforma. Si la historia se aprueba, **la tabla de actores se actualiza con ella**.
- **Frontera con el sistema de autenticación existente.** El handbook lista *"nuevos sistemas de
  autenticación"* fuera de alcance. Un enlace de un solo uso con caducidad **no** es un sistema de
  autenticación, pero la línea es fina: **resolverlo en el grill antes de planificar.** Si la
  solución elegida termina siendo una cuenta para el co-deudor, la historia cambia de tamaño y
  necesita encargo explícito del equipo.
- **Sin credenciales ni documentos.** El co-deudor declara exactamente cinco campos propios
  (ingreso, deuda, contrato, continuidad y morosidad); `relacion_complementario` sigue siendo
  declarada por el lead. Nada de documentos, nada de datos bancarios — salvaguardas S8 y el alcance de
  [[HU24-carga-documentos|HU 24]] siguen intactos.
- **Fuera de alcance:** más de un co-deudor, verificación de los datos contra fuentes externas
  (CMF, Dicom, bancos — explícitamente fuera del alcance del proyecto), y cualquier notificación al
  co-deudor que no sea la invitación y su caducidad.

---

## Relación con otras historias

| Historia | Relación |
| :------- | :------- |
| [[HU1-ingreso-datos-financieros\|HU 1]] | Extiende su E4 — hoy obliga a pedir los datos del co-deudor; esta historia hace que los entregue el co-deudor. E2 extiende su consentimiento de uno a dos titulares. |
| [[propuesta-complemento-vista-ejecutivo\|Complemento en la vista del ejecutivo]] | **La destraba.** Su E4 hoy queda colgando de una decisión de alcance de consentimiento que nadie tomó; E2 de esta historia es esa decisión. |
| [[propuesta-transparencia-complemento-renta\|Transparencia del complemento de renta]] | Complementaria. Esa propuesta explica al lead qué pasó con el complemento; esta hace que lo que pasó se base en datos confirmados. |
| [[HU27-revision-antecedentes\|HU 27]] | Un dato confirmado por su titular sigue siendo declarado, no verificado. La revisión referencial no se reemplaza. |
| **RNF de privacidad mínima** | E2 y E4 son su expresión concreta para datos de un tercero. |

> **⚠️ Precondición compartida — defecto §10.1.** Igual que [[propuesta-transparencia-complemento-renta|Transparencia del complemento de renta]]
> y [[propuesta-complemento-vista-ejecutivo|Complemento en la vista del ejecutivo]]: `indicators.py:63` ignora la deuda del co-deudor
> aunque la exige. Conseguir que el co-deudor declare su deuda de primera mano no sirve de nada
> mientras el motor la siga descartando. **El defecto se corrige antes o junto con esta historia.**
>
> **Divergencia adicional detectada:** `frontend/src/lib/simulation/compatibility.js:90` **sí** suma
> la deuda del co-deudor y sin filtro de validez, mientras `indicators.py:63` no la suma. Simulación
> y score aplican criterios distintos al mismo dato y pueden contradecirse para el mismo lead. Es un
> agravante del mismo defecto, no un caso aparte.

---

## Estado frente al código

Implementada con invitación por email, confirmación tokenizada, resolución ALG-17 y proyecciones
server-side para staff.

| Criterio | Estado | Evidencia |
| :------- | :----- | :-------- |
| `E1` | ✅ | `co-debtor-consent` crea invitaciones de un solo uso por email, con digest y caducidad centralizada de siete días. |
| `E2` | ✅ | La página pública tokenizada captura sólo los cinco campos propios y consentimiento de tratamiento separado. |
| `E3` | ✅ | ALG-17 preserva `lead_declared`/`not_confirmed` hasta confirmar; la acción explícita crea una evaluación histórica con razón `confirmacion_codeudor`. |
| `E4` | ✅ | El management token permite revocación idempotente; futuras evaluaciones y proyecciones staff excluyen los datos revocados. |
