"""Assistant service orchestrating guards, retrieval, tiering and response assembly."""

from typing import List, Optional
from pydantic import BaseModel, Field

from .constants import (
    DEFAULT_NOT_FOUND_RESPONSE,
    MAX_HISTORY_MESSAGES,
    MAX_MESSAGE_LENGTH,
)
from .guard import check_out_of_scope_guard
from .llm import ask_assistant_groq
from .redact import redact_pii
from .retrieval import get_allowed_audiences, retrieve_relevant_chunks


class ChatMessage(BaseModel):
    role: str
    content: str


class AssistantChatRequest(BaseModel):
    message: str = Field(..., max_length=MAX_MESSAGE_LENGTH)
    history: List[ChatMessage] = Field(default_factory=list)
    screen_id: Optional[str] = None
    field_id: Optional[str] = None


class AssistantAction(BaseModel):
    type: str  # "focus_field" | "navigate"
    field_id: Optional[str] = None
    step: Optional[int] = None
    target: Optional[str] = None
    label: str


class AssistantLink(BaseModel):
    type: str  # "academy" | "external" | "navigate"
    articleId: Optional[str] = None
    target: Optional[str] = None
    url: Optional[str] = None
    label: str


class AssistantChatResponse(BaseModel):
    answer: str
    tier: str  # "tier0_kb" | "tier1_llm" | "tier2_fallback" | "guard_refusal"
    sources: List[str] = Field(default_factory=list)
    links: List[AssistantLink] = Field(default_factory=list)
    action: Optional[AssistantAction] = None
    suggest_escalation: bool = False


class AssistantService:
    @staticmethod
    def process_chat(
        request: AssistantChatRequest,
        is_authenticated: bool = False,
        user_role: Optional[str] = None,
    ) -> AssistantChatResponse:
        raw_message = (request.message or "").strip()
        if not raw_message:
            return AssistantChatResponse(
                answer="¿En qué puedo ayudarte? Puedes preguntarme sobre los pasos de la pre-evaluación o conceptos financieros.",
                tier="tier0_kb",
                sources=[],
                links=[],
                action=None,
                suggest_escalation=False,
            )

        # 1. PII Redaction
        clean_query = redact_pii(raw_message)

        # 2. Policy / Guardrails Check (S1 / S7)
        guard_refusal = check_out_of_scope_guard(clean_query)
        if guard_refusal:
            return AssistantChatResponse(
                answer=guard_refusal,
                tier="guard_refusal",
                sources=["Políticas de Crédito y Seguridad"],
                links=[],
                action=None,
                suggest_escalation=True,
            )

        # 3. Retrieval (filtered by audience permissions)
        allowed_audiences = get_allowed_audiences(
            is_authenticated=is_authenticated,
            user_role=user_role,
            screen_id=request.screen_id,
        )
        scored_chunks = retrieve_relevant_chunks(
            query=clean_query,
            screen_id=request.screen_id,
            field_id=request.field_id,
            allowed_audiences=allowed_audiences,
        )

        # 4. Handle no match (Tier 2 Fallback)
        if not scored_chunks:
            return AssistantChatResponse(
                answer=DEFAULT_NOT_FOUND_RESPONSE,
                tier="tier2_fallback",
                sources=[],
                links=[],
                action=None,
                suggest_escalation=True,
            )

        top_score, top_chunk = scored_chunks[0]
        chunks = [c for _, c in scored_chunks]

        # Extract sources
        sources = [c.get("title", "") for c in chunks if c.get("title")]

        # Extract actions & links strictly from KB metadata (never from LLM output)
        action: Optional[AssistantAction] = None
        if top_chunk.get("action"):
            act = top_chunk["action"]
            action = AssistantAction(
                type=act.get("type", "focus_field"),
                field_id=act.get("field_id"),
                step=act.get("step"),
                target=act.get("target"),
                label=act.get("label", "Ir al campo"),
            )

        links: List[AssistantLink] = []
        for c in chunks:
            lnk = c.get("link")
            if lnk and isinstance(lnk, dict):
                links.append(
                    AssistantLink(
                        type=lnk.get("type", "academy"),
                        articleId=lnk.get("articleId"),
                        target=lnk.get("target") or lnk.get("route"),
                        url=lnk.get("url"),
                        label=lnk.get("label", "Ver información"),
                    )
                )
            if len(links) >= 2:
                break

        # 5. Phrasing Tier Decision
        # Tier 1 (LLM Phrasing) is attempted if authenticated and Groq is available
        answer: Optional[str] = None
        tier = "tier0_kb"

        if is_authenticated:
            bounded_history = request.history[-MAX_HISTORY_MESSAGES:]
            history_dicts = [
                {
                    "role": h.role,
                    "content": redact_pii((h.content or "")[:MAX_MESSAGE_LENGTH]),
                }
                for h in bounded_history
                if h.role in {"user", "assistant"} and (h.content or "").strip()
            ]
            answer = ask_assistant_groq(
                user_query=clean_query,
                retrieved_chunks=chunks,
                conversation_history=history_dicts,
            )
            if answer:
                tier = "tier1_llm"

        # Tier 0 (KB verbatim fallback if anonymous, Groq disabled, or Groq failed)
        if not answer:
            answer = top_chunk.get("content", "")
            tier = "tier0_kb"

        return AssistantChatResponse(
            answer=answer,
            tier=tier,
            sources=sources,
            links=links,
            action=action,
            suggest_escalation=False,
        )
