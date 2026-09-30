# RutaHogar

Professional platform for real-estate financial prequalification (React
frontend + FastAPI backend). RutaHogar is no longer documented as an MVP: it is
a product-oriented system for explainable scoring, versioned rules,
traceability, privacy, commercial prioritization, and financial improvement
planning.

RutaHogar does not approve mortgage loans and does not replace a formal bank
evaluation. The score is orientative and explainable. AI-generated text may help
summarize explanations or commercial guidance, but the score itself must remain  
determined by auditable rules unless the team explicitly instructs otherwise.

Core safeguards:

- Do not replace scoring rules with ML without explicit instruction.
- Do not break the `POST /score` contract, localStorage fallback, conditional
  Supabase behavior, or Groq integration.
- Do not hardcode API keys or secrets.
- Do not query external financial sources, banks, CMF, Dicom, or similar
  services without explicit user consent and approved scope.

Run backend:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate    # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Run frontend:

```bash
cd frontend
nvm use
npm install
npm run dev
```

The frontend requires Node.js 20.19+ or 22.12+ because the current Vite
toolchain does not support older Node versions. Node 22.23.2 is recommended.
Check your local version with `node -v`; if it is lower than 20.19, run
`nvm use` from the repository root to pick the version declared in `.nvmrc`.

Or use Makefile targets from the repo root:

```bash
make run
```

> Nota: este `Makefile` usa comandos bash; si estás en Windows, úsalo desde WSL o Git Bash.

Open the Vite URL (http://localhost:5173) and test the form.

## Supabase Edge Function: feedback por correo

La landing envia feedback mediante la Edge Function `submit-feedback`. La
funcion valida el payload, guarda el registro en `public.feedback` y luego
intenta enviar una notificacion por correo usando Resend. Si el envio de correo
falla, el feedback ya guardado no se pierde y la funcion responde con
`email_sent: false`.

Archivo de ejemplo para variables locales:

```bash
supabase/functions/.env.example
```

No guardar secretos reales en el repo. Para configurar produccion en Supabase:

```bash
supabase secrets set RESEND_API_KEY=TU_KEY_DE_RESEND
supabase secrets set FEEDBACK_TO_EMAIL=TU_CORREO_DESTINO
supabase functions deploy submit-feedback
```

Opcionalmente puedes configurar el remitente si tienes un dominio verificado en
Resend:

```bash
supabase secrets set FEEDBACK_FROM_EMAIL="RutaHogar <feedback@tu-dominio.cl>"
```

Para probar localmente con Supabase CLI, crea un archivo ignorado por git:

```bash
cp supabase/functions/.env.example supabase/functions/.env.local
```

Completa `RESEND_API_KEY` y luego levanta la funcion:

```bash
supabase functions serve submit-feedback --env-file supabase/functions/.env.local
```

Prueba remota esperada:

1. Desplegar la funcion con los secrets configurados.
2. Abrir la landing.
3. Enviar feedback desde el formulario.
4. Confirmar que el registro queda en `public.feedback`.
5. Confirmar que llega correo a `FEEDBACK_TO_EMAIL`.
6. Si falta `RESEND_API_KEY`, la funcion debe guardar el feedback y responder
   `success: true` con `email_sent: false`.

### Despliegue automatico con GitHub Actions

El workflow `.github/workflows/deploy-supabase-functions.yml` despliega la Edge
Function `submit-feedback` cuando hay push a las ramas `main`, `master` o
`deploy` con cambios dentro de `supabase/functions/**`. Si Vercel usa otra rama
como rama productiva, ajusta la lista `on.push.branches` del workflow para que
coincida con esa rama.

Las credenciales no van en Git. Configuralas en GitHub desde:

`Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`

Secrets requeridos:

```text
SUPABASE_ACCESS_TOKEN
SUPABASE_PROJECT_REF
RESEND_API_KEY
FEEDBACK_TO_EMAIL
FEEDBACK_FROM_EMAIL
```

Las funciones que se despliegan a mano usan ademas:

```text
EJECUTIVO_FROM_EMAIL
APP_URL
ARCO_NOTIFICATION_EMAIL
```

Notas de configuracion:

- `SUPABASE_ACCESS_TOKEN`: token personal para la CLI de Supabase. Se crea en
  Supabase Dashboard -> Account -> Access Tokens.
- `SUPABASE_PROJECT_REF`: ref del proyecto Supabase usado por Vercel. Lo puedes
  ver en la URL del proyecto (`https://supabase.com/dashboard/project/<ref>`) o
  en Project Settings -> General.
- `RESEND_API_KEY`: API key de Resend.
- `FEEDBACK_TO_EMAIL`: correo destino que recibira el feedback.
- `FEEDBACK_FROM_EMAIL`: usa `RutaHogar <onboarding@resend.dev>` mientras el
  dominio propio no este verificado en Resend.
- `EJECUTIVO_FROM_EMAIL`: remitente del correo que `create-executive` envia al
  ejecutivo con el enlace para definir su contrasena. Mismo criterio que el
  anterior. **Con el remitente sandbox `onboarding@resend.dev`, Resend solo
  entrega al correo de la propia cuenta Resend**: para que un ejecutivo real
  reciba el enlace hay que verificar un dominio y configurar esta variable.
- `APP_URL`: base del enlace de recuperacion que genera `create-executive`
  (redirige a `/definir-password`). Por defecto
  `https://score-leads-one.vercel.app`; en local, `http://localhost:5173`.
- `ARCO_NOTIFICATION_EMAIL`: destinatario de las notificaciones de solicitudes
  ARCO que envia `notify-admin-arco`. **Si no se define, la funcion usa un
  correo personal hardcodeado en el codigo**, asi que conviene fijarlo siempre
  en produccion.
- `EJECUTIVO_TEST_PASSWORD_MODE` (opcional, solo pruebas): con el valor exacto
  `"true"`, `create-executive` devuelve `password_temporal` para poder entrar
  sin depender del correo. **Si no esta en `"true"` no hay contrasena de
  respaldo**: si falla el envio, el ejecutivo queda sin acceso hasta que se
  arregle el correo. Dejarlo sin definir en produccion.

> **Ojo:** el workflow solo despliega `submit-feedback`. Las funciones
> `create-executive` y `notify-admin-arco` se despliegan a mano, y sus secrets
> (`EJECUTIVO_FROM_EMAIL`, `APP_URL`) se configuran con `supabase secrets set`.
> Los secrets son acumulativos: definir unos no borra los otros.

El workflow configura los secrets de la Edge Function antes de desplegar:

```bash
supabase secrets set \
  RESEND_API_KEY="$RESEND_API_KEY" \
  FEEDBACK_TO_EMAIL="$FEEDBACK_TO_EMAIL" \
  FEEDBACK_FROM_EMAIL="$FEEDBACK_FROM_EMAIL" \
  --project-ref "$SUPABASE_PROJECT_REF"

supabase functions deploy submit-feedback --project-ref "$SUPABASE_PROJECT_REF"
```

Para probar el despliegue:

1. Ejecuta manualmente el workflow desde GitHub Actions con `Run workflow`.
2. Confirma que el log no muestre valores de secrets, solo nombres de pasos.
3. Abre la landing publicada por Vercel y envia feedback.
4. Verifica que el registro quede en `public.feedback`.
5. Verifica que llegue el correo de Resend al valor configurado en
   `FEEDBACK_TO_EMAIL`.
