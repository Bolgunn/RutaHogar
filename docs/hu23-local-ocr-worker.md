# Worker OCR local de HU23

Azure es el proveedor predeterminado. La opción `local` utiliza un worker OCR privado y no tiene fallback automático a Azure. Los jobs conservan el proveedor con que fueron creados.

## Procesamiento y privacidad

El backend verifica el consentimiento y reclama el job con una lease. Genera una URL firmada de lectura de cinco minutos para el original privado y la envía al worker por HTTPS. El worker valida el token, el origen y la ruta HU23, rechaza redirecciones y limita el documento a 4 MB y dos páginas.

PDFium extrae texto embebido o renderiza páginas en memoria. Pillow procesa imágenes y Tesseract 5 con `spa` realiza OCR cuando hace falta. Si faltan campos, se prueban rotaciones sin resolver ambigüedades mediante conjeturas. Se devuelven sólo candidatos permitidos, páginas y metadata técnica. El texto OCR completo no se persiste; los originales siguen la retención y limpieza HU23.

Un fallo deja el job reintentable. Una confirmación no recalcula el score: sólo un cambio financiero aceptado y no incorporado a la evaluación deja el score pendiente de actualización explícita. Las evaluaciones anteriores son inmutables.

## Worker Docker en el PC

`workers/hu23_ocr/Dockerfile` usa un contexto restringido e instala PDFium, Pillow, Pydantic, Tesseract y `spa`. PyMuPDF no forma parte de la imagen. Compose usa init, usuario sin privilegios, filesystem de sólo lectura, tmpfs, capacidades descartadas, una CPU y 1 GiB. Publica únicamente `127.0.0.1:8011`.

Crear `workers/hu23_ocr/.local/worker.env` con acceso restringido y sin versionarlo. Incluir `HU23_LOCAL_OCR_TOKEN` aleatorio y `HU23_OCR_STORAGE_ORIGIN`, el origen exacto de Storage accesible por el contenedor. El directorio `.local` está ignorado. No imprimir el token ni las URLs firmadas.

```bash
docker compose -f workers/hu23_ocr/compose.local.yml -p hu23_ocr up -d --build
```

Compose lee el archivo mediante `env_file`. Cargar el mismo token en el backend con un parser dotenv que no conserve CRLF. Ambos servicios rechazan tokens con espacios invisibles al inicio o al final. `GET /health` sólo devuelve el estado.

Para el piloto, configurar el backend con `HU23_OCR_PROVIDER=local` y `HU23_LOCAL_OCR_URL=https://ocr.rutahogar.cl`. El túnel TLS apunta al puerto loopback del worker; no publicar el servidor HTTP directamente. Para Supabase local puede usarse `HU23_LOCAL_OCR_DOCKER_STORAGE_ORIGIN=http://host.docker.internal:55321` y el mismo origen en el worker. Esta reescritura exige Supabase HTTP loopback, el hostname Docker indicado y el mismo puerto; está deshabilitada en Vercel production y preview. El worker no necesita claves de Supabase ni Azure.

Omitir `HU23_OCR_PROVIDER` o seleccionar `azure` mantiene el proveedor predeterminado. El PC, Docker y el túnel deben estar disponibles; el token debe mantenerse privado. Un documento especialmente ruidoso puede agotar el tiempo de OCR y quedar reintentable.

El backend expone `GET /tracking/documents/diagnostics/ocr` solo para un administrador global autenticado. Devuelve el proveedor y booleanos de configuración, sin URLs ni secretos. Los nombres del backend son `HU23_OCR_PROVIDER`, `HU23_LOCAL_OCR_URL`, `HU23_LOCAL_OCR_TOKEN`, `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` y `AZURE_DOCUMENT_INTELLIGENCE_KEY`; los proveedores válidos son `azure` y `local`. `ready_for_selected_provider` también comprueba el formato requerido por el cliente, pero no comprueba conectividad ni credenciales. Si no se configura explícitamente `HU23_OCR_PROVIDER`, el backend usa Azure por defecto y el diagnóstico informa `ready_for_selected_provider=false`. El endpoint requiere un nuevo despliegue del backend para estar disponible.

## Migración y cierre

La migración aditiva `20261027210000_hu23_local_ocr_poc.sql` conserva su nombre histórico para no cambiar la identidad de una migración ya aplicada. El rollback no debe reinterpretar jobs locales como Azure. No ejecutar migraciones enlazadas para pruebas locales.

SIGTERM y SIGINT interrumpen el grupo del trabajo y recogen el hijo. SIGKILL requiere que Docker o el supervisor termine el cgroup completo. Mantener un período de gracia y proteger también memoria, swap y core dumps en el host.

## Pruebas

Las pruebas usan Tesseract 5 con `spa` y `workers/hu23_ocr/requirements-dev.txt`. PyMuPDF se utiliza exclusivamente para generar fixtures sintéticos y comprobar paridad, nunca en runtime.

```bash
PYTHONPATH="$PWD/backend:$PWD" workers/hu23_ocr/.venv-dev/bin/python -m pytest workers/hu23_ocr/tests -q
HU23_WORKER_TEST_PYTHON="$PWD/workers/hu23_ocr/.venv/bin/python" \
  HU23_FIXTURE_TEST_PYTHON="$PWD/workers/hu23_ocr/.venv-dev/bin/python" \
  backend/.venv/bin/python scripts/test-hu23-persistence.py
```

El runner crea PostgreSQL local desechable y ejecuta pruebas SQL, backend y rollback. Con la imagen real construida y `HU23_DOCKER_REAL_TEST=1`, la prueba optativa comprueba SIGTERM, SIGKILL y recuperación de jobs. Usa sólo documentos sintéticos.

Conservar los avisos de licencia de PDFium y sus dependencias, Pillow, Pydantic y Tesseract que correspondan al artefacto distribuido; revisar los archivos del wheel y de los paquetes del sistema incluidos en la imagen concreta.
