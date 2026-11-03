"""Canonical HU23 admission/retention contract; no provider credentials."""
from datetime import timedelta

MAX_DOCUMENT_BYTES = 4_000_000
MAX_PDF_PAGES = 2
MAX_RETENTION = timedelta(hours=24)
# Hourly recovery and two retry runs leave almost three hours of outage margin.
REVIEW_LIFETIME = timedelta(hours=20)
ALLOWED_FILES = {"application/pdf": ("pdf",), "image/jpeg": ("jpg", "jpeg"), "image/png": ("png",)}
CONTRACT_VERSION = "hu23-v1"


def public_limits():
    return {"max_bytes": MAX_DOCUMENT_BYTES, "max_pdf_pages": MAX_PDF_PAGES,
            "max_retention_seconds": int(MAX_RETENTION.total_seconds()),
            "files": ALLOWED_FILES}

TEMPORARY_BUCKET = "hu23-document-temporary"
UPLOAD_LIFETIME = timedelta(minutes=10)
