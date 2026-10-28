"""Unit tests for Support Tickets (HU24 - E4) using standard library unittest."""

import os
import unittest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from app.assistant.router import resolve_authenticated_user
from app.assistant.support_email import build_ticket_html
from app.assistant.tickets import (
    CreateTicketRequest,
    TicketService,
    TranscriptTurn,
)
from app.main import app


class TestSupportTickets(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        # By default in unit tests, disable direct live Supabase requests
        # so tests run fully isolated and offline
        self.env_patcher = patch.dict(
            os.environ,
            {"SUPABASE_URL": "", "SUPABASE_SECRET_KEY": "", "RESEND_API_KEY": ""},
        )
        self.env_patcher.start()

    def tearDown(self):
        self.env_patcher.stop()
        app.dependency_overrides.clear()

    def test_create_ticket_with_identity_and_transcript(self):
        req = CreateTicketRequest(
            subject="Problema con el Paso 2",
            message="No entiendo cómo calcular el dividendo estimado.",
            history=[
                TranscriptTurn(role="user", content="¿Cómo calculo el dividendo?"),
                TranscriptTurn(role="assistant", content="El dividendo se calcula automáticamente."),
            ],
            screen_id="evaluate",
            client_request_id="req-test-uuid-001",
        )

        res = TicketService.create_ticket(
            user_id="user-12345",
            role="usuario",
            user_name="Juan Perez",
            user_email="juan.perez@correo.cl",
            inmobiliaria_id=None,
            request=req,
        )

        self.assertIsNotNone(res.id)
        self.assertEqual(len(res.code), 8)
        self.assertEqual(res.status, "abierto")
        self.assertIsNotNone(res.created_at)

    def test_create_ticket_redacts_pii_in_message_and_transcript(self):
        req = CreateTicketRequest(
            subject="Duda con mi RUT 12.345.678-9",
            message="Mi RUT es 12.345.678-9 y mi correo es juan@gmail.com, llamen al +56987654321",
            history=[
                TranscriptTurn(role="user", content="Tengo deuda en Dicom con el RUT 12.345.678-9"),
                TranscriptTurn(role="assistant", content="En el Paso 3 debes indicar la morosidad."),
            ],
            screen_id="evaluate",
            client_request_id="req-test-uuid-002",
        )

        mock_email = MagicMock()
        mock_email.send_ticket_notification.return_value = (True, None)

        res = TicketService.create_ticket(
            user_id="user-12345",
            role="usuario",
            user_name="Juan Perez",
            user_email="juan.perez@correo.cl",
            inmobiliaria_id=None,
            request=req,
            email_client=mock_email,
        )

        self.assertIsNotNone(res.id)
        call_args = mock_email.send_ticket_notification.call_args[1]
        sent_ticket = call_args["ticket"]
        self.assertNotIn("12.345.678-9", sent_ticket["message"])
        self.assertNotIn("juan@gmail.com", sent_ticket["message"])
        self.assertIn("[RUT_REDACTADO]", sent_ticket["message"])
        self.assertIn("[EMAIL_REDACTADO]", sent_ticket["message"])

        # Check transcript
        self.assertNotIn("12.345.678-9", sent_ticket["transcript"][0]["content"])
        self.assertIn("[RUT_REDACTADO]", sent_ticket["transcript"][0]["content"])

    def test_create_ticket_idempotency(self):
        req1 = CreateTicketRequest(
            subject="Consulta idempotente",
            message="Mensaje inicial",
            history=[],
            screen_id="evaluate",
            client_request_id="idempotent-req-key-999",
        )
        res1 = TicketService.create_ticket(
            user_id="user-idempotent",
            role="usuario",
            user_name="Ana Lopez",
            user_email="ana@correo.cl",
            inmobiliaria_id=None,
            request=req1,
        )

        req2 = CreateTicketRequest(
            subject="Consulta idempotente repetida",
            message="Mensaje que no debería duplicarse",
            history=[],
            screen_id="evaluate",
            client_request_id="idempotent-req-key-999",
        )
        res2 = TicketService.create_ticket(
            user_id="user-idempotent",
            role="usuario",
            user_name="Ana Lopez",
            user_email="ana@correo.cl",
            inmobiliaria_id=None,
            request=req2,
        )

        self.assertEqual(res1.id, res2.id)
        self.assertEqual(res1.code, res2.code)

    def test_support_email_sent_and_notified_at_set(self):
        req = CreateTicketRequest(
            subject="Consulta de crédito",
            message="Necesito orientación",
            history=[],
            client_request_id="req-email-success",
        )

        mock_email = MagicMock()
        mock_email.send_ticket_notification.return_value = (True, None)

        res = TicketService.create_ticket(
            user_id="user-email-ok",
            role="usuario",
            user_name="Carlos",
            user_email="carlos@correo.cl",
            inmobiliaria_id=None,
            request=req,
            email_client=mock_email,
        )

        self.assertIsNotNone(res.notified_at)
        self.assertIsNone(res.notification_error)

    def test_support_email_fails_gracefully_without_failing_ticket(self):
        req = CreateTicketRequest(
            subject="Consulta con error de correo",
            message="El correo fallará pero el ticket debe guardarse",
            history=[],
            client_request_id="req-email-fail",
        )

        mock_email = MagicMock()
        mock_email.send_ticket_notification.return_value = (False, "email_provider_rejected")

        res = TicketService.create_ticket(
            user_id="user-email-err",
            role="usuario",
            user_name="Carlos",
            user_email="carlos@correo.cl",
            inmobiliaria_id=None,
            request=req,
            email_client=mock_email,
        )

        self.assertIsNotNone(res.id)
        self.assertEqual(res.status, "abierto")
        self.assertIsNone(res.notified_at)
        self.assertEqual(res.notification_error, "email_provider_rejected")

    def test_email_html_escapes_user_input(self):
        malicious_message = "<script>alert('pwned')</script>&<b>bold</b>"
        malicious_subject = '<img src=x onerror=alert(1)>"quoted"'

        html = build_ticket_html(
            ticket_id="ticket-123",
            code="TICK1234",
            user_name="<Evil Hacker>",
            user_email="evil@domain.com",
            role="usuario",
            screen_id="<test>",
            subject=malicious_subject,
            message=malicious_message,
            transcript=[{"role": "user", "content": "<script>alert(2)</script>"}],
            created_at="2026-10-27T00:00:00Z",
        )

        self.assertNotIn("<script>", html)
        self.assertNotIn("<img src=x", html)
        self.assertIn("&lt;script&gt;alert(&#x27;pwned&#x27;)&lt;/script&gt;", html)
        self.assertIn("&lt;Evil Hacker&gt;", html)

    def test_create_ticket_with_mocked_supabase_client(self):
        """Verifies ticket insertion into Supabase REST when configured."""
        mock_http = MagicMock()
        # 1st GET: check idempotency (returns empty list)
        mock_check_res = MagicMock()
        mock_check_res.status_code = 200
        mock_check_res.json.return_value = []

        # 2nd POST: insert ticket (returns created row)
        mock_post_res = MagicMock()
        mock_post_res.status_code = 201
        mock_post_res.json.return_value = [{
            "id": "11112222-3333-4444-5555-666677778888",
            "status": "abierto",
            "created_at": "2026-10-27T10:00:00Z",
        }]

        mock_http.get.return_value = mock_check_res
        mock_http.post.return_value = mock_post_res

        req = CreateTicketRequest(
            subject="Duda hipotecaria",
            message="Cómo funciona el CAE",
            history=[],
            screen_id="evaluate",
            client_request_id="req-supabase-001",
        )

        mock_email = MagicMock()
        mock_email.send_ticket_notification.return_value = (True, None)

        with patch.dict(os.environ, {
            "SUPABASE_URL": "https://fake.supabase.co",
            "SUPABASE_SECRET_KEY": "fake-secret-key",
        }):
            res = TicketService.create_ticket(
                user_id="user-supa-1",
                role="usuario",
                user_name="Pedro",
                user_email="pedro@correo.cl",
                inmobiliaria_id=None,
                request=req,
                db_client=mock_http,
                email_client=mock_email,
            )

        self.assertEqual(res.id, "11112222-3333-4444-5555-666677778888")
        self.assertEqual(res.code, "11112222")
        self.assertEqual(res.status, "abierto")
        self.assertTrue(mock_http.post.called)

    def test_api_support_tickets_unauthenticated(self):
        response = self.client.post(
            "/api/support/tickets",
            json={
                "subject": "Test",
                "message": "Hola",
                "history": [],
                "client_request_id": "test-req-no-auth",
            },
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"]["code"], "unauthenticated")

    def test_api_support_tickets_authenticated(self):
        # Override authentication dependency for this test
        app.dependency_overrides[resolve_authenticated_user] = lambda: {
            "user_id": "user-auth-test-777",
            "email": "test-user@rutahogar.cl",
            "full_name": "Test Authenticated User",
            "role": "usuario",
            "inmobiliaria_id": None,
        }

        headers = {"Authorization": "Bearer mock-token-test"}
        response = self.client.post(
            "/api/support/tickets",
            headers=headers,
            json={
                "subject": "Consulta con auth",
                "message": "Mensaje autenticado",
                "history": [],
                "client_request_id": "test-req-auth-valid",
            },
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertIn("id", data)
        self.assertIn("code", data)
        self.assertEqual(data["status"], "abierto")

    def test_update_ticket_status_and_reply_flow(self):
        # 1. Create a ticket
        req = CreateTicketRequest(
            subject="Duda con subsidio DS19",
            message="¿Aplica a departamentos de 3 dormitorios?",
            history=[],
            client_request_id="req-reply-test-1",
        )
        created = TicketService.create_ticket(
            user_id="user-subsidio",
            role="usuario",
            user_name="Marta",
            user_email="marta@correo.cl",
            inmobiliaria_id=None,
            request=req,
        )
        self.assertEqual(created.status, "abierto")

        # 2. Admin replies -> should transition automatically to en_proceso
        mock_email = MagicMock()
        mock_email.send_admin_reply_notification.return_value = (True, None)

        res = TicketService.update_ticket_status(
            ticket_id=created.id,
            status="abierto",
            admin_reply="Hola Marta, sí aplica cumpliendo los topes UF.",
            admin_id="admin-999",
            email_client=mock_email,
        )

        self.assertEqual(res["status"], "en_proceso")
        self.assertEqual(res["admin_reply"], "Hola Marta, sí aplica cumpliendo los topes UF.")
        self.assertTrue(res["reply_notified"])
        self.assertTrue(mock_email.send_admin_reply_notification.called)

        # 3. Admin marks as resuelto
        res2 = TicketService.update_ticket_status(
            ticket_id=created.id,
            status="resuelto",
            admin_id="admin-999",
        )
        self.assertEqual(res2["status"], "resuelto")

    def test_api_patch_support_ticket_forbidden_for_regular_user(self):
        app.dependency_overrides[resolve_authenticated_user] = lambda: {
            "user_id": "regular-user-id",
            "email": "user@rutahogar.cl",
            "full_name": "Regular User",
            "role": "usuario",
            "inmobiliaria_id": None,
        }

        response = self.client.patch(
            "/api/support/tickets/some-ticket-id",
            json={"status": "resuelto"},
        )
        self.assertEqual(response.status_code, 403)

    def test_api_patch_support_ticket_allowed_for_admin(self):
        # First create ticket locally
        req = CreateTicketRequest(
            subject="Consulta admin patch",
            message="Mensaje para probar patch",
            history=[],
            client_request_id="req-admin-patch-1",
        )
        created = TicketService.create_ticket(
            user_id="user-patch-test",
            role="usuario",
            user_name="Usuario",
            user_email="user@correo.cl",
            inmobiliaria_id=None,
            request=req,
        )

        app.dependency_overrides[resolve_authenticated_user] = lambda: {
            "user_id": "admin-user-id",
            "email": "admin@rutahogar.cl",
            "full_name": "Admin RH",
            "role": "admin",
            "inmobiliaria_id": None,
        }

        response = self.client.patch(
            f"/api/support/tickets/{created.id}",
            json={"status": "en_proceso", "reply": "Estamos revisando tu solicitud."},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "en_proceso")
        self.assertEqual(data["admin_reply"], "Estamos revisando tu solicitud.")


if __name__ == "__main__":
    unittest.main()
