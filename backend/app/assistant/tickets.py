"""Support ticket creation, persistence, idempotency and email dispatch (HU24 - E4)."""

import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import httpx
from pydantic import BaseModel, Field

from .redact import redact_pii
from .support_email import SupportEmailClient

# Local in-memory repository for offline/test environments
_LOCAL_TICKETS: Dict[str, Dict[str, Any]] = {}
_LOCAL_TICKETS_BY_ID: Dict[str, Dict[str, Any]] = {}


class TranscriptTurn(BaseModel):
    role: str
    content: str
    ts: Optional[str] = None


class CreateTicketRequest(BaseModel):
    subject: Optional[str] = Field(None, max_length=120)
    message: str = Field(..., max_length=2000)
    history: List[TranscriptTurn] = Field(default_factory=list)
    screen_id: Optional[str] = None
    client_request_id: str = Field(..., min_length=10)


class UpdateTicketStatusRequest(BaseModel):
    status: str = Field(..., pattern=r"^(abierto|en_proceso|en_curso|resuelto|cerrado)$")
    reply: Optional[str] = Field(None, max_length=3000)


class TicketResponse(BaseModel):
    id: str
    code: str
    status: str
    created_at: str
    notified_at: Optional[str] = None
    notification_error: Optional[str] = None
    admin_reply: Optional[str] = None
    replied_at: Optional[str] = None


def format_transcript_for_storage(
    history: List[TranscriptTurn], max_turns: int = 10
) -> List[Dict[str, str]]:
    """Sanitizes and bounds the conversation history for ticket storage."""
    stored: List[Dict[str, str]] = []
    # Take up to last max_turns
    for turn in history[-max_turns:]:
        clean_content = redact_pii(turn.content[:1000])
        stored.append({
            "role": turn.role,
            "content": clean_content,
            "ts": turn.ts or datetime.now(timezone.utc).isoformat(),
        })
    return stored


class TicketService:
    @staticmethod
    def create_ticket(
        user_id: str,
        role: str,
        user_name: str,
        user_email: str,
        inmobiliaria_id: Optional[str],
        request: CreateTicketRequest,
        db_client: Optional[httpx.Client] = None,
        email_client: Optional[SupportEmailClient] = None,
    ) -> TicketResponse:
        """Creates a new support ticket idempotently and sends an email notice."""
        supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        supabase_key = (
            os.environ.get("SUPABASE_SECRET_KEY")
            or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        )

        clean_subject = (request.subject or "").strip()
        if not clean_subject:
            clean_subject = "Consulta asistida"
        clean_subject = redact_pii(clean_subject[:120])

        clean_message = redact_pii(request.message.strip()[:2000])
        transcript_data = format_transcript_for_storage(request.history)

        now_iso = datetime.now(timezone.utc).isoformat()
        client_request_id = request.client_request_id.strip()

        # If Supabase is configured, use it
        if supabase_url and supabase_key:
            headers = {
                "apikey": supabase_key,
                "Authorization": f"Bearer {supabase_key}",
                "Content-Type": "application/json",
                "Prefer": "return=representation",
            }

            client = db_client or httpx.Client(timeout=10.0)
            try:
                # 1. Check idempotency: does a ticket with (user_id, client_request_id) exist?
                check_res = client.get(
                    f"{supabase_url}/rest/v1/support_tickets",
                    headers=headers,
                    params={
                        "user_id": f"eq.{user_id}",
                        "client_request_id": f"eq.{client_request_id}",
                        "select": "*",
                    },
                )
                if check_res.status_code == 200:
                    existing = check_res.json()
                    if existing and len(existing) > 0:
                        row = existing[0]
                        ticket_id = row["id"]
                        code = ticket_id[:8].upper()
                        return TicketResponse(
                            id=ticket_id,
                            code=code,
                            status=row["status"],
                            created_at=row["created_at"],
                            notified_at=row.get("notified_at"),
                            notification_error=row.get("notification_error"),
                        )

                # 2. Insert new ticket
                payload = {
                    "user_id": user_id,
                    "user_name": user_name,
                    "user_email": user_email,
                    "role": role,
                    "inmobiliaria_id": inmobiliaria_id or None,
                    "subject": clean_subject,
                    "message": clean_message,
                    "transcript": transcript_data,
                    "screen_id": request.screen_id or None,
                    "status": "abierto",
                    "client_request_id": client_request_id,
                }

                insert_res = client.post(
                    f"{supabase_url}/rest/v1/support_tickets",
                    headers=headers,
                    json=payload,
                )

                if insert_res.status_code >= 400:
                    # In case user_name/user_email columns are not yet in remote table schema cache
                    if "user_name" in insert_res.text or "user_email" in insert_res.text:
                        fallback_payload = {k: v for k, v in payload.items() if k not in ("user_name", "user_email")}
                        insert_res = client.post(
                            f"{supabase_url}/rest/v1/support_tickets",
                            headers=headers,
                            json=fallback_payload,
                        )

                    # In case of race condition / unique constraint collision
                    if "duplicate key" in insert_res.text or "23505" in insert_res.text:
                        check_again = client.get(
                            f"{supabase_url}/rest/v1/support_tickets",
                            headers=headers,
                            params={
                                "user_id": f"eq.{user_id}",
                                "client_request_id": f"eq.{client_request_id}",
                                "select": "*",
                            },
                        )
                        if check_again.status_code == 200 and check_again.json():
                            row = check_again.json()[0]
                            return TicketResponse(
                                id=row["id"],
                                code=row["id"][:8].upper(),
                                status=row["status"],
                                created_at=row["created_at"],
                                notified_at=row.get("notified_at"),
                                notification_error=row.get("notification_error"),
                            )

                    raise RuntimeError(f"Database error inserting ticket: {insert_res.text}")

                created_rows = insert_res.json()
                ticket_row = created_rows[0]
                ticket_id = ticket_row["id"]
                code = ticket_id[:8].upper()

                # 3. Best-effort email notification
                mailer = email_client or SupportEmailClient()
                sent, email_err = mailer.send_ticket_notification(
                    ticket={
                        "id": ticket_id,
                        "code": code,
                        "subject": clean_subject,
                        "message": clean_message,
                        "role": role,
                        "screen_id": request.screen_id,
                        "transcript": transcript_data,
                        "created_at": ticket_row.get("created_at", now_iso),
                    },
                    user_name=user_name,
                    user_email=user_email,
                )

                notified_at_val = datetime.now(timezone.utc).isoformat() if sent else None
                patch_payload = {}
                if sent:
                    patch_payload["notified_at"] = notified_at_val
                elif email_err:
                    patch_payload["notification_error"] = email_err

                if patch_payload:
                    try:
                        client.patch(
                            f"{supabase_url}/rest/v1/support_tickets",
                            headers=headers,
                            params={"id": f"eq.{ticket_id}"},
                            json=patch_payload,
                        )
                    except Exception:
                        pass

                return TicketResponse(
                    id=ticket_id,
                    code=code,
                    status=ticket_row["status"],
                    created_at=ticket_row["created_at"],
                    notified_at=notified_at_val,
                    notification_error=email_err,
                )
            finally:
                if db_client is None:
                    client.close()

        # Local in-memory fallback for local/test environments
        idempotency_key = f"{user_id}:{client_request_id}"
        if idempotency_key in _LOCAL_TICKETS:
            cached = _LOCAL_TICKETS[idempotency_key]
            return TicketResponse(**cached)

        ticket_id = str(uuid.uuid4())
        code = ticket_id[:8].upper()

        mailer = email_client or SupportEmailClient()
        sent, email_err = mailer.send_ticket_notification(
            ticket={
                "id": ticket_id,
                "code": code,
                "subject": clean_subject,
                "message": clean_message,
                "role": role,
                "screen_id": request.screen_id,
                "transcript": transcript_data,
                "created_at": now_iso,
            },
            user_name=user_name,
            user_email=user_email,
        )

        res_data = {
            "id": ticket_id,
            "code": code,
            "user_id": user_id,
            "user_name": user_name,
            "user_email": user_email,
            "subject": clean_subject,
            "message": clean_message,
            "status": "abierto",
            "created_at": now_iso,
            "notified_at": now_iso if sent else None,
            "notification_error": email_err,
            "admin_reply": None,
            "replied_at": None,
        }
        _LOCAL_TICKETS[idempotency_key] = res_data
        _LOCAL_TICKETS_BY_ID[ticket_id] = res_data
        return TicketResponse(**res_data)

    @staticmethod
    def update_ticket_status(
        ticket_id: str,
        status: str,
        admin_reply: Optional[str] = None,
        admin_id: Optional[str] = None,
        db_client: Optional[httpx.Client] = None,
        email_client: Optional[SupportEmailClient] = None,
    ) -> Dict[str, Any]:
        """Updates ticket status and optionally records an admin reply, notifying the requester."""
        supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        supabase_key = (
            os.environ.get("SUPABASE_SECRET_KEY")
            or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        )

        now_iso = datetime.now(timezone.utc).isoformat()
        clean_reply = redact_pii(admin_reply.strip()[:3000]) if admin_reply and admin_reply.strip() else None

        normalized_status = "en_proceso" if status == "en_curso" else status
        # If admin is providing a reply and status was still abierto, transition automatically to en_proceso
        if clean_reply and normalized_status == "abierto":
            normalized_status = "en_proceso"

        ticket_data = None
        user_email = None
        user_name = None

        if supabase_url and supabase_key:
            headers = {
                "apikey": supabase_key,
                "Authorization": f"Bearer {supabase_key}",
                "Content-Type": "application/json",
                "Prefer": "return=representation",
            }

            client = db_client or httpx.Client(timeout=10.0)
            try:
                # 1. Fetch current ticket row
                get_res = client.get(
                    f"{supabase_url}/rest/v1/support_tickets",
                    headers=headers,
                    params={"id": f"eq.{ticket_id}", "select": "*"},
                )
                if get_res.status_code == 200 and get_res.json():
                    ticket_data = get_res.json()[0]
                    user_email = ticket_data.get("user_email")
                    user_name = ticket_data.get("user_name")
                    if not user_email and ticket_data.get("user_id"):
                        try:
                            prof_res = client.get(
                                f"{supabase_url}/rest/v1/profiles",
                                headers=headers,
                                params={"id": f"eq.{ticket_data['user_id']}", "select": "*"},
                            )
                            if prof_res.status_code == 200 and prof_res.json():
                                p = prof_res.json()[0]
                                user_name = user_name or p.get("full_name")
                        except Exception:
                            pass

                # 2. Patch status and reply
                patch_payload: Dict[str, Any] = {
                    "status": normalized_status,
                    "status_updated_at": now_iso,
                }
                if admin_id:
                    patch_payload["status_updated_by"] = admin_id
                if clean_reply:
                    patch_payload["admin_reply"] = clean_reply
                    patch_payload["replied_at"] = now_iso
                    if admin_id:
                        patch_payload["replied_by"] = admin_id

                update_res = client.patch(
                    f"{supabase_url}/rest/v1/support_tickets",
                    headers=headers,
                    params={"id": f"eq.{ticket_id}"},
                    json=patch_payload,
                )

                if update_res.status_code >= 400 and "admin_reply" in update_res.text:
                    # Fallback if admin_reply column is not yet present on remote DB
                    client.patch(
                        f"{supabase_url}/rest/v1/support_tickets",
                        headers=headers,
                        params={"id": f"eq.{ticket_id}"},
                        json={"status": normalized_status, "status_updated_at": now_iso},
                    )
            finally:
                if db_client is None:
                    client.close()
        else:
            updated_row = _LOCAL_TICKETS_BY_ID.get(ticket_id)
            if updated_row:
                updated_row["status"] = normalized_status
                updated_row["status_updated_at"] = now_iso
                if clean_reply:
                    updated_row["admin_reply"] = clean_reply
                    updated_row["replied_at"] = now_iso
                user_email = updated_row.get("user_email")
                user_name = updated_row.get("user_name")
                ticket_data = updated_row

        # 3. If a reply was provided, notify the requester via email (best effort)
        email_sent = False
        reply_error = None
        if clean_reply:
            mailer = email_client or SupportEmailClient()
            email_sent, reply_error = mailer.send_admin_reply_notification(
                ticket=ticket_data or {"id": ticket_id, "subject": "Consulta de soporte"},
                admin_reply=clean_reply,
                user_name=user_name,
                user_email=user_email,
            )

        return {
            "id": ticket_id,
            "status": normalized_status,
            "admin_reply": clean_reply,
            "replied_at": now_iso if clean_reply else None,
            "reply_notified": email_sent,
            "reply_notification_error": reply_error,
        }
