# Bootstrap local reproducible para HU23

Con Docker activo, Python 3.11+ en el venv del backend y la CLI Supabase instalada:

```bash
make hu23-local-reset
make hu23-identity-fixtures
```

`hu23-local-reset` levanta el stack si hace falta y **borra los datos del Supabase
local RutaHogar-HU23**. Se puede repetir. No ejecutar `supabase db reset` directamente
desde el historial antiguo para preparar este entorno. No se necesita desvincular
el checkout del proyecto remoto.

Los puertos locales están explícitos en `supabase/config.toml`: API
`http://127.0.0.1:55321`, PostgreSQL `127.0.0.1:54322`, Studio
`http://127.0.0.1:55323`. El identificador `RutaHogar-HU23` es el nombre del stack
Docker local, no un project ref remoto. Para la aplicación/OCR, seguir la
[guía manual](hu23-identity-manual-test.md); el bootstrap no cambia sus `.env`.

## Diagnóstico del historial

Se reprodujo el fallo de `20260604_corrective_audit.sql` con el reset local y en
una base desechable. Antes del ALTER, `profiles.onboarding_data` es **jsonb** en
la base reconstruida desde el esquema versionado. La migración fue escrita para
una base donde era texto. En `onboarding_data = ''`, PostgreSQL resuelve el
operador de igualdad JSONB y convierte el literal sin tipo `''` a JSONB. La cadena
SQL vacía no es JSON válido: falla con SQLSTATE `22P02` antes de recorrer filas,
incluso con la tabla vacía. La condición `IS NULL OR ...` no evita ese análisis.
La cadena JSON vacía válida sería `'""'::jsonb`, pero reemplazar el literal no
resolvería las demás suposiciones del historial y no se modificó la migración.

Para comprobar el resto se ejecutaron las **68 migraciones** en una base local
desechable. Sólo para ese diagnóstico, en memoria, se cambió la comparación a
`onboarding_data::text = ''`. Apareció otro bloqueo de la primera migración:
`evaluations.deleted_at` no existía; también presupone
`improvement_goals.completed_at`. Agregando ambas columnas en esa base desechable,
la primera y las otras 67 migraciones terminaron correctamente. Este resultado
corresponde al esquema base y los archivos versionados actuales, no certifica
estados históricos externos ni depende de una copia del remoto.

El test de integración vuelve a ejecutar este diagnóstico automáticamente y
destruye las bases auxiliares al terminar. Los archivos históricos permanecen intactos.

## Estrategia

`backend/scripts/hu23_local_reset.py` crea un workdir temporal sin link, `.env`,
seeds ni migraciones históricas. Conserva únicamente la configuración local de
servicios. La CLI inicializa sus esquemas reales de Auth/Storage y roles mediante
`start` y `db reset --local --no-seed` en ese workdir vacío.

Después de verificar el destino, carga `supabase/schema.sql` más complementos
locales reutilizados desde las migraciones versionadas. La carga usa `psql` dentro
del contenedor local, en una única transacción que exige `public`, Auth y objetos
Storage vacíos. Si no están vacíos, se niega a aplicar DDL encima de ellos.
No se usa un dump remoto ni se simulan Auth/Storage en el entorno de prueba manual.

El snapshot solo no bastaba. El ensamblado local incorpora:

- `housing_plan`, nombres separados del perfil y los timestamps históricos;
- `proyectos.descripcion` y `proyectos.entrega_estimada`, con su constraint;
- las funciones y triggers de favoritos del portal;
- las correcciones HU16, incluido el sweeper y la sobrecarga de confiabilidad;
- la firma final de contactos con nombres, RUT y email;
- las definiciones de seguridad de octubre y el funnel vigente;
- `20261029120000_hu23_identity_guard.sql`, ausente del snapshot.

`OVERLAYS` enumera las fuentes exactas. No se editan ni se despliegan esas fuentes.
Se desactiva `check_function_bodies` sólo durante la carga para permitir funciones
SQL que el snapshot declara antes de sus dependencias; vuelve a activarse al final.
RLS y grants siguen aplicándose. Se eliminan las transacciones anidadas del SQL
ensamblado y se notifica a PostgREST para recargar su caché de esquema.

El test de integración compara todas las columnas públicas y firmas de funciones
del replay histórico con el snapshot ensamblado, además de verificar permisos y
bucket HU23. Así detecta dependencias omitidas fuera de las dos RPC inicialmente reportadas.

## Protecciones

- No acepta argumentos, URL alternativa, `--linked`, `--db-url` ni project refs.
- La CLI corre dentro del workdir temporal con variables básicas del sistema;
  no recibe credenciales Supabase remotas, variables Vercel ni overrides Docker.
- Exige un contexto Docker con socket local Unix/Windows; rechaza SSH/TCP.
- `supabase status` debe confirmar API HTTP en `localhost`/`127.0.0.1`, DB
  PostgreSQL en loopback y los puertos exactos de la configuración local.
- Comprueba el contenedor DB, su estado y su puerto antes de usar `psql`.
- La conexión SQL se hace dentro de ese contenedor, sin URLs ni credenciales remotas.
- Antes y después del reset verifica el destino. Al terminar comprueba RPC,
  identity guard, RLS, grants y bucket HU23 privado.

Las claves que `start/status` pueden imprimir se capturan y no se muestran.
El fixture obtiene su URL y clave exclusivamente de `status` local, usa clientes
sin proxies/redirecciones y conserva su comportamiento idempotente.

## Verificación reproducible

```bash
# Seguridad y fixtures (sin crear usuarios reales)
backend/.venv/bin/python -m pytest backend/tests/fixtures -q

# Incluye snapshot completo + diagnóstico histórico en bases Docker desechables.
# Requiere el stack local activo; no modifica la base de la aplicación.
HU23_LOCAL_BOOTSTRAP_TEST=1 backend/.venv/bin/python -m pytest backend/tests/fixtures -q

git diff --check
```

En Windows usar el Python de `.venv/Scripts` o ejecutar estos comandos desde WSL.
El reset deja `hu23_score_context`, `hu23_backing_evidence`,
`hu23_reject_identity`, el constraint `identity_inconsistent` y el bucket
`hu23-document-temporary` privado. El comando de fixtures prepara las cuentas
locales y su precalificación; ningún comando procesa documentos PDF.
