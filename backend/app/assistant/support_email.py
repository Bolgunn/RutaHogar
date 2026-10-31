"""Support email notification client using Resend (ADR-24.3).

Sends an email notification to the RutaHogar team whenever a user creates
a support ticket. Designed as best-effort: failures do not block ticket creation.
"""

import os
from datetime import datetime, timezone
from html import escape
from typing import Any, Dict, List, Optional, Tuple
import httpx


def _safe(value: Any) -> str:
    """Escapes user-supplied content to prevent HTML injection in emails."""
    return escape(str(value or ""), quote=True)


def build_ticket_html(
    ticket_id: str,
    code: str,
    user_name: str,
    user_email: str,
    role: str,
    screen_id: Optional[str],
    subject: str,
    message: str,
    transcript: List[Dict[str, Any]],
    created_at: str,
) -> str:
    """Renders the HTML body for the staff notification email."""
    # Build transcript rows
    transcript_rows = []
    if transcript and isinstance(transcript, list):
        for turn in transcript:
            role_label = "Usuario" if turn.get("role") == "user" else "Asistente"
            role_bg = "#ecfdf5" if turn.get("role") == "user" else "#f1f5f9"
            role_color = "#065f46" if turn.get("role") == "user" else "#1e293b"
            text_content = _safe(turn.get("content") or turn.get("text") or "")
            transcript_rows.append(
                f'<div style="margin-bottom: 8px; padding: 10px; border-radius: 6px; background-color: {role_bg}; color: {role_color};">'
                f'  <strong>{role_label}:</strong> {text_content}'
                f'</div>'
            )

    transcript_html = (
        "".join(transcript_rows)
        if transcript_rows
        else "<em>No se registró conversación previa.</em>"
    )

    return f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Nuevo Ticket de Soporte #{_safe(code)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #1e293b; max-width: 650px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1e293b 0%, #246354 100%); color: #ffffff; padding: 20px; border-radius: 8px 8px 0 0;">
    <h2 style="margin: 0; font-size: 20px;">Nuevo Ticket de Soporte #{_safe(code)}</h2>
    <p style="margin: 6px 0 0 0; opacity: 0.9; font-size: 14px;">RutaHogar — Asistencia a Usuarios</p>
  </div>

  <div style="border: 1px solid #e2e8f0; border-top: none; padding: 24px; border-radius: 0 0 8px 8px; background: #ffffff;">
    <div style="margin-bottom: 20px; padding: 12px; background: #f8fafc; border-radius: 6px; font-size: 14px;">
      <p style="margin: 3px 0;"><strong>Código:</strong> #{_safe(code)}</p>
      <p style="margin: 3px 0;"><strong>Usuario:</strong> {_safe(user_name)} ({_safe(user_email)})</p>
      <p style="margin: 3px 0;"><strong>Rol:</strong> {_safe(role)}</p>
      <p style="margin: 3px 0;"><strong>Ubicación en app:</strong> {_safe(screen_id or 'No especificada')}</p>
      <p style="margin: 3px 0;"><strong>Fecha:</strong> {_safe(created_at)}</p>
    </div>

    <h3 style="font-size: 16px; margin: 0 0 8px 0; color: #0f172a;">Asunto: {_safe(subject)}</h3>
    <div style="padding: 14px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 15px; margin-bottom: 24px;">
      {_safe(message)}
    </div>

    <h4 style="font-size: 14px; margin: 0 0 10px 0; color: #475569; text-transform: uppercase; letter-spacing: 0.05em;">
      Transcripción reciente del Asistente Virtual
    </h4>
    <div style="border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; max-height: 350px; overflow-y: auto;">
      {transcript_html}
    </div>

    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center;">
      Este aviso fue generado automáticamente por la plataforma RutaHogar.
    </div>
  </div>
</body>
</html>
"""


def build_reply_html(
    code: str,
    user_name: str,
    subject: str,
    original_message: str,
    admin_reply: str,
    replied_at: str,
) -> str:
    """Renders the HTML body sent to the user when staff responds to their ticket."""
    return f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Respuesta a tu Ticket #{_safe(code)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #1e293b; max-width: 650px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1e293b 0%, #246354 100%); color: #ffffff; padding: 20px; border-radius: 8px 8px 0 0;">
    <h2 style="margin: 0; font-size: 20px;">Respuesta de Soporte — Ticket #{_safe(code)}</h2>
    <p style="margin: 6px 0 0 0; opacity: 0.9; font-size: 14px;">RutaHogar — Asistencia a Usuarios</p>
  </div>

  <div style="border: 1px solid #e2e8f0; border-top: none; padding: 24px; border-radius: 0 0 8px 8px; background: #ffffff;">
    <p style="font-size: 15px; margin-top: 0;">Hola <strong>{_safe(user_name)}</strong>,</p>
    <p style="font-size: 14px; color: #475569;">
      El equipo de administración de RutaHogar ha atendido tu consulta sobre <strong>{_safe(subject)}</strong>:
    </p>

    <div style="margin: 20px 0; padding: 16px; background: #ecfdf5; border-left: 4px solid #10b981; border-radius: 4px;">
      <h4 style="margin: 0 0 8px 0; color: #065f46; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em;">
        Respuesta del Administrador:
      </h4>
      <div style="font-size: 15px; color: #064e3b; white-space: pre-wrap; line-height: 1.6;">{_safe(admin_reply)}</div>
      <div style="margin-top: 10px; font-size: 12px; color: #047857;">Fecha de atención: {_safe(replied_at)}</div>
    </div>

    <div style="margin-top: 20px; padding: 12px; background: #f8fafc; border-radius: 6px; font-size: 13px; color: #64748b;">
      <strong>Tu consulta original:</strong><br />
      {_safe(original_message)}
    </div>

    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center;">
      Si requieres mayor orientación, puedes continuar consultando a través del Asistente Virtual en RutaHogar.
    </div>
  </div>
</body>
</html>
"""


class SupportEmailClient:
    def __init__(self, http_client: Optional[httpx.Client] = None):
        self.api_key = os.environ.get("RESEND_API_KEY", "").strip()
        # Fall back to onboarding@resend.dev (Resend default sandbox) to prevent 403 unverified domain failures
        self.from_email = os.environ.get(
            "SUPPORT_FROM_EMAIL",
            os.environ.get(
                "FEEDBACK_FROM_EMAIL",
                os.environ.get("RESEND_FROM_EMAIL", "RutaHogar <onboarding@resend.dev>"),
            ),
        ).strip()
        self.notification_recipient = os.environ.get(
            "SUPPORT_NOTIFICATION_EMAIL",
            os.environ.get("FEEDBACK_TO_EMAIL", "onboarding@resend.dev"),
        ).strip()
        self.http_client = http_client

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key and self.from_email and self.notification_recipient)

    def send_ticket_notification(
        self,
        ticket: Dict[str, Any],
        user_name: str,
        user_email: str,
    ) -> Tuple[bool, Optional[str]]:
        """Sends email notification to staff.

        Returns (True, None) on success or (False, error_code) on failure.
        """
        if not self.is_configured:
            return False, "email_not_configured"

        ticket_id = str(ticket.get("id", ""))
        code = str(ticket.get("code") or ticket_id[:8].upper())
        subject = str(ticket.get("subject", "Consulta asistida"))
        message = str(ticket.get("message", ""))
        role = str(ticket.get("role", "usuario"))
        screen_id = ticket.get("screen_id")
        transcript = ticket.get("transcript") or []
        created_at = str(ticket.get("created_at", ""))

        email_subject = f"[Ticket #{code}] {subject}"
        html_body = build_ticket_html(
            ticket_id=ticket_id,
            code=code,
            user_name=user_name,
            user_email=user_email,
            role=role,
            screen_id=screen_id,
            subject=subject,
            message=message,
            transcript=transcript,
            created_at=created_at,
        )

        payload = {
            "from": self.from_email,
            "to": [self.notification_recipient],
            "subject": email_subject,
            "html": html_body,
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        try:
            client = self.http_client or httpx.Client(timeout=10.0)
            try:
                response = client.post("https://api.resend.com/emails", headers=headers, json=payload)
            finally:
                if self.http_client is None:
                    client.close()

            if response.status_code >= 400:
                err_detail = "email_provider_rejected"
                try:
                    res_json = response.json()
                    msg = res_json.get("message") or res_json.get("name") or response.text
                    err_detail = f"resend_{response.status_code}: {msg}"
                except Exception:
                    err_detail = f"resend_{response.status_code}: {response.text[:120]}"
                print(f"[support_email] Resend returned status {response.status_code}: {err_detail}", flush=True)
                return False, err_detail

            return True, None
        except httpx.HTTPError as e:
            print(f"[support_email] HTTP error calling Resend: {e}", flush=True)
            return False, "email_provider_unavailable"
        except Exception as e:
            print(f"[support_email] Unexpected error: {e}", flush=True)
            return False, "email_provider_failed"

    def send_admin_reply_notification(
        self,
        ticket: Dict[str, Any],
        admin_reply: str,
        user_name: Optional[str] = None,
        user_email: Optional[str] = None,
    ) -> Tuple[bool, Optional[str]]:
        """Sends an email notification to the user with the staff's response."""
        if not self.is_configured:
            return False, "email_not_configured"

        recipient = (user_email or ticket.get("user_email") or "").strip()
        if not recipient:
            return False, "recipient_email_missing"

        ticket_id = str(ticket.get("id", ""))
        code = str(ticket.get("code") or ticket_id[:8].upper())
        subject = str(ticket.get("subject", "Consulta asistida"))
        original_message = str(ticket.get("message", ""))
        name = user_name or ticket.get("user_name") or recipient
        replied_at = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")

        email_subject = f"[Ticket #{code}] Respuesta de Soporte RutaHogar"
        html_body = build_reply_html(
            code=code,
            user_name=name,
            subject=subject,
            original_message=original_message,
            admin_reply=admin_reply,
            replied_at=replied_at,
        )

        payload = {
            "from": self.from_email,
            "to": [recipient],
            "subject": email_subject,
            "html": html_body,
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        try:
            client = self.http_client or httpx.Client(timeout=10.0)
            try:
                response = client.post("https://api.resend.com/emails", headers=headers, json=payload)
            finally:
                if self.http_client is None:
                    client.close()

            if response.status_code >= 400:
                err_detail = "email_provider_rejected"
                try:
                    res_json = response.json()
                    msg = res_json.get("message") or res_json.get("name") or response.text
                    err_detail = f"resend_{response.status_code}: {msg}"
                except Exception:
                    err_detail = f"resend_{response.status_code}: {response.text[:120]}"
                print(f"[support_email] Resend reply error: {err_detail}", flush=True)
                return False, err_detail

            return True, None
        except httpx.HTTPError as e:
            print(f"[support_email] HTTP error sending reply email: {e}", flush=True)
            return False, "email_provider_unavailable"
        except Exception as e:
            print(f"[support_email] Unexpected reply error: {e}", flush=True)
            return False, "email_provider_failed"
