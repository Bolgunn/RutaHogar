import unittest
import math
from app.properties_search import (
    generate_text_embedding,
    calculate_cosine_similarity,
    search_properties,
    RUTAHOGAR_REFERENTIAL_DISCLAIMER,
    EMPTY_RESULTS_SUGGESTION
)
from fastapi.testclient import TestClient
from app.main import app

class TestPropertiesSearchRAG(unittest.TestCase):

    def setUp(self):
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
            self.assertEqual(item["cta_text"], "Ver si califico para este departamento")
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

if __name__ == "__main__":
    unittest.main()

