"""Guardrails and safeguard checks for the virtual assistant (S1, S7)."""

import re
from typing import Optional
from .constants import GUARD_CREDIT_APPROVAL_RESPONSE

# Patterns attempting to alter scores, approve loans, or demand guaranteed loan approvals
SCORE_MANIPULATION_PATTERNS = [
    r"\b(aprob\w*|apru[eé]b\w*)\b.*(cr[eé]dito|pr[eé]stamo|hipotecario|score|monto)",
    r"\b(cambi\w*|modific\w*|alter\w*|sub\w*|aument\w*|arregl\w*|mejor\w*)\b.*(score|puntaje|calificaci[oó]n)",
    r"\b(dime|garantiza|asegura)\b.*(que me van a dar el cr[eé]dito|aprobaci[oó]n bancaria)",
    r"\b(es legal mentir|como mentir|como engañar|falsear)\b.*(datos|sueldo|ingreso|deuda|formulario)",
    r"\b(qu[eé]|cu[aá]l)\s+banco\b.*aprob\w*",
    r"\bbanco\b.*aprob\w*.*s[ií]\s+o\s+s[ií]",
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
