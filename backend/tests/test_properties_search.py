import io
import json
import math
import os
import re
import unittest
import urllib.error
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


class FakeEncoder:
    """Doble de la API de Hugging Face: bolsa de palabras hasheada, determinista y sin red."""

    def __init__(self):
        self.calls = []

    def __call__(self, inputs):
        self.calls.append(list(inputs))
        return [self._encode_one(text) for text in inputs]

    @staticmethod
    def _encode_one(text):
        vec = [0.0] * 384
        # El prefijo e5 ("query: "/"passage: ") no aporta significado al doble.
        for token in re.findall(r"\w+", text.lower().split(": ", 1)[-1]):
            h = 0
            for char in token:
                h = (h * 31 + ord(char)) & 0xFFFFFFFF
            vec[h % 384] += 1.0
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]


# El doble de bolsa de palabras da cosenos ~0.3-0.6, no el rango ~0.8-0.9 de E5:
# los tests de orden y CTA usan un umbral bajo que solo descarta los descalces duros.
FAKE_ENCODER_THRESHOLD = 0.1


class TestPropertiesSearchRAG(unittest.TestCase):

    def setUp(self):
        # Los criterios se verifican contra el catálogo local, no contra los datos
        # vivos de Supabase que cambian con cada ingesta. patch.object y no un
        # string: otros tests recargan app.* y el nombre apuntaría a otro módulo.
        supabase_patch = patch.object(properties_search_module, "_query_supabase_proyectos_rag", return_value=None)
        supabase_patch.start()
        self.addCleanup(supabase_patch.stop)
        self.encoder = FakeEncoder()
        model_patch = patch.object(properties_search_module, "_request_embeddings", self.encoder)
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
        res = search_properties(query="departamento en Santiago cerca de metro bellas artes", limit=5, similarity_threshold=FAKE_ENCODER_THRESHOLD)
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
        res = search_properties(query="departamento 2 dormitorios", limit=3, similarity_threshold=FAKE_ENCODER_THRESHOLD)
        
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
        res = search_properties(query="departamento con 2 baños", limit=5, similarity_threshold=FAKE_ENCODER_THRESHOLD)
        results = res.get("results", [])
        self.assertGreater(len(results), 0)
        first_item = results[0]
        self.assertGreaterEqual(first_item["bathrooms"], 2)

    def test_fastapi_endpoint_api_properties_search(self):
        """Verifica que el endpoint HTTP /api/properties/search funcione correctamente."""
        payload = {
            "query": "casa 4 dormitorios en Las Condes",
            "property_type": "casa",
            "limit": 3,
            "similarity_threshold": FAKE_ENCODER_THRESHOLD,
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
            res = search_properties(query="departamento")
        self.assertEqual(res["total"], 0)
        self.assertEqual(res["suggestion"], EMPTY_RESULTS_SUGGESTION)

    def test_depto_abbreviation_excludes_houses(self):
        rows = [
            {"id": "c", "nombre": "Casa amplia", "tipo_vivienda": "casas", "comuna": "Santiago", "valor_uf": 5000, "similarity": 0.95},
            {"id": "d", "nombre": "Departamento centrico", "tipo_vivienda": "departamentos", "comuna": "Santiago", "valor_uf": 3000, "similarity": 0.88},
        ]
        with patch.object(properties_search_module, "_query_supabase_proyectos_rag", return_value=rows):
            res = search_properties(query="depto en santiago")
        self.assertEqual([item["id"] for item in res["results"]], ["d"])
        self.assertEqual(res["results"][0]["cta_text"], "Ver si califico para este departamento")

    def test_cta_text_follows_property_type(self):
        rows = [{"id": "c", "nombre": "Casa", "descripcion": "Casa con jardin", "tipo_vivienda": "casa", "comuna": "Santiago", "valor_uf": 5000, "similarity": 0.9}]
        with patch.object(properties_search_module, "_query_supabase_proyectos_rag", return_value=rows):
            res = search_properties(query="casa con jardin")
        self.assertEqual(res["results"][0]["cta_text"], "Ver si califico para esta casa")

    def test_compound_communes_are_detected(self):
        from app.properties_search import _extract_query_intent
        casos = {
            "casa con jardín en Puente Alto": "puente alto",
            "depto en Estación Central": "estacion central",
            "casa en San Joaquín": "san joaquin",
            "depto en san miguel 2d2b": "san miguel",
            "casa en Isla de Maipo": "isla de maipo",
            "depto en Maipú": "maipu",
            "departamento en Santiago": "santiago",
        }
        for consulta, comuna in casos.items():
            with self.subTest(consulta=consulta):
                self.assertEqual(_extract_query_intent(consulta).get("req_comuna"), comuna)

    def test_commune_without_inventory_returns_no_results(self):
        rows = [
            {"id": f"s{i}", "nombre": "Casa con jardin", "tipo_vivienda": "casa", "comuna": "Santiago", "valor_uf": 4000, "similarity": 0.92}
            for i in range(3)
        ]
        with patch.object(properties_search_module, "_query_supabase_proyectos_rag", return_value=rows):
            res = search_properties(query="casa con jardín en Puente Alto")
        self.assertEqual(res["total"], 0)
        self.assertIn("Puente Alto", res["suggestion"])

    def test_required_feature_missing_in_commune_returns_empty_list(self):
        res = search_properties(query="departamento con piscina en Ñuñoa", similarity_threshold=FAKE_ENCODER_THRESHOLD)
        self.assertEqual(res["results"], [])
        self.assertEqual(res["total"], 0)
        self.assertIn("piscina", res["suggestion"])
        self.assertIn("Nunoa", res["suggestion"])

    def test_required_feature_present_is_returned(self):
        res = search_properties(query="casa con piscina en Las Condes", similarity_threshold=FAKE_ENCODER_THRESHOLD)
        self.assertEqual([item["commune"] for item in res["results"]], ["Las Condes"])

    def test_negated_feature_is_not_required(self):
        res = search_properties(query="departamento sin piscina en Ñuñoa", similarity_threshold=FAKE_ENCODER_THRESHOLD)
        self.assertEqual([item["commune"] for item in res["results"]], ["Ñuñoa"])

    def test_hard_mismatch_is_discarded_even_without_threshold(self):
        res = search_properties(query="casa en Las Condes", similarity_threshold=0.0)
        self.assertEqual([item["commune"] for item in res["results"]], ["Las Condes"])

    def test_hard_mismatch_scores_zero(self):
        item = {"comuna": "Santiago", "tipo_vivienda": "departamento", "nombre": "Depto con piscina"}
        intent = {"req_comuna": "providencia"}
        self.assertEqual(properties_search_module._adjust_similarity_score(item, 0.95, intent, ""), 0.0)
        intent = {"req_features": ["quincho"]}
        self.assertEqual(properties_search_module._adjust_similarity_score(item, 0.95, intent, ""), 0.0)

    def test_database_rows_without_requested_feature_are_discarded(self):
        rows = [
            {"id": "sin", "nombre": "Casa", "descripcion": "Casa con jardin", "tipo_vivienda": "casa", "comuna": "Las Condes", "valor_uf": 9000, "similarity": 0.95},
            {"id": "con", "nombre": "Casa", "descripcion": "Casa con Piscina y quincho", "tipo_vivienda": "casa", "comuna": "Las Condes", "valor_uf": 9000, "similarity": 0.90},
        ]
        with patch.object(properties_search_module, "_query_supabase_proyectos_rag", return_value=rows):
            res = search_properties(query="casa con piscina en Las Condes")
        self.assertEqual([item["id"] for item in res["results"]], ["con"])

    def test_free_text_query_uses_lower_threshold(self):
        rows = [{"id": "m", "nombre": "Depto a pasos del metro", "tipo_vivienda": "departamento", "comuna": "Santiago", "valor_uf": 2500, "similarity": 0.83}]
        with patch.object(properties_search_module, "_query_supabase_proyectos_rag", return_value=rows):
            libre = search_properties(query="estudio cerca de metro")
            explicito = search_properties(query="estudio cerca de metro", similarity_threshold=0.9)
        self.assertEqual([item["id"] for item in libre["results"]], ["m"])
        self.assertEqual(explicito["results"], [])

    def test_hard_filters_keep_strict_threshold(self):
        rows = [{"id": "m", "nombre": "Depto con piscina", "tipo_vivienda": "departamento", "comuna": "Santiago", "valor_uf": 2500, "similarity": 0.81}]
        with patch.object(properties_search_module, "_query_supabase_proyectos_rag", return_value=rows):
            for consulta, kwargs in (
                ("departamento cerca de metro", {}),
                ("cerca de metro con piscina", {}),
                ("cerca de metro hasta 3000 uf", {}),
                ("cerca de metro en Santiago", {}),
                ("cerca de metro", {"commune": "Santiago"}),
            ):
                with self.subTest(consulta=consulta, kwargs=kwargs):
                    self.assertEqual(search_properties(query=consulta, **kwargs)["results"], [])

    def test_view_requirements_discard_listings_that_do_not_mention_them(self):
        rows = [
            {"id": f"c{i}", "nombre": "Casa En Calle Cerrada, Con Gran Jardín Y Piscina.", "tipo_vivienda": "casa", "comuna": "Peñalolén", "valor_uf": 14000, "similarity": 0.95}
            for i in range(2)
        ]
        consulta = "casa con jardín con piscina con vista a la cordillera desde la pieza principal"
        with patch.object(properties_search_module, "_query_supabase_proyectos_rag", return_value=rows):
            res = search_properties(query=consulta)
            con_vista = search_properties(query="casa con jardín con piscina")
        self.assertEqual(res["results"], [])
        self.assertIn("cordillera", res["suggestion"])
        self.assertEqual(len(con_vista["results"]), 2)

    def _search_rows(self, rows, query):
        with patch.object(properties_search_module, "_query_supabase_proyectos_rag", return_value=rows):
            return search_properties(query=query)

    @staticmethod
    def _row(id_, nombre="Depto", tipo="departamento", comuna="Santiago", uf=2500, sim=0.9, dorm=2, banos=1):
        return {"id": id_, "nombre": nombre, "tipo_vivienda": tipo, "comuna": comuna, "valor_uf": uf,
                "similarity": sim, "dormitorios": dorm, "banos": banos}

    def test_places_outside_the_catalog_return_no_results(self):
        rows = [self._row("a", tipo="casa", sim=0.95)]
        for consulta in ("casa en Valparaíso", "departamento en Viña del Mar", "casa en Concepción",
                         "depto en Puerto Varas", "casa en la región del Biobío", "departamento en Miami"):
            with self.subTest(consulta=consulta):
                res = self._search_rows(rows, consulta)
                self.assertEqual(res["results"], [])
                self.assertIn("Región Metropolitana", res["suggestion"])

    def test_santiago_toponyms_are_not_read_as_other_cities(self):
        from app.properties_search import _extract_query_intent
        for consulta in ("casa cerca de Pedro de Valdivia", "depto en barrio Yungay", "casa en calle Lautaro",
                         "departamento en la Concepción", "casa con vista a los Andes"):
            with self.subTest(consulta=consulta):
                self.assertNotIn("req_lugar", _extract_query_intent(consulta))

    def test_metro_phrases_require_the_listing_to_mention_it(self):
        from app.properties_search import _extract_query_intent
        for consulta in ("cerca del metro", "a pasos del metro", "a no más de 10 minutos del metro",
                         "5 mins del metro", "al lado del metro", "con metro cerca", "apartment near metro"):
            with self.subTest(consulta=consulta):
                self.assertIn("metro", _extract_query_intent(consulta)["req_features"])
        for consulta in ("departamento lejos del metro", "depto sin metro cerca", "60 metros cuadrados"):
            with self.subTest(consulta=consulta):
                self.assertNotIn("metro", _extract_query_intent(consulta)["req_features"])
        rows = [self._row("con", nombre="Depto a pasos del metro Baquedano", sim=0.8), self._row("sin", nombre="Depto luminoso", sim=0.95)]
        res = self._search_rows(rows, "a no más de 10 minutos del metro")
        self.assertEqual([item["id"] for item in res["results"]], ["con"])

    def test_numeric_requirements_are_hard(self):
        rows = [
            self._row("ok", dorm=3, uf=1900), self._row("pocas", dorm=2, uf=1900),
            self._row("cara", dorm=3, uf=2500), self._row("sinprecio", dorm=3, uf=0),
        ]
        res = self._search_rows(rows, "departamento 3 dormitorios hasta 2.000 uf")
        self.assertEqual([item["id"] for item in res["results"]], ["ok"])

    def test_filter_only_queries_return_every_match_regardless_of_similarity(self):
        rows = [self._row(f"c{i}", tipo="casa", sim=0.5 + i / 100) for i in range(5)] + [self._row("d", sim=0.99)]
        for consulta in ("casa", "CASAS", "casa en Santiago", "propiedades casa"):
            with self.subTest(consulta=consulta):
                self.assertEqual(self._search_rows(rows, consulta)["total"], 5)
        # Con texto descriptivo sobrante sí rige el umbral semántico.
        self.assertEqual(self._search_rows(rows, "casa tranquila")["total"], 0)

    def test_off_topic_text_returns_no_results(self):
        rows = [self._row(f"r{i}", sim=0.82) for i in range(6)]
        for consulta in ("pizza con piña", "auto usado", "poema de amor", "clima en Santiago"):
            with self.subTest(consulta=consulta):
                res = self._search_rows(rows, consulta)
                self.assertEqual(res["results"], [])
                self.assertIn("Describe el tipo de vivienda", res["suggestion"])

    def test_real_estate_text_passes_the_gate_by_vocabulary_or_by_similarity(self):
        rows = [self._row(f"r{i}", sim=0.83) for i in range(6)]
        self.assertEqual(self._search_rows(rows, "primera vivienda")["total"], 6)
        cerca = [self._row(f"s{i}", sim=0.87) for i in range(6)]
        self.assertEqual(self._search_rows(cerca, "lugar para empezar de cero")["total"], 6)

    def test_explicit_threshold_disables_the_domain_gate(self):
        rows = [self._row("r", sim=0.82)]
        with patch.object(properties_search_module, "_query_supabase_proyectos_rag", return_value=rows):
            res = search_properties(query="pizza con piña", similarity_threshold=0.5)
        self.assertEqual(res["total"], 1)

    def test_text_filters_are_pushed_to_the_rpc(self):
        with patch.object(properties_search_module, "_query_supabase_proyectos_rag", return_value=[]) as rpc:
            search_properties(query="casa hasta 4000 uf")
        self.assertEqual(rpc.call_args.kwargs["property_type"], "casa")
        self.assertEqual(rpc.call_args.kwargs["max_price_uf"], 4000.0)
        self.assertIsNone(rpc.call_args.kwargs["commune"])

    def test_commune_match_ignores_accents(self):
        rows = [{"id": "n", "nombre": "Depto", "tipo_vivienda": "departamento", "comuna": "Ñuñoa", "valor_uf": 3000, "similarity": 0.88}]
        with patch.object(properties_search_module, "_query_supabase_proyectos_rag", return_value=rows):
            res = search_properties(query="depto en nunoa")
        self.assertEqual([item["id"] for item in res["results"]], ["n"])

    def test_intent_boosts_keep_semantic_order_without_ties(self):
        rows = [
            {"id": "b", "nombre": "Depto", "tipo_vivienda": "departamento", "comuna": "Santiago", "dormitorios": 2, "valor_uf": 2500, "similarity": 0.89},
            {"id": "a", "nombre": "Depto", "tipo_vivienda": "departamento", "comuna": "Santiago", "dormitorios": 2, "valor_uf": 2500, "similarity": 0.91},
        ]
        with patch.object(properties_search_module, "_query_supabase_proyectos_rag", return_value=rows):
            res = search_properties(query="depto 2 dormitorios en santiago hasta 3000 uf")
        self.assertEqual([item["id"] for item in res["results"]], ["a", "b"])
        similitudes = [item["similarity"] for item in res["results"]]
        self.assertNotEqual(similitudes[0], similitudes[1])
        self.assertLessEqual(similitudes[0], 1.0)

    def test_depto_and_departamento_share_embedding(self):
        self.assertEqual(
            generate_text_embedding("depto 2 dormitorios"),
            generate_text_embedding("departamento 2 dormitorios"),
        )

    def test_model_receives_normalized_abbreviations(self):
        generate_text_embedding("Depto en Ñuñoa")
        self.assertEqual(self.encoder.calls[-1], ["query: departamento en ñuñoa"])

    def test_missing_embedding_model_returns_503(self):
        with patch.object(properties_search_module, "_request_embeddings", side_effect=EmbeddingError("sin modelo")):
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



class _FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _http_503():
    return urllib.error.HTTPError("url", 503, "Model is loading", {}, None)


class TestHuggingFaceClient(unittest.TestCase):

    def setUp(self):
        self.enterContext(patch.dict(os.environ, {"HUGGINGFACE_API_KEY": "hf_test"}))
        self.sleep = self.enterContext(patch.object(properties_search_module.time, "sleep"))

    def test_sends_e5_prefix_token_and_timeout(self):
        body = json.dumps([[0.0] * 384]).encode()
        with patch.object(properties_search_module.urllib.request, "urlopen", return_value=_FakeResponse(body)) as urlopen:
            generate_text_embedding("depto")
        request = urlopen.call_args.args[0]
        self.assertEqual(json.loads(request.data), {"inputs": ["query: departamento"]})
        self.assertEqual(request.get_header("Authorization"), "Bearer hf_test")
        self.assertGreaterEqual(urlopen.call_args.kwargs["timeout"], 30)

    def test_retries_with_backoff_while_model_is_loading(self):
        body = json.dumps([[0.0] * 384]).encode()
        responses = [_http_503(), _http_503(), _FakeResponse(body)]
        with patch.object(properties_search_module.urllib.request, "urlopen", side_effect=responses):
            self.assertEqual(len(generate_text_embedding("casa")), 384)
        delays = [c.args[0] for c in self.sleep.call_args_list]
        self.assertEqual(len(delays), 2)
        self.assertLess(delays[0], delays[1])

    def test_gives_up_after_max_retries(self):
        attempts = properties_search_module.HUGGINGFACE_MAX_RETRIES + 1
        with patch.object(properties_search_module.urllib.request, "urlopen", side_effect=[_http_503()] * attempts):
            with self.assertRaises(EmbeddingError):
                generate_text_embedding("casa")

    def test_missing_api_key_raises_embedding_error(self):
        with patch.dict(os.environ, {"HUGGINGFACE_API_KEY": ""}):
            with self.assertRaises(EmbeddingError):
                generate_text_embedding("casa")

    def test_ingest_batches_requests(self):
        with patch.object(properties_search_module, "_request_embeddings", side_effect=lambda inputs: [[0.0] * 384] * len(inputs)) as request:
            vectors = properties_search_module.generate_text_embeddings(["x"] * 70)
        self.assertEqual(len(vectors), 70)
        self.assertEqual([len(c.args[0]) for c in request.call_args_list], [32, 32, 6])


if __name__ == "__main__":
    unittest.main()

