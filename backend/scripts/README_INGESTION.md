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
| `HUGGINGFACE_API_KEY` | Solo con `--hf-embeddings`; por defecto la ingesta vectoriza en local |

---

## 2. Descargar desde Apify

El actor (`scraperschile/portal-inmobiliario-chile-scraper-api`) cobra por aviso: ~US$0,003 más
proxy, unos **US$0,15 por página de 48 avisos**. El plan Free da US$5 al mes. Cada corrida va con
`maxItems` y `maxTotalChargeUsd`, y el script no la lanza si el crédito quedaría bajo US$0,50.

Para que el RAG no quede sesgado a una comuna, se descarga una página por comuna y tipo:

```bash
cd backend
.venv/bin/python scripts/dump_apify.py --type=departamento --pages=1 --location=Ñuñoa   # -> raw_apify_departamento_nunoa.json
.venv/bin/python scripts/dump_apify.py --type=casa --pages=1 --location=Maipú          # -> raw_apify_casa_maipu.json
```

Sin `--location` busca en Santiago y escribe `raw_apify_dump.json` (o lo que diga `--out=`).

## 3. Ingestar en Supabase

```bash
cd backend
.venv/bin/python scripts/ingest_apify.py --dry-run     # normaliza y vectoriza sin escribir
.venv/bin/python scripts/ingest_apify.py               # reemplaza todo el catálogo (todos los raw_apify_*.json)
.venv/bin/python scripts/ingest_apify.py --file=raw_apify_casa_maipu.json --append  # agrega sin borrar
.venv/bin/python scripts/ingest_apify.py --backfill    # completa inmobiliaria/precio_desde/estado por url
```

Los embeddings se calculan en local con `sentence-transformers` (ya está en el `.venv`), con el
mismo modelo, prefijo `passage:` y normalización que la Inference API: el coseno entre ambos es 1,0.
Así la ingesta no gasta cuota de Hugging Face. El modelo local **no** se despliega: el backend en
Vercel sigue vectorizando las consultas con la API. `--hf-embeddings` vuelve a usar la API.

Antes de cargar, el script imprime la distribución por comuna y tipo para revisar el balance.

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
| `estado` | `text` | `en_construccion` si el aviso dice "Venta en verde/blanco"; si no, `disponible` |
| `inmobiliaria` | `text` | `seller` del aviso; `null` si no lo informa (no se deduce del título) |
| `precio_desde` | `boolean` | `true` si el precio es "Desde UF ..." (proyecto), `false` si es fijo |
| `embedding` | `vector(384)` | Embedding e5 del texto `passage: ...` |

La búsqueda usa la RPC `match_proyectos_rag` (distancia coseno, índice HNSW).
