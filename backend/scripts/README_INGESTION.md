# RutaHogar - Guía de Ingesta desde Apify (Portal Inmobiliario RAG)

Este documento explica cómo ejecutar el script de ingesta automatizada [`backend/scripts/ingest_apify.py`](file:///home/mo/Escritorio/UNIVERSIDAD/2026-1/Feria1/ScoreLeads/backend/scripts/ingest_apify.py) para extraer propiedades reales desde **Portal Inmobiliario (Chile)** en Apify, generar sus embeddings vectoriales de 384 dimensiones y sincronizarlas en la base de datos **Supabase** (`public.properties`).

---

## 1. Requisitos Previos y Variables de Entorno

Para realizar la ingesta real, necesitas configurar tres variables de entorno principales:

1. **`APIFY_API_KEY`**: Obtén tu API Key gratuita en la consola de [Apify Console](https://console.apify.com/account/integrations).
2. **`SUPABASE_URL`**: URL de tu proyecto en Supabase (ej: `https://xyzcompany.supabase.co`).
3. **`SUPABASE_SERVICE_ROLE_KEY`** (o `SUPABASE_KEY`): Clave de servicio de Supabase con permisos de inserción en la tabla `public.properties`.

### Ejemplo de Configuración en Terminal (Linux/macOS)

```bash
export APIFY_API_KEY="apify_api_your_personal_token_here"
export SUPABASE_URL="https://tu-proyecto.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
```

---

## 2. Modos de Ejecución del Script

### A. Modo Simulación (`--dry-run`)
Prueba la ingesta y la generación de embeddings en memoria sin insertar registros en Supabase:
```bash
cd backend
.venv/bin/python scripts/ingest_apify.py --dry-run
```

### B. Ingesta desde un Dataset pre-existente en Apify (`--dataset=<ID>`)
Si ya ejecutaste un raspado previa en Apify y tienes un `Dataset ID`:
```bash
cd backend
.venv/bin/python scripts/ingest_apify.py --dataset=abc123xyzDatasetID
```

### C. Ejecución Completa Automática (Apify Actor + Supabase)
Ejecuta el actor en la capa gratuita de Apify, procesa los items extraídos, genera los embeddings vectoriales de 384 dimensiones y los guarda en la tabla `public.properties` de Supabase:
```bash
cd backend
.venv/bin/python scripts/ingest_apify.py
```

---

## 3. Estructura de Datos en Supabase (`public.properties`)

Cada propiedad raspada desde Portal Inmobiliario se almacena con la siguiente estructura:

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `uuid` | Identificador único (auto-generado) |
| `title` | `text` | Título del aviso inmobiliario |
| `description` | `text` | Descripción detallada |
| `price_uf` | `numeric` | Valor en UF |
| `price_clp` | `numeric` | Valor estimado en CLP |
| `commune` | `text` | Comuna de la propiedad |
| `property_type` | `text` | 'departamento', 'casa', etc. |
| `bedrooms` | `int` | Número de dormitorios |
| `bathrooms` | `int` | Número de baños |
| `surface_m2` | `numeric` | Superficie útil o construida |
| `url` | `text` | Enlace a la publicación original en Portal Inmobiliario |
| `image_url` | `text` | Imagen referencial de la propiedad |
| `source` | `text` | Fuente original (`Portal Inmobiliario (Apify)`) |
| `embedding` | `vector(384)` | Vector embedding de similitud semántica |
