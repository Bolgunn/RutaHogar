"""FastAPI HTTP routes for the Virtual Assistant and Support Tickets."""

import os
from typing import Annotated, Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import httpx

from .retrieval import load_kb
from .service import (
    AssistantChatRequest,
    AssistantChatResponse,
    AssistantService,
)
from .tickets import (
    CreateTicketRequest,
    TicketResponse,
    TicketService,
    UpdateTicketStatusRequest,
    UserTicketFeedbackRequest,
)

router = APIRouter(prefix="/api/assistant", tags=["assistant"])
support_router = APIRouter(prefix="/api/support", tags=["support"])

bearer = HTTPBearer(auto_error=False)


def check_optional_auth(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)]
) -> bool:
    """Verifies user session token if present.

    Returns True if authenticated, False if anonymous or unverified.
    Never raises 401: the assistant chat is available to all users.
    """
    if credentials is None or not credentials.credentials:
        return False

    token = credentials.credentials
    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    supabase_key = (
        os.environ.get("SUPABASE_SECRET_KEY")
        or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_ANON_KEY")
    )

    if not supabase_url or not supabase_key:
        return False

    try:
        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {token}",
        }
        res = httpx.get(f"{supabase_url}/auth/v1/user", headers=headers, timeout=3.0)
        return res.status_code == 200
    except Exception:
        return False


def resolve_authenticated_user(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)]
) -> Dict[str, Any]:
    """Strictly validates Bearer token for ticket submission.

    Extracts user_id from auth.users and profile details from public.profiles.
    Raises 401 if credentials are missing or invalid.
    """
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthenticated", "message": "Inicia sesión para contactar a soporte."},
        )

    token = credentials.credentials
    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    supabase_key = (
        os.environ.get("SUPABASE_SECRET_KEY")
        or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    )

    # Local / mock fallback if no database is configured
    if not supabase_url or not supabase_key:
        return {
            "user_id": "00000000-0000-0000-0000-000000000001",
            "email": "usuario.local@rutahogar.cl",
            "full_name": "Usuario Local",
            "role": "usuario",
            "inmobiliaria_id": None,
        }

    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {token}",
    }

    try:
        user_res = httpx.get(f"{supabase_url}/auth/v1/user", headers=headers, timeout=5.0)
        if user_res.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "unauthenticated", "message": "Sesión inválida o expirada."},
            )
        user_data = user_res.json()
        user_id = user_data["id"]
        user_email = user_data.get("email") or ""

        # Fetch profile
        profile_res = httpx.get(
            f"{supabase_url}/rest/v1/profiles",
            headers=headers,
            params={"id": f"eq.{user_id}", "select": "*"},
            timeout=5.0,
        )
        full_name = user_email
        role = "usuario"
        inmobiliaria_id = None

        if profile_res.status_code == 200 and profile_res.json():
            p = profile_res.json()[0]
            role = p.get("role") or "usuario"
            full_name = p.get("full_name") or user_email
            inmobiliaria_id = p.get("inmobiliaria_id")

        return {
            "user_id": user_id,
            "email": user_email,
            "full_name": full_name,
            "role": role,
            "inmobiliaria_id": inmobiliaria_id,
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[assistant.router] Error validating user: {e}", flush=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "persistence_unavailable"},
        )


@router.post("/chat", response_model=AssistantChatResponse)
def chat_assistant(
    request: AssistantChatRequest,
    is_authenticated: Annotated[bool, Depends(check_optional_auth)],
) -> AssistantChatResponse:
    """Answers user queries regarding pre-evaluation, interface usage, and financial concepts.

    Available to anonymous visitors and authenticated users.
    """
    return AssistantService.process_chat(request, is_authenticated=is_authenticated)


@router.get("/health")
def assistant_health():
    """Health check endpoint indicating KB status and size."""
    kb = load_kb()
    return {
        "status": "healthy",
        "chunks_count": len(kb),
    }


@support_router.post("/tickets", response_model=TicketResponse, status_code=status.HTTP_201_CREATED)
def create_support_ticket(
    request: CreateTicketRequest,
    user: Annotated[Dict[str, Any], Depends(resolve_authenticated_user)],
) -> TicketResponse:
    """Creates a new support ticket attached to the authenticated user and their recent chat context."""
    return TicketService.create_ticket(
        user_id=user["user_id"],
        role=user["role"],
        user_name=user["full_name"],
        user_email=user["email"],
        inmobiliaria_id=user.get("inmobiliaria_id"),
        request=request,
    )


@support_router.patch("/tickets/{ticket_id}", status_code=status.HTTP_200_OK)
def update_support_ticket(
    ticket_id: str,
    body: UpdateTicketStatusRequest,
    user: Annotated[Dict[str, Any], Depends(resolve_authenticated_user)],
):
    """Updates support ticket status and/or responds to the user. Restricted to staff/admin."""
    if user.get("role") not in ("admin", "admin_inmobiliario", "ejecutivo"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "forbidden", "message": "Solo el equipo de administración puede gestionar tickets."},
        )

    return TicketService.update_ticket_status(
        ticket_id=ticket_id,
        status=body.status,
        admin_reply=body.reply,
        admin_id=user["user_id"],
    )


@support_router.post("/tickets/{ticket_id}/feedback", status_code=status.HTTP_200_OK)
def submit_ticket_feedback(
    ticket_id: str,
    body: UserTicketFeedbackRequest,
    user: Annotated[Dict[str, Any], Depends(resolve_authenticated_user)],
):
    """Allows user to confirm resolution of their ticket or send follow-up reply."""
    return TicketService.submit_user_feedback(
        ticket_id=ticket_id,
        user_id=user["user_id"],
        feedback=body.feedback,
        user_reply=body.reply,
    )
