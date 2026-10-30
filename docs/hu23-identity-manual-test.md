# Prueba manual local de identidad HU23

## Preparación

Se puede trabajar desde este mismo checkout aunque esté linked a Supabase remoto.
El fixture ignora el enlace y no lee ni modifica `supabase/.temp/project-ref`.
El comando de fixtures requiere el esquema actual, HU13 y HU23 con identity guard.
Para preparar o reconstruir ese stack desde este checkout, usar el bootstrap
separado del historial (borra únicamente los datos del Supabase local):

```bash
make hu23-local-reset
make hu23-identity-fixtures
```

Ver [bootstrap local y diagnóstico del historial](hu23-local-bootstrap.md).
El fixture por sí solo no aplica DDL ni levanta servicios.
No usar `db push`, `--linked` ni credenciales de un proyecto remoto.

Con Docker activo, levantar y preparar el stack **local**:

```bash
make hu23-local-reset
```

Tomar URL y claves del `supabase status` local, sin publicarlas ni versionarlas.
Configurar `backend/.env` con `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` locales;
`frontend/.env.local` con `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` locales
y `VITE_API_URL=http://127.0.0.1:8000` para la prueba manual de la aplicación.
El comando de fixtures ignora los `.env*`, las URLs y claves Supabase del entorno
y las variables de Vercel. Su URL y clave siempre se obtienen de `status` local,
nunca de estos archivos. La aplicación debe configurarse por separado para local.

Para mantener también el OCR en el PC, usar el worker existente, sin túnel ni Azure.
En `workers/hu23_ocr/.local/worker.env` configurar un token aleatorio de al menos
32 caracteres y el origen local de Storage accesible desde Docker:

```dotenv
HU23_LOCAL_OCR_TOKEN=<token-local-aleatorio>
HU23_OCR_STORAGE_ORIGIN=http://host.docker.internal:54321
```

En `backend/.env` configurar:

```dotenv
HU23_OCR_PROVIDER=local
HU23_LOCAL_OCR_URL=http://127.0.0.1:8011
HU23_LOCAL_OCR_TOKEN=<el-mismo-token-local>
HU23_LOCAL_OCR_DOCKER_STORAGE_ORIGIN=http://host.docker.internal:54321
MARKET_SNAPSHOT_ALLOW_FIXTURE=true
```

Sustituir **ambos** puertos `54321` por el puerto real de `API_URL` si el stack
usa otro, por ejemplo `55321`. El origen debe coincidir exactamente. El token
no es una credencial de Supabase. Más detalles en [el worker existente](hu23-local-ocr-worker.md).

```bash
docker compose -f workers/hu23_ocr/compose.local.yml -p hu23_ocr up -d --build
make install
make hu23-identity-fixtures
```

En dos terminales, desde la raíz:

```bash
make run-backend
make run-frontend
```

Usar Node compatible con Vite 8 (por ejemplo Node 22.23) y el venv del sistema
actual: `.venv/bin` en WSL/Linux, `.venv/Scripts` en Windows.
La aplicación usa `http://localhost:5173` por defecto; comprobar el puerto
anunciado por Vite si está ocupado. No usar la aplicación desplegada.

## Fixtures

| Dato | Comprador | Ejecutivo |
| --- | --- | --- |
| Email | `hu23-identidad@example.com` | `hu23-ejecutivo@example.com` |
| Password local deliberadamente de prueba | `Hu23-Identidad-2026!` | `Hu23-Ejecutivo-2026!` |
| Rol persistido | `usuario` | `ejecutivo` |
| Nombre completo | Camila Fernanda Prueba Usuario | Ejecutivo local HU23 |
| Inmobiliaria | Sin asignación | Inmobiliaria local HU23 identidad |

El comprador usa `nombre=Camila Fernanda`, `apellido_paterno=Prueba`,
`apellido_materno=Usuario`, `rut=1.111.111-4`. Su primera precalificación se crea
con `TrackingService`/`hu13_commit`, ingreso mensual `1450000` y el fixture de
mercado existente, sin IA ni consultas financieras externas. Los demás campos
del snapshot son antecedentes válidos para el contrato de scoring, definidos
en `BASELINE` del script. No se crean documentos ni consentimientos OCR.

Cada ejecución busca los emails con el RPC existente y usa Auth Admin para
crear o asegurar contraseña y confirmación de email. Actualiza los perfiles;
reutiliza la inmobiliaria mediante UUID estable. No crea otra precalificación
si ya hay un plan: **no reinicia cambios financieros hechos durante la prueba**.
Si la cuenta ya tiene una precalificación distinta, revisar el ingreso vigente
antes de probar. No se incluye comando de limpieza: conserva los historiales
inmutables y no desactiva sus triggers.

La protección exige que `supabase status --output json` termine correctamente y
devuelva una API HTTP con puerto explícito en `localhost` o `127.0.0.1`, junto
con una clave service role local no vacía. No pasa `--linked` ni project refs.
La CLI recibe sólo variables básicas del sistema, sin configuraciones remotas
Supabase, Vercel ni overrides de Docker. Auth y la persistencia HU13 usan la URL
y clave de ese status local. Si falta el stack activo o no puede verificarlo,
aborta antes de escribir. Los clientes HTTP locales no siguen redirecciones ni
usan proxies del entorno.

## Documento compatible

1. Iniciar sesión como comprador en la aplicación local. Abrir **Perfil**.
2. Anotar score, última evaluación e ingreso vigente (`1450000`).
3. Abrir **Cargar documento respaldatorio**. Seleccionar **Liquidación de sueldo**
   y el documento sintético compatible: Camila Fernanda Prueba Usuario,
   RUT `1.111.111-4`, renta líquida `$1.450.000`. Máximo 4 MB y dos páginas.
4. Pulsar **Subir documento**, aceptar el consentimiento de procesamiento y pulsar
   **Procesar y revisar documento**.
5. Debe llegar a revisión (`awaiting_review`), con ingreso detectado `1450000`;
   no debe aparecer **Datos inconsistentes**. La carga/procesamiento no cambia
   perfil ni score. La confirmación y actualización de score siguen siendo explícitas.
6. Para terminar este caso sin alterar antecedentes, conservar el ingreso
   declarado al confirmar. No pulsar actualización de score. Cerrar el intento
   o abrir una nueva carga antes del segundo documento.

## Documento incompatible

1. Con el mismo comprador, anotar nuevamente perfil, score e historial actual.
2. Crear **otro intento** y subir el documento de Diego Andres Ejemplo Demo,
   RUT `2.222.222-8`, renta líquida `$1.450.000`, con el mismo tipo y consentimiento.
3. Pulsar **Procesar y revisar documento**. El mensaje de error debe ser solamente
   **Datos inconsistentes**, sin exponer la identidad detectada ni una revisión financiera.
4. En Network, guardar el UUID del intento y comprobar la respuesta de
   `GET /tracking/documents/sessions/<UUID>`: `state=processing_failed`,
   `failure_code=identity_inconsistent`, `candidates=[]`, `evidence=[]`.
5. Confirmar que perfil, ingreso, score e historial no cambiaron respecto al paso 1.
   En el SQL Editor de **Studio local**, verificar también:

```sql
select d.id, d.state, d.failure_code,
       (select count(*) from public.document_candidates c where c.process_id=d.id) as candidatos
from public.document_processes d
join auth.users u on u.id=d.user_id
where u.email='hu23-identidad@example.com'
order by d.created_at desc;

select p.nombre,p.apellido_paterno,p.apellido_materno,p.full_name,p.rut,
       e.id as evaluacion,e.score,e.created_at
from public.profiles p
join auth.users u on u.id=p.id
left join public.evaluations e on e.user_id=p.id
where u.email='hu23-identidad@example.com'
order by e.created_at desc;
```

Ejecutar la segunda consulta antes y después para comparar. La primera debe
mostrar cero candidatos para el intento incompatible. No usar el SQL Editor remoto.

## Ejecutivo y privacidad

1. Cerrar sesión y abrir otra sesión del navegador como ejecutivo. Debe ingresar
   al área comercial, sin privilegios de administrador global. Su inmobiliaria
   de prueba está vacía: no se asignan proyectos ni leads para inventar alcance.
2. No debe existir enlace para ver/descargar el original ni la identidad extraída.
3. Con DevTools en la aplicación local y el UUID del intento del comprador,
   ejecutar (no imprimir ni copiar tokens):

```javascript
const { trackingRequest } = await import('/src/services/trackingService.js');
await trackingRequest('/documents/sessions/<UUID-del-intento>');
```

Debe fallar con `not_found` (HTTP 404), sin datos del intento. Probar tanto el
intento compatible como el incompatible. El ejecutivo tampoco puede obtener una
URL de lectura autenticada del bucket `hu23-document-temporary`; las pruebas RLS
verifican que no pueda listar ni leer originales o candidatos.

4. Para la proyección comercial, ejecutar:

```javascript
const { getStaffDocumentBacking } = await import('/src/services/documentBacking.js');
await getStaffDocumentBacking('<UUID-del-comprador>');
```

Sin relación comercial autorizada, debe fallar con `owner_mismatch` (HTTP 403).
Si posteriormente se establece una relación mediante el flujo comercial normal,
HU23 sólo permite la proyección `{field,status,confirmed_on}` de los cuatro campos
financieros autorizados. No incluye original, rutas, identidad ni texto OCR.
El fixture no amplía permisos para lograr esa relación.

## Pruebas automatizadas

```bash
backend/.venv/bin/python -m pytest backend/tests/fixtures/test_hu23_identity_fixtures.py -q
backend/.venv/bin/python scripts/test-hu23-persistence.py --pg-bin /ruta/local/postgresql/bin
cd frontend
npm test -- src/components/documents src/services/__tests__/documentReview.test.js
```

El runner de persistencia crea y destruye su propio clúster PostgreSQL, sin URLs
ni credenciales Supabase. Ejecuta SQL HU13/HU23, grants/RLS, identidad, privacidad,
atomicidad y rollback, además de los tests backend de documentos. Los tests
adicionales usan las identidades exactas y el rol del fixture con ambos documentos.
