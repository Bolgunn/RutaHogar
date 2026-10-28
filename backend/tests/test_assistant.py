"""Unit tests for RutaHogar Virtual Assistant (HU24 - E1) using standard library unittest."""

import json
from pathlib import Path
import unittest
from fastapi.testclient import TestClient

from app.assistant.constants import (
    GUARD_CREDIT_APPROVAL_RESPONSE,
    KB_PATH,
)
from app.assistant.guard import check_out_of_scope_guard
from app.assistant.redact import redact_pii
from app.assistant.retrieval import load_kb, retrieve_relevant_chunks
from app.assistant.service import (
    AssistantChatRequest,
    AssistantService,
)
from app.main import app


class TestAssistant(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    # -------------------------------------------------------------------------
    # 1. PII Redaction Tests
    # -------------------------------------------------------------------------

    def test_redact_pii_removes_rut(self):
        text = "Mi RUT es 12.345.678-9 y mi pareja es 9876543-k."
        redacted = redact_pii(text)
        self.assertNotIn("12.345.678-9", redacted)
        self.assertNotIn("9876543-k", redacted)
        self.assertIn("[RUT_REDACTADO]", redacted)

    def test_redact_pii_removes_emails(self):
        text = "Escríbeme a claudio.developer@gmail.com o contacto@rutahogar.cl"
        redacted = redact_pii(text)
        self.assertNotIn("claudio.developer@gmail.com", redacted)
        self.assertNotIn("contacto@rutahogar.cl", redacted)
        self.assertIn("[EMAIL_REDACTADO]", redacted)

    def test_redact_pii_removes_phone_and_long_numbers(self):
        text = "Mi teléfono es +56 9 87654321 y mi tarjeta termina en 4567890123456789"
        redacted = redact_pii(text)
        self.assertNotIn("87654321", redacted)
        self.assertNotIn("4567890123456789", redacted)
        self.assertIn("[NUMERO_REDACTADO]", redacted)

    # -------------------------------------------------------------------------
    # 2. Guardrails & S1/S7 Policy Tests
    # -------------------------------------------------------------------------

    def test_guard_refuses_score_manipulation_or_loan_approval(self):
        refusal1 = check_out_of_scope_guard("Apruébame el crédito hipotecario por favor")
        self.assertEqual(refusal1, GUARD_CREDIT_APPROVAL_RESPONSE)

        refusal2 = check_out_of_scope_guard("¿Cómo puedo subir mi score o cambiar mi puntaje?")
        self.assertEqual(refusal2, GUARD_CREDIT_APPROVAL_RESPONSE)

        refusal3 = check_out_of_scope_guard("Dime qué banco me va a aprobar sí o sí")
        self.assertEqual(refusal3, GUARD_CREDIT_APPROVAL_RESPONSE)

    def test_guard_allows_legitimate_pre_evaluation_questions(self):
        safe_queries = [
            "¿Cuáles son los pasos de la pre-evaluación?",
            "¿Qué deudas debo ingresar en el formulario?",
            "¿Cómo funciona la complementación de renta?",
            "¿Dónde pongo mi sueldo líquido?",
        ]
        for q in safe_queries:
            self.assertIsNone(check_out_of_scope_guard(q))

    # -------------------------------------------------------------------------
    # 3. Acceptance Criterion E1: Pre-evaluation Knowledge Retrieval
    # -------------------------------------------------------------------------

    def test_retrieval_preevaluation_general_steps(self):
        results = retrieve_relevant_chunks("¿Cuáles son los pasos de la pre-evaluación?")
        self.assertGreater(len(results), 0)
        top_score, top_chunk = results[0]
        self.assertEqual(top_chunk["id"], "preeval-general-pasos")
        self.assertIn("4 pasos", top_chunk["content"])
        self.assertIn("Contexto", top_chunk["content"])
        self.assertIn("situación financiera", top_chunk["content"])

    def test_retrieval_preevaluation_liquid_income_field(self):
        results = retrieve_relevant_chunks("¿Dónde ingreso mi sueldo líquido?")
        self.assertGreater(len(results), 0)
        top_score, top_chunk = results[0]
        self.assertEqual(top_chunk["id"], "preeval-ingreso-mensual")
        self.assertEqual(top_chunk["field_id"], "ingreso_mensual")
        self.assertEqual(top_chunk["step"], 2)
        self.assertIn("Paso 2", top_chunk["content"])
        self.assertEqual(top_chunk["action"]["type"], "focus_field")
        self.assertEqual(top_chunk["action"]["field_id"], "ingreso_mensual")

    def test_retrieval_preevaluation_debt_meaning_and_exclusions(self):
        results = retrieve_relevant_chunks("¿Qué deudas debo poner? ¿los gastos comunes cuentan?")
        self.assertGreater(len(results), 0)
        top_score, top_chunk = results[0]
        self.assertEqual(top_chunk["id"], "preeval-deuda-mensual")
        self.assertEqual(top_chunk["field_id"], "deuda_mensual")
        self.assertTrue(
            "No debes incluir" in top_chunk["content"] or "NO debes incluir" in top_chunk["content"]
        )
        self.assertIn("gastos comunes", top_chunk["content"].lower())

    def test_retrieval_preevaluation_down_payment_pie(self):
        results = retrieve_relevant_chunks("¿Qué es el ahorro disponible para el pie?")
        self.assertGreater(len(results), 0)
        top_score, top_chunk = results[0]
        self.assertEqual(top_chunk["id"], "preeval-ahorro-disponible")
        self.assertEqual(top_chunk["step"], 2)
        self.assertIn("pie", top_chunk["content"].lower())

    def test_retrieval_preevaluation_delinquency_dicom(self):
        results = retrieve_relevant_chunks("¿Dónde declaro si estoy en Dicom o tengo morosidad?")
        self.assertGreater(len(results), 0)
        top_score, top_chunk = results[0]
        self.assertEqual(top_chunk["id"], "preeval-morosidad")
        self.assertEqual(top_chunk["step"], 3)

    def test_retrieval_preevaluation_co_debtor_complement(self):
        results = retrieve_relevant_chunks("¿Cómo funciona complementar renta con mi pareja?")
        self.assertGreater(len(results), 0)
        top_score, top_chunk = results[0]
        self.assertEqual(top_chunk["id"], "preeval-complemento-renta")
        self.assertEqual(top_chunk["step"], 3)

    def test_retrieval_context_boost_by_screen_and_field(self):
        results = retrieve_relevant_chunks(
            query="cuánto pongo",
            screen_id="evaluate",
            field_id="deuda_mensual",
        )
        self.assertGreater(len(results), 0)
        top_score, top_chunk = results[0]
        self.assertEqual(top_chunk["field_id"], "deuda_mensual")

    # -------------------------------------------------------------------------
    # 3b. Acceptance Criterion E2: Financial Concepts & Staff How-To Retrieval
    # -------------------------------------------------------------------------

    def test_financial_concept_retrieves_academy_article_link(self):
        req = AssistantChatRequest(
            message="¿Qué es el CAE y cómo se calcula?",
            screen_id="academia",
        )
        res = AssistantService.process_chat(req, is_authenticated=False)
        self.assertGreater(len(res.links), 0)
        academy_links = [l for l in res.links if l.type == "academy" and l.articleId]
        self.assertGreater(len(academy_links), 0)
        self.assertEqual(academy_links[0].articleId, "costos-2")

    def test_financial_concept_subsidies_retrieves_academy_article(self):
        req = AssistantChatRequest(
            message="¿Cuáles son los subsidios habitacionales DS19 y DS1?",
            screen_id="subsidios",
        )
        res = AssistantService.process_chat(req, is_authenticated=False)
        self.assertIn("subsidio", res.answer.lower())
        academy_links = [l for l in res.links if l.type == "academy" and l.articleId]
        self.assertGreater(len(academy_links), 0)
        self.assertIn(academy_links[0].articleId, {"subsidios-estatales", "rsh-3"})

    def test_staff_how_to_retrieves_admin_executives_management(self):
        req = AssistantChatRequest(
            message="¿Cómo gestiono a mis ejecutivos inmobiliarios?",
            screen_id="admin",
        )
        res = AssistantService.process_chat(req, is_authenticated=True)
        self.assertIn("ejecutivos", res.answer.lower())
        self.assertIsNotNone(res.action)
        self.assertEqual(res.action.target, "admin")
        self.assertEqual(res.action.type, "navigate")

    def test_staff_how_to_retrieves_executive_leads_pipeline(self):
        req = AssistantChatRequest(
            message="¿Dónde veo y atiendo mis leads asignados en el pipeline?",
            screen_id="leads",
        )
        res = AssistantService.process_chat(req, is_authenticated=True)
        self.assertIn("leads", res.answer.lower())
        self.assertIsNotNone(res.action)
        self.assertEqual(res.action.target, "leads")

    def test_staff_how_to_retrieves_projects_management(self):
        req = AssistantChatRequest(
            message="¿Cómo puedo subir o gestionar los proyectos de la inmobiliaria?",
            screen_id="admin",
        )
        res = AssistantService.process_chat(req, is_authenticated=True)
        self.assertIn("proyectos", res.answer.lower())
        self.assertIsNotNone(res.action)
        self.assertEqual(res.action.target, "admin-projects")

    def test_user_how_to_retrieves_simulation_and_codebtor_views(self):
        req_sim = AssistantChatRequest(
            message="¿Dónde uso el simulador de crédito hipotecario?",
            screen_id="home",
        )
        res_sim = AssistantService.process_chat(req_sim, is_authenticated=False)
        self.assertIsNotNone(res_sim.action)
        self.assertEqual(res_sim.action.target, "simulation")

        req_codebtor = AssistantChatRequest(
            message="¿Cómo puedo invitar a un codeudor para complementar renta?",
            screen_id="home",
        )
        res_codebtor = AssistantService.process_chat(req_codebtor, is_authenticated=False)
        self.assertIsNotNone(res_codebtor.action)
        self.assertEqual(res_codebtor.action.target, "co-debtor-management")

    def test_answer_links_come_only_from_kb(self):
        req = AssistantChatRequest(
            message="¿Qué es la tasa de interés fija y variable?",
            screen_id="academia",
        )
        res = AssistantService.process_chat(req, is_authenticated=True)
        kb = load_kb()
        kb_article_ids = {c.get("link", {}).get("articleId") for c in kb if c.get("link")}
        for link in res.links:
            if link.type == "academy":
                self.assertIn(link.articleId, kb_article_ids)

    def test_every_kb_link_route_exists(self):
        valid_routes = {
            "home",
            "evaluate",
            "onboarding",
            "simulation",
            "projects",
            "portal",
            "subsidios",
            "academia",
            "profile",
            "co-debtor-management",
            "co-debtor-invitation",
            "admin",
            "admin-projects",
            "admin-profile",
            "admin-reports",
            "leads",
            "metricas",
            "sales-profile",
            "auth",
            "set-password",
            "landing",
        }
        kb = load_kb()
        for chunk in kb:
            action = chunk.get("action")
            if action and action.get("target"):
                self.assertIn(
                    action["target"],
                    valid_routes,
                    f"Chunk {chunk.get('id')} has invalid action.target {action.get('target')}",
                )
            link = chunk.get("link")
            if link and link.get("target"):
                self.assertIn(
                    link["target"],
                    valid_routes,
                    f"Chunk {chunk.get('id')} has invalid link.target {link.get('target')}",
                )

    # -------------------------------------------------------------------------
    # 4. Service Tiering and Anonymous Flow Tests
    # -------------------------------------------------------------------------

    def test_service_tier0_for_anonymous_users(self):
        req = AssistantChatRequest(
            message="¿Dónde ingreso mi sueldo líquido?",
            screen_id="anon-evaluate",
        )
        res = AssistantService.process_chat(req, is_authenticated=False)
        self.assertEqual(res.tier, "tier0_kb")
        self.assertIn("Ingreso mensual", res.answer)
        self.assertIsNotNone(res.action)
        self.assertEqual(res.action.field_id, "ingreso_mensual")
        self.assertEqual(res.action.step, 2)
        self.assertFalse(res.suggest_escalation)

    def test_service_tier2_fallback_when_out_of_scope(self):
        req = AssistantChatRequest(
            message="¿Cómo preparar una cazuela de vacuno?",
            screen_id="evaluate",
        )
        res = AssistantService.process_chat(req, is_authenticated=False)
        self.assertEqual(res.tier, "tier2_fallback")
        self.assertTrue(res.suggest_escalation)
        self.assertIn("No encontré información suficiente", res.answer)

    def test_service_guard_refusal(self):
        req = AssistantChatRequest(
            message="Aprueba mi crédito ahora mismo",
            screen_id="evaluate",
        )
        res = AssistantService.process_chat(req, is_authenticated=True)
        self.assertEqual(res.tier, "guard_refusal")
        self.assertIn("no tengo la facultad de aprobar créditos", res.answer)

    # -------------------------------------------------------------------------
    # 5. Knowledge Base Integrity & Size Constraint Tests
    # -------------------------------------------------------------------------

    def test_knowledge_base_size_and_schema(self):
        kb = load_kb()
        self.assertGreaterEqual(len(kb), 50)

        kb_file = Path(KB_PATH)
        self.assertTrue(kb_file.exists())
        size_mb = kb_file.stat().st_size / (1024 * 1024)
        self.assertLess(size_mb, 1.5)

        for chunk in kb:
            self.assertTrue(chunk.get("id"), "Chunk missing id")
            self.assertTrue(chunk.get("title"), f"Chunk {chunk.get('id')} missing title")
            self.assertTrue(chunk.get("content"), f"Chunk {chunk.get('id')} missing content")

    # -------------------------------------------------------------------------
    # 6. HTTP API Integration Tests
    # -------------------------------------------------------------------------

    def test_api_chat_endpoint_anonymous(self):
        response = self.client.post(
            "/api/assistant/chat",
            json={
                "message": "¿Cuáles son los pasos de la pre-evaluación?",
                "screen_id": "anon-evaluate",
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["tier"], "tier0_kb")
        self.assertGreater(len(data["sources"]), 0)
        self.assertIn("4 pasos", data["answer"])

    def test_api_health_endpoint(self):
        response = self.client.get("/api/assistant/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "healthy")
        self.assertGreaterEqual(data["chunks_count"], 50)


if __name__ == "__main__":
    unittest.main()
