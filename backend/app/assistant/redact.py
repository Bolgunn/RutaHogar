"""PII scrubbing / redaction utilities for virtual assistant prompts and logs."""

import re

# Chilean RUT regex: e.g. 12.345.678-9, 12345678-k, 9.876.543-2
RUT_PATTERN = re.compile(r"\b\d{1,2}(?:\.?\d{3}){2}-?[\dkK]\b")

# Email regex
EMAIL_PATTERN = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b")

# Credit/debit card sequences separated by spaces or hyphens: 4 groups, or Amex's 4-6-5 layout.
# Three groups are left alone so lists of years or amounts are not masked.
CARD_PATTERN = re.compile(r"\b(?:(?:\d{4}[\s-]){3}\d{1,7}|\d{4}[\s-]\d{6}[\s-]\d{5})\b")

# Chilean phone numbers with spaces or hyphens (e.g. +56 9 1234 5678, +56-9-1234-5678, 9 1234 5678)
SPACED_PHONE_PATTERN = re.compile(
    r"(?:\+?56[\s-]?)?(?:\b9[\s-])\d{4}[\s-]\d{4}\b|\+56[\s-]?\d[\s-]?\d{4}[\s-]?\d{4}\b"
)

# Long contiguous numeric sequences (phone numbers, account numbers, credit cards: 8 to 19 digits)
LONG_NUMBERS_PATTERN = re.compile(r"(?:\+?56\s?9\s?)?\b\d{8,19}\b")


def redact_pii(text: str) -> str:
    """Replaces identifiable personal data (RUT, email, phone/account/card numbers)

    with neutral placeholders before passing to logs or LLM.
    """
    if not text:
        return ""

    sanitized = RUT_PATTERN.sub("[RUT_REDACTADO]", text)
    sanitized = EMAIL_PATTERN.sub("[EMAIL_REDACTADO]", sanitized)
    sanitized = CARD_PATTERN.sub("[NUMERO_REDACTADO]", sanitized)
    sanitized = SPACED_PHONE_PATTERN.sub("[NUMERO_REDACTADO]", sanitized)
    sanitized = LONG_NUMBERS_PATTERN.sub("[NUMERO_REDACTADO]", sanitized)
    return sanitized
