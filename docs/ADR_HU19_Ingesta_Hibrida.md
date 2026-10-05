# ADR: Orquestación de Ingesta Híbrida y Diagnóstico de Calidad para RAG (HU-19)

**Estado:** Propuesto (Pending Architectural Decision)  
**Fecha:** 21 de Septiembre de 2026  
**Autor:** Technical Lead — RutaHogar Team  
**Relacionado:** HU-19 (Portal Inmobiliario Inteligente - RAG)

---

## 1. Estado de Avance (HU-19)

Se ha completado exitosamente la fase inicial de infraestructura y pipeline desacoplado para la Búsqueda Inteligente RAG en **RutaHogar**:

1. **Soporte Vectorial en Supabase (`public.proyectos_rag`):**
   - Habilitación de la extensión `pgvector` e implementación de la tabla `public.proyectos_rag` con vectores de 384 dimensiones (`vector(384)`).
   - Creación del índice vectorial HNSW (`proyectos_rag_embedding_hnsw_idx`) para búsquedas por similitud semántica de coseno.
   - Definición de la función RPC `match_proyectos_rag` para consultas vectoriales optimizadas con filtrado por atributos.

2. **Desacoplamiento del Pipeline de Ingesta:**
   - **[`backend/scripts/dump_apify.py`](../backend/scripts/dump_apify.py):** Módulo exclusivo para autenticación y extracción HTTP desde el actor Apify (`scraperschile/portal-inmobiliario-chile-scraper-api`), desacoplado del consumo de cuota y procesamiento de embeddings.
   - **[`backend/scripts/ingest_apify.py`](../backend/scripts/ingest_apify.py):** Módulo de transformación e ingesta local que procesa volcados estáticos (`raw_apify_dump.json`), genera embeddings `intfloat/multilingual-e5-small` vía Hugging Face Inference API y realiza la carga a Supabase. Los volcados quedan solo en la máquina local (`.gitignore`).

3. **Saneamiento del Locale Chileno y Extracción Dinámica de Comunas:**
   - **Parsing numérico chileno:** Resolución de problemas de miles (`.`) y decimales (`,`), auto-corrigiendo casos de truncamiento en valores UF expresados en miles.
   - **Extracción de comunas de la RM:** Eliminación de la vulnerabilidad que asignaba nombres de calles como comunas; implementación de diccionario de comunas conocidas de la Región Metropolitana y parsing de segmentos de dirección.

---

## 2. Diagnóstico Actual y Evaluación de Calidad

Tras realizar un **Análisis Exploratorio de Datos (EDA)** sobre el dataset extraído (384 propiedades totales: 192 departamentos y 192 casas), se identificaron dos problemas críticos de calidad de datos que afectan la precisión del RAG:

### A. Sesgo Geográfico Severo
- El 98.2% de los registros extraídos (377 de 384) corresponden a la comuna de **Santiago (Santiago Centro)**.
- Comunas con alta demanda habitacional e inversión en RutaHogar (ej. **Providencia**, **Ñuñoa**, **Las Condes**, **La Florida**, **San Miguel**) tienen una representación nula o marginal (menor al 1.8%).

### B. Presencia de Outliers Comerciales / Patrimoniales
- El scraping sin filtros de tipo de inmueble capturó casonas comerciales, conventillos y terrenos de inversión patrimonial en el centro histórico (ej. propiedades con 28 a 35 dormitorios y 16 baños, o precios de hasta **120.000 UF** ~ $4.560 Millones CLP).
- Estos datos distorsionan el ordenamiento semántico y financiero en la plataforma **RutaHogar**, degradando las sugerencias para usuarios en busca de vivienda residencial.

---

## 3. Decisión Arquitectónica Propuesta: Targeted Scraping Pipeline

Para resolver el sesgo geográfico y la degradación por outliers, se propone evolucionar de la extracción manual mono-ubicación a un **flujo orquestado de Targeted Scraping**.

### A. Manifiesto de Extracción Matricial (`extraction_manifest.json`)
Definir una matriz de configuración estandarizada que guíe la extracción por comunas objetivo de la Región Metropolitana:

```json
{
  "target_communes": ["Providencia", "Ñuñoa", "Santiago", "Las Condes", "La Florida", "San Miguel"],
  "property_types": ["departamento", "casa"],
  "max_pages_per_combination": 2,
  "max_price_uf_cutoff": 15000
}
```

### B. Orquestador Automático de Terminal (`orchestrate_ingestion.py`)
Un único comando de terminal ejecutará el pipeline completo de forma autónoma:

1. **Iteración Matricial:** Recorre cada combinación (Comuna x Tipo de Propiedad) usando `dump_apify.py` o un orquestador unificado.
2. **Filtrado de Outliers:** Descarta automáticamente propiedades con `valor_uf > 15.000 UF` o con atributos atípicos no residenciales (ej. `dormitorios > 8`).
3. **Carga Aditiva Autónoma:** Invoca a `ingest_apify.py` con el flag `--append` (`--no-truncate`), poblando la tabla `public.proyectos_rag` de forma aditiva y variada entre múltiples comunas sin sobreescribir datos limpios existentes.

---

## 4. Estado de la Decisión

- [x] **Aprobado el desacoplamiento Dump / Ingesta.**
- [ ] **Pendiente implementación de Orquestador Matricial y Manifiesto.**
