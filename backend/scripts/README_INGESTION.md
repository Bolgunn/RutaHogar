# RutaHogar — Ingesta del catálogo del Portal Inmobiliario (HU19)

El catálogo del portal vive en `public.proyectos_rag` (Supabase + pgvector). Se carga en dos pasos
desacoplados, para no gastar cuota de Apify cada vez que se ajusta la normalización:

1. [`dump_apify.py`](dump_apify.py) descarga avisos crudos de Portal Inmobiliario desde Apify a un JSON local.
2. [`ingest_apify.py`](ingest_apify.py) normaliza esos JSON, genera los embeddings y los carga en Supabase.

Los volcados `backend/raw_apify_dump*.json` son datos scrapeados: están en `.gitignore` y se quedan en
la máquina de quien hace la ingesta.

---

## 1. Variables de entorno (`backend/.env`)

| Variable | Para qué |
|---|---|
| `APIFY_API_KEY` | Solo `dump_apify.py` |
| `SUPABASE_URL` | Proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Escritura del catálogo. Desde `20261005150000_hu19_proyectos_rag_lock_writes.sql` solo `service_role` puede escribir `proyectos_rag` |
| `HUGGINGFACE_API_KEY` | Embeddings `intfloat/multilingual-e5-small` (384 dims) vía Hugging Face Inference API |

---

## 2. Descargar desde Apify

```bash
cd backend
.venv/bin/python scripts/dump_apify.py --type=departamento --pages=4 --out=raw_apify_dump.json
.venv/bin/python scripts/dump_apify.py --type=casa --pages=4 --out=raw_apify_dump_casas.json
```

## 3. Ingestar en Supabase

```bash
cd backend
.venv/bin/python scripts/ingest_apify.py --dry-run     # normaliza y vectoriza sin escribir
.venv/bin/python scripts/ingest_apify.py               # reemplaza todo el catálogo (ambos volcados)
.venv/bin/python scripts/ingest_apify.py --file=raw_apify_dump_casas.json --append  # agrega sin borrar
```

Sin `--append` el script vacía `proyectos_rag` antes de cargar. Después de reingestar, revisar el
umbral `DEFAULT_SIMILARITY_THRESHOLD` en `app/properties_search.py` con los logs de debug
(`RAG supabase query=... top5=...`): está calibrado para el catálogo actual.

---

## 4. Estructura de `public.proyectos_rag`

Definida en `supabase/migrations/20260920000000_hu19_proyectos_rag.sql` (espejo en `supabase/schema.sql`).

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `uuid` | Identificador (auto-generado) |
| `nombre` | `text` | Título del aviso |
| `descripcion` | `text` | Descripción |
| `valor_uf` / `precio_clp` | `numeric` | Precio en UF y en CLP |
| `comuna` / `direccion` | `text` | Ubicación; la comuna se valida contra las de la RM |
| `tipo_vivienda` | `text` | `departamento` o `casa` (singular) |
| `dormitorios` / `banos` | `integer` | — |
| `superficie_m2` | `numeric` | — |
| `url` / `imagen_url` | `text` | Aviso original e imagen |
| `fuente` | `text` | `Portal Inmobiliario (Apify)` |
| `embedding` | `vector(384)` | Embedding e5 del texto `passage: ...` |

La búsqueda usa la RPC `match_proyectos_rag` (distancia coseno, índice HNSW).
