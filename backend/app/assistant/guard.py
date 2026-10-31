"""Guardrails and safeguard checks for the virtual assistant (S1, S7)."""

import re
from typing import Optional
from .constants import GUARD_CREDIT_APPROVAL_RESPONSE

# Patterns attempting to directly manipulate scores in the system, demand the assistant
# to approve loans, demand guaranteed bank approvals, or falsify form data.
# Legitimate informational queries (e.g., "¿Cómo puedo mejorar mi score?",
# "¿Qué es la aprobación de un crédito hipotecario?", "¿Qué pasa si cambio de trabajo?")
# must NOT be blocked here so they can be answered from the Knowledge Base.
SCORE_MANIPULATION_PATTERNS = [
    # Direct commands/requests for the assistant to approve a loan or credit
    r"\b(apru[eé]b\w*|aprobarme|aprobarnos)\b.*(cr[eé]dito|pr[eé]stamo|hipotecario|solicitud|score|monto)",
    r"\b(puedes|podr[ií]as|quiero\s+que(?:\s+me)?)\s+aprob\w*.*(cr[eé]dito|pr[eé]stamo|hipotecario)",
    # Direct commands/requests for the assistant to alter/hack/override the user's score
    r"\b(c[aá]mbiame|modif[ií]came|alt[eé]rame|s[uú]beme|aum[eé]ntame|arr[eé]glame|manipul\w*|hacke\w*)\b.*(score|puntaje|calificaci[oó]n)",
    r"^\s*(cambia|modifica|altera|manipula)\s+(mi|el)\s+(score|puntaje|calificaci[oó]n)\b",
    r"\b(puedes|podr[ií]as|quiero\s+que(?:\s+me)?)\s+(cambiar|modificar|alterar|manipular)\s+(mi|el)\s+(score|puntaje|calificaci[oó]n)\b",
    # Direct requests to compute a score inside the chat
    r"\b(calc[uú]lame|calcula\s+mi|hazme\s+el\s+c[aá]lculo\s+de\s+mi)\s+(score|puntaje|calificaci[oó]n)\b",
    # Demands for guaranteed bank approval or which bank approves for sure
    r"\b(dime|garantiz\w*|asegur\w*)\b.*(que\s+me\s+van\s+a\s+dar\s+el\s+cr[eé]dito|aprobaci[oó]n\s+bancaria|que\s+me\s+aprueb\w*)",
    r"\b(qu[eé]|cu[aá]l)\s+banco\b.*\b(me\s+)?(va\s+a\s+aprobar|aprueba|aprobar[aá])\b",
    r"\bbanco\b.*aprob\w*.*s[ií]\s+o\s+s[ií]",
    # Fraud / falsifying data in the form
    r"\b(es\s+legal\s+mentir|c[oó]mo\s+mentir|c[oó]mo\s+enga[ñn]ar|falsear|adulterar)\b.*(datos|sueldo|ingreso|deuda|formulario|score|puntaje)",
]

COMPILED_GUARD_PATTERNS = [re.compile(p, re.IGNORECASE) for p in SCORE_MANIPULATION_PATTERNS]


def check_out_of_scope_guard(query: str) -> Optional[str]:
    """Inspects query for requests to manipulate scores or demand guaranteed loan approvals.

    Returns a canned refusal message if matched, or None if safe.
    """
    if not query:
        return None

    normalized = query.strip()
    for pattern in COMPILED_GUARD_PATTERNS:
        if pattern.search(normalized):
            return GUARD_CREDIT_APPROVAL_RESPONSE

    return None
