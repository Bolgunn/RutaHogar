"""PII scrubbing / redaction utilities for virtual assistant prompts and logs."""

import re

# Chilean RUT regex: e.g. 12.345.678-9, 12345678-k, 9.876.543-2
RUT_PATTERN = re.compile(r"\b\d{1,2}(?:\.?\d{3}){2}-?[\dkK]\b")

# Email regex
EMAIL_PATTERN = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b")

# Long numeric sequences (phone numbers, account numbers, credit cards: 8 to 16 digits)
LONG_NUMBERS_PATTERN = re.compile(r"\b(?:\+?56\s?9\s?)?\d{8,16}\b")


def redact_pii(text: str) -> str:
    """Replaces identifiable personal data (RUT, email, phone/account numbers)

    with neutral placeholders before passing to logs or LLM.
    """
    if not text:
        return ""

    sanitized = RUT_PATTERN.sub("[RUT_REDACTADO]", text)
    sanitized = EMAIL_PATTERN.sub("[EMAIL_REDACTADO]", sanitized)
    sanitized = LONG_NUMBERS_PATTERN.sub("[NUMERO_REDACTADO]", sanitized)
    return sanitized
