import importlib.util
import math
import re
import unittest
from unittest.mock import patch
from app.properties_search import (
    EmbeddingError,
    generate_text_embedding,
    calculate_cosine_similarity,
    search_properties,
    RUTAHOGAR_REFERENTIAL_DISCLAIMER,
    EMPTY_RESULTS_SUGGESTION
)
from fastapi.testclient import TestClient
from app import properties_search as properties_search_module
from app.main import app


class _Vector(list):
    def tolist(self):
        return list(self)


class FakeEncoder:
    """Doble de MiniLM: bolsa de palabras hasheada, determinista y sin descargar el modelo."""

    def __init__(self):
        self.calls = []

    def encode(self, texts, **kwargs):
        self.calls.append(list(texts))
        return [self._encode_one(text) for text in texts]

    @staticmethod
    def _encode_one(text):
        vec = [0.0] * 384
        for token in re.findall(r"\w+", text.lower()):
            h = 0
            for char in token:
                h = (h * 31 + ord(char)) & 0xFFFFFFFF
            vec[h % 384] += 1.0
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return _Vector(v / norm for v in vec)


class TestPropertiesSearchRAG(unittest.TestCase):

    def setUp(self):
        # Los criterios se verifican contra el catálogo local, no contra los datos
        # vivos de Supabase que cambian con cada ingesta. patch.object y no un
        # string: otros tests recargan app.* y el nombre apuntaría a otro módulo.
        supabase_patch = patch.object(properties_search_module, "_query_supabase_proyectos_rag", return_value=None)
        supabase_patch.start()
        self.addCleanup(supabase_patch.stop)
        self.encoder = FakeEncoder()
        model_patch = patch.object(properties_search_module, "_get_embedding_model", return_value=self.encoder)
        model_patch.start()
        self.addCleanup(model_patch.stop)
        catalog_patch = patch.object(properties_search_module, "_local_catalog_vectors", None)
        catalog_patch.start()
        self.addCleanup(catalog_patch.stop)
        self.client = TestClient(app)

    def test_generate_text_embedding(self):
        vec = generate_text_embedding("departamento 2 dormitorios en Santiago")
        self.assertEqual(len(vec), 384)
        norm = math.sqrt(sum(v * v for v in vec))
        self.assertAlmostEqual(norm, 1.0, places=4)

    def test_cosine_similarity(self):
        v1 = generate_text_embedding("casa en las condes con piscina")
        v2 = generate_text_embedding("casa en las condes con quincho y jardin")
        v3 = generate_text_embedding("departamento economico en la florida")
        
        sim_similar = calculate_cosine_similarity(v1, v2)
        sim_different = calculate_cosine_similarity(v1, v3)
        
        self.assertGreater(sim_similar, sim_different)

    def test_semantic_ranking_criterion_E1(self):
        """Verifica que la búsqueda vectorial ordene por similitud semántica descendente (E1)."""
        res = search_properties(query="departamento en Santiago cerca de metro bellas artes", limit=5)
        results = res.get("results", [])
        self.assertGreater(len(results), 0)
        
        # Verificar orden descendente por similarity
        similarities = [item["similarity"] for item in results]
        self.assertEqual(similarities, sorted(similarities, reverse=True))
        
        # El primer resultado debe ser el departamento de Santiago
        first_item = results[0]
        self.assertEqual(first_item["commune"], "Santiago")

    def test_ctas_and_disclaimer_criteria_E2_E3_E4(self):
        """Verifica la presencia de los CTAs de RutaHogar (E2/E3) y el disclaimer referencial (E4)."""
        res = search_properties(query="departamento 2 dormitorios", limit=3)
        
        # Disclaimer referencial (E4)
        self.assertIn("disclaimer", res)
        self.assertEqual(res["disclaimer"], RUTAHOGAR_REFERENTIAL_DISCLAIMER)
        
        results = res.get("results", [])
        self.assertGreater(len(results), 0)
        for item in results:
            self.assertIn("cta_text", item)
            self.assertIn("cta_url", item)
            expected = "este departamento" if item["property_type"] == "departamento" else "esta casa"
            self.assertEqual(item["cta_text"], f"Ver si califico para {expected}")
            self.assertTrue(item["cta_url"].startswith("/evaluacion"))

    def test_empty_results_handling_criterion_E5(self):
        """Verifica el mensaje sugerido cuando la búsqueda no produce resultados (E5)."""
        res = search_properties(query="departamento super economico", max_price_uf=100.0)
        self.assertEqual(res["total"], 0)
        self.assertEqual(len(res["results"]), 0)
        self.assertIn("suggestion", res)
        self.assertEqual(res["suggestion"], EMPTY_RESULTS_SUGGESTION)

    def test_bathrooms_intent_ranking(self):
        """Verifica que buscar 'departamento con 2 baños' priorice propiedades con >=2 baños sobre las de 1 baño."""
        res = search_properties(query="departamento con 2 baños", limit=5)
        results = res.get("results", [])
        self.assertGreater(len(results), 0)
        first_item = results[0]
        self.assertGreaterEqual(first_item["bathrooms"], 2)

    def test_fastapi_endpoint_api_properties_search(self):
        """Verifica que el endpoint HTTP /api/properties/search funcione correctamente."""
        payload = {
            "query": "casa 4 dormitorios en Las Condes",
            "property_type": "casa",
            "limit": 3
        }
        response = self.client.post("/api/properties/search", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["query"], payload["query"])
        self.assertIn("results", data)
        self.assertIn("disclaimer", data)
        self.assertGreater(len(data["results"]), 0)
        self.assertEqual(data["results"][0]["commune"], "Las Condes")

    def test_max_price_uses_chilean_thousands_separator(self):
        from app.properties_search import _extract_query_intent
        self.assertEqual(_extract_query_intent("hasta 3.000 UF")["req_max_uf"], 3000.0)
        self.assertEqual(_extract_query_intent("2.650,5 uf")["req_max_uf"], 2650.5)

    def test_database_rows_without_similarity_are_not_boosted(self):
        rows = [{"id": "x", "nombre": "Depto", "comuna": "Santiago", "valor_uf": 2000, "similarity": 0.0}]
        with patch.object(properties_search_module, "_query_supabase_proyectos_rag", return_value=rows):
            res = search_properties(query="departamento")
        self.assertEqual(res["total"], 0)

    def test_empty_database_result_is_not_replaced_by_local_catalog(self):
        with patch.object(properties_search_module, "_query_supabase_proyectos_rag", return_value=[]):
            res = search_properties(query="departamento en Santiago")
        self.assertEqual(res["total"], 0)
        self.assertEqual(res["suggestion"], EMPTY_RESULTS_SUGGESTION)

    def test_depto_abbreviation_excludes_houses(self):
        rows = [
            {"id": "c", "nombre": "Casa amplia", "tipo_vivienda": "casas", "comuna": "Santiago", "valor_uf": 5000, "similarity": 0.9},
            {"id": "d", "nombre": "Departamento centrico", "tipo_vivienda": "departamentos", "comuna": "Santiago", "valor_uf": 3000, "similarity": 0.6},
        ]
        with patch.object(properties_search_module, "_query_supabase_proyectos_rag", return_value=rows):
            res = search_properties(query="depto en santiago")
        self.assertEqual([item["id"] for item in res["results"]], ["d"])
        self.assertEqual(res["results"][0]["cta_text"], "Ver si califico para este departamento")

    def test_cta_text_follows_property_type(self):
        rows = [{"id": "c", "nombre": "Casa", "tipo_vivienda": "casa", "comuna": "Santiago", "valor_uf": 5000, "similarity": 0.9}]
        with patch.object(properties_search_module, "_query_supabase_proyectos_rag", return_value=rows):
            res = search_properties(query="casa con jardin")
        self.assertEqual(res["results"][0]["cta_text"], "Ver si califico para esta casa")

    def test_depto_and_departamento_share_embedding(self):
        self.assertEqual(
            generate_text_embedding("depto 2 dormitorios"),
            generate_text_embedding("departamento 2 dormitorios"),
        )

    def test_model_receives_normalized_abbreviations(self):
        generate_text_embedding("Depto en Ñuñoa")
        self.assertEqual(self.encoder.calls[-1], ["departamento en ñuñoa"])

    def test_missing_embedding_model_returns_503(self):
        with patch.object(properties_search_module, "_get_embedding_model", side_effect=EmbeddingError("sin modelo")):
            response = self.client.post("/api/properties/search", json={"query": "depto"})
        self.assertEqual(response.status_code, 503)

    def test_ingest_embeds_all_rows_in_one_batch(self):
        from scripts import ingest_apify
        # test_cors recarga app.*; se fija la función del módulo ya parchado.
        self.enterContext(patch.object(ingest_apify, "generate_text_embeddings", properties_search_module.generate_text_embeddings))
        proyectos = [
            {"nombre": "Casa", "descripcion": "", "comuna": "Maipú", "tipo_vivienda": "casa", "dormitorios": 3},
            {"nombre": "Depto", "descripcion": "", "comuna": "Santiago", "tipo_vivienda": "departamento", "dormitorios": 2},
        ]
        ingest_apify.attach_embeddings(proyectos)
        self.assertEqual(len(self.encoder.calls), 1)
        self.assertTrue(all(len(p["embedding"]) == 384 for p in proyectos))

    def test_top_similarities_are_logged_at_debug_level(self):
        with self.assertLogs(properties_search_module.logger, level="DEBUG") as logs:
            search_properties(query="departamento en Santiago")
        self.assertTrue(any("top5" in line and line.startswith("DEBUG") for line in logs.output))



@unittest.skipUnless(importlib.util.find_spec("sentence_transformers"), "sentence-transformers no instalado")
class TestMiniLMModel(unittest.TestCase):
    """Usa el modelo real (descarga ~90 MB la primera vez)."""

    def test_real_model_outputs_384_normalized_dimensions(self):
        vec = generate_text_embedding("departamento 2 dormitorios en Santiago")
        self.assertEqual(len(vec), 384)
        self.assertAlmostEqual(math.sqrt(sum(v * v for v in vec)), 1.0, places=4)

    def test_real_model_ranks_related_listing_higher(self):
        query = generate_text_embedding("depto cerca del metro")
        related = generate_text_embedding("departamento a pasos de estación de metro")
        unrelated = generate_text_embedding("casa con jardín y quincho en la precordillera")
        self.assertGreater(
            calculate_cosine_similarity(query, related),
            calculate_cosine_similarity(query, unrelated),
        )


if __name__ == "__main__":
    unittest.main()

