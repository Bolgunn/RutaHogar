# Plan: HU19 - Portal Inmobiliario Inteligente (RAG)

**Categoría:** Importante

## 1. Historia oficial

Como lead, quiero buscar opciones de vivienda utilizando descripciones naturales (ej. "departamento con vista al atardecer, cocina integrada, cerca del metro"), para encontrar propiedades reales que se ajusten a mis gustos sin depender de filtros rígidos y descubrir si califico financieramente para ellas en RutaHogar.

### Criterios de aceptación

- **E1:** Dado que existen propiedades reales extraídas en la base de datos, cuando el usuario realice una búsqueda con lenguaje natural, entonces el sistema debe buscar mediante vectores y retornar las propiedades semánticamente más relevantes.
- **E2:** Dado que el sistema retorna resultados de búsqueda, cuando el usuario visualice las propiedades, entonces cada tarjeta debe incluir un llamado a la acción (CTA) para redirigirlo a RutaHogar a evaluar su crédito.
- **E3:** Dado que el usuario está revisando una propiedad en los resultados, cuando seleccione una propiedad que le interesa, entonces el sistema debe mostrar un llamado a la acción (CTA) claro que lo invite a evaluar su compatibilidad financiera para esa propiedad en RutaHogar (ej. "Ver si califico para este departamento").
- **E4:** Dado que el catálogo de propiedades puede no estar actualizado en tiempo real, cuando el usuario revise los resultados de búsqueda, entonces el sistema debe indicar de forma visible que la información es referencial y que los detalles definitivos (disponibilidad, precio exacto, condiciones) deben verificarse en el portal inmobiliario de origen.
- **E5:** Dado que el usuario realiza una búsqueda muy específica o con pocos resultados, cuando el sistema no encuentre propiedades que coincidan, entonces debe mostrar un mensaje claro indicando que no hay resultados y, si es posible, sugerir ampliar o modificar su descripción (ej. "Prueba buscando con menos restricciones o cambiando la comuna").

## 2. Implementación

| Pieza | Dónde |
|---|---|
| Catálogo vectorial `proyectos_rag` (pgvector, HNSW, RPC `match_proyectos_rag`) | `supabase/migrations/20260920000000_hu19_proyectos_rag.sql` |
| Escritura solo para `service_role` | `supabase/migrations/20261005150000_hu19_proyectos_rag_lock_writes.sql` |
| Tipos en singular (corrige filas ya cargadas) | `supabase/migrations/20261005160000_hu19_proyectos_rag_tipo_singular.sql` |
| Ingesta Apify → e5 → Supabase | `backend/scripts/dump_apify.py`, `backend/scripts/ingest_apify.py` (ver `README_INGESTION.md`) |
| Búsqueda semántica, intención (tipo, comuna, dormitorios, baños, UF) y umbral | `backend/app/properties_search.py` |
| Endpoint `POST /api/properties/search` | `backend/app/main.py` |
| Barra, tarjetas, modal de detalle, disclaimer y estado vacío | `frontend/src/components/PropertySearch.jsx` |
| CTA → precalificación con la propiedad precargada | `startEvaluation` en `frontend/src/App.jsx` |

Embeddings: `intfloat/multilingual-e5-small` (384 dims) vía Hugging Face Inference API (`HUGGINGFACE_API_KEY`); torch no cabe en el límite de Vercel. Umbral `DEFAULT_SIMILARITY_THRESHOLD = 0.85`, aplicado sobre la similitud ajustada por intención.

## 3. Mapeo de criterios

- **E1:** `test_semantic_ranking_criterion_E1`, `test_intent_boosts_keep_semantic_order_without_ties`, `test_compound_communes_are_detected`.
- **E2 / E3:** `test_ctas_and_disclaimer_criteria_E2_E3_E4`, `test_cta_text_follows_property_type`, `PropertySearch.test.jsx`.
- **E4:** disclaimer en cada respuesta del backend, visible en la vista.
- **E5:** `test_empty_results_handling_criterion_E5`, `test_commune_without_inventory_returns_no_results`.

## 4. Despliegue

1. Variable `HUGGINGFACE_API_KEY` en Vercel (sin ella el portal responde 503).
2. Aplicar a mano en el Supabase hosteado, en orden: `20261005150000_hu19_proyectos_rag_lock_writes.sql` y `20261005160000_hu19_proyectos_rag_tipo_singular.sql` (la tabla base ya existe).
3. La ingesta usa `SUPABASE_SERVICE_ROLE_KEY`; los volcados `raw_apify_dump*.json` no se versionan.

## 5. Limitaciones conocidas

- El 98% del catálogo actual es de la comuna de Santiago: buscar otra comuna devuelve el mensaje de E5 con la sugerencia de cambiarla. Ampliar a otras comunas de la RM queda para una HU propia (ver `docs/ADR_HU19_Ingesta_Hibrida.md`).
- Los avisos scrapeados traen solo el título como descripción, así que la búsqueda semántica trabaja sobre títulos.
