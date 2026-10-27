"""FastAPI HTTP routes for the Virtual Assistant."""

import os
from typing import Annotated, Optional

from fastapi import APIRouter, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .retrieval import load_kb
from .service import (
    AssistantChatRequest,
    AssistantChatResponse,
    AssistantService,
)

router = APIRouter(prefix="/api/assistant", tags=["assistant"])
bearer = HTTPBearer(auto_error=False)


def check_optional_auth(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)]
) -> bool:
    """Verifies user session token if present.

    Returns True if authenticated, False if anonymous or unverified.
    Never raises 401: the assistant is available to all users.
    """
    if credentials is None or not credentials.credentials:
        return False

    token = credentials.credentials
    # Check with Supabase auth if configured
    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    supabase_key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")

    if not supabase_url or not supabase_key:
        # If persistence is unconfigured, treat as anon to avoid crashing
        return False

    try:
        import httpx
        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {token}",
        }
        res = httpx.get(f"{supabase_url}/auth/v1/user", headers=headers, timeout=3.0)
        return res.status_code == 200
    except Exception:
        return False


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
