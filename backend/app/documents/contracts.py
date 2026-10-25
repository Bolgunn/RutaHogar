"""Typed commands: detected values are internal; owners submit decisions only."""
from datetime import date
from enum import Enum
from math import isfinite
from typing import Literal, get_args
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictStr, StrictBool, field_validator, model_validator
from .config import MAX_PDF_PAGES


class DocumentType(str, Enum):
    payslip = "liquidacion_sueldo"
    savings = "certificado_ahorro"
    employment = "documento_laboral"


class ProcessState(str, Enum):
    awaiting_upload = "awaiting_upload"
    ready = "ready"
    processing = "processing"
    ocr_ready = "ocr_ready"
    awaiting_review = "awaiting_review"
    confirmed = "confirmed"
    cancelled = "cancelled"
    processing_failed = "processing_failed"
    expired = "expired"


class DeletionState(str, Enum):
    not_requested = "not_requested"
    pending = "delete_pending"
    deleting = "deleting"
    deleted = "deleted"
    retry = "retry_required"


class BackingState(str, Enum):
    backed = "respaldado"
    difference = "con_diferencia"
    none = "sin_respaldo"


class Comparison(str, Enum):
    match = "match"
    difference = "difference"
    insufficient = "insufficient"


class Decision(str, Enum):
    undecided = "undecided"
    accept = "accept_detected"
    keep = "keep_declared"


FieldName = Literal["ingreso_mensual", "ahorro_disponible", "tipo_contrato", "continuidad_laboral"]
CONTRACT_TYPES = {"indefinido", "plazo_fijo", "independiente", "honorarios_variable"}
CONTINUITY = {"menos_6_meses", "entre_6_y_12_meses", "entre_1_y_3_anios", "mas_3_anios"}
ALLOWLISTS = {
    DocumentType.payslip: frozenset({"ingreso_mensual"}),
    DocumentType.savings: frozenset({"ahorro_disponible"}),
    DocumentType.employment: frozenset({"tipo_contrato", "continuidad_laboral"}),
}


class DocumentError(ValueError):
    pass


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class CreateProcess(Contract):
    document_type: DocumentType
    request_id: UUID = Field(default_factory=uuid4)


class Candidate(Contract):
    field: FieldName
    value: StrictFloat | StrictStr | None = None
    detection: Literal["detected", "ambiguous", "not_detected"] = "detected"
    page: int = Field(ge=1, le=MAX_PDF_PAGES, strict=True)

    @model_validator(mode="after")
    def validate_value(self):
        if self.detection != "detected":
            if self.value is not None:
                raise ValueError("unresolved candidate must not carry a value")
            return self
        if self.field in {"ingreso_mensual", "ahorro_disponible"}:
            if isinstance(self.value, bool) or not isinstance(self.value, (int, float)):
                raise ValueError("amount must be a JSON number")
            if not isfinite(self.value) or not 0 <= self.value <= 9_007_199_254_740_991:
                raise ValueError("invalid amount")
            if self.field == "ingreso_mensual" and self.value <= 0:
                raise ValueError("net monthly income must be positive")
        elif self.value not in (CONTRACT_TYPES if self.field == "tipo_contrato" else CONTINUITY):
            raise ValueError("invalid financial category")
        return self


class StructuredResult(Contract):
    document_type: DocumentType
    parser_version: str = Field(pattern=r"^[A-Za-z0-9_.-]{1,64}$")
    normalizer_version: str = Field(pattern=r"^[A-Za-z0-9_.-]{1,64}$")
    candidates: list[Candidate] = Field(min_length=1, max_length=2)

    @model_validator(mode="after")
    def allowed_fields(self):
        names = [row.field for row in self.candidates]
        if len(names) != len(set(names)) or set(names) - ALLOWLISTS[self.document_type]:
            raise ValueError("fields outside document allowlist or duplicated")
        return self


class FieldDecision(Contract):
    field: FieldName
    decision: Literal["accept_detected", "keep_declared"]


class ConfirmProcess(Contract):
    request_id: UUID
    expected_revision: int = Field(ge=0, strict=True)
    confirmed: StrictBool
    decisions: list[FieldDecision] = Field(min_length=0, max_length=2)

    @field_validator("confirmed")
    @classmethod
    def explicit_confirmation(cls, value):
        if value is not True:
            raise ValueError("explicit confirmation required")
        return value

    @model_validator(mode="after")
    def unique_fields(self):
        if len({d.field for d in self.decisions}) != len(self.decisions):
            raise ValueError("duplicate field decision")
        return self


class CancelProcess(Contract):
    expected_revision: int = Field(ge=0, strict=True)


class ReviewField(Contract):
    field: FieldName
    detection: Literal['detected', 'ambiguous', 'not_detected']
    detected_value: StrictFloat | StrictStr | None
    declared_value: StrictFloat | StrictStr | None
    comparison: Comparison
    page: int


class EvidenceView(Contract):
    field: FieldName
    comparison: Comparison
    decision: Decision
    backing_at_confirmation: BackingState
    current_backing: BackingState
    confirmed_at: str
    source_event_id: UUID
    tracking_event_id: UUID | None


class ProcessView(Contract):
    id: UUID
    document_type: DocumentType
    state: ProcessState
    revision: int
    created_at: str
    expires_at: str
    processing_at: str | None
    review_at: str | None
    closed_at: str | None
    parser_version: str | None
    normalizer_version: str | None
    contract_version: str
    failure_code: str | None
    deletion_state: DeletionState
    deletion_at: str | None
    tracking_event_id: UUID | None
    restrictions: dict
    candidates: list[ReviewField]
    evidence: list[EvidenceView]


class AuthorizeUpload(Contract):
    expected_revision: int = Field(ge=0, strict=True)
    extension: Literal['pdf', 'jpg', 'jpeg', 'png']
    content_type: Literal['application/pdf', 'image/jpeg', 'image/png']
    client_pages: int = Field(ge=1, le=MAX_PDF_PAGES, strict=True)

    @model_validator(mode='after')
    def matching_type(self):
        from .config import ALLOWED_FILES
        if self.extension not in ALLOWED_FILES[self.content_type] or (self.extension != 'pdf' and self.client_pages != 1):
            raise ValueError('invalid upload format')
        return self


class CompleteUpload(Contract):
    expected_revision: int = Field(ge=0, strict=True)


class UploadAuthorizationView(Contract):
    authorization: Literal['authenticated']
    bucket: str
    path: str
    expires_at: str
    revision: int
    content_type: str
    restrictions: dict


class StartOcr(Contract):
    consent_external_processing: StrictBool

    @field_validator('consent_external_processing')
    @classmethod
    def explicit_external_consent(cls, value):
        if value is not True:
            raise ValueError('external OCR consent required')
        return value


class PollOcr(Contract):
    pass


class OcrView(Contract):
    process_id: UUID
    state: ProcessState
    revision: int
    status: str | None
    next_attempt_at: str | None
    result_deletion_state: str | None
    message: str | None


class UpdateValidatedScore(Contract):
    request_id: UUID
    expected_revision: UUID
    validation_token: UUID


class DocumentScoreStatus(Contract):
    pending: StrictBool
    revision: UUID | None
    validation_token: UUID | None
    fields: list[FieldName]
    cleanup_required: StrictBool
    evaluation_id: UUID | None


class DocumentScoreResult(Contract):
    evaluation_id: UUID
    score: float
    classification: str
    algorithm_version: str


class DocumentBackingField(Contract):
    field: FieldName
    status: BackingState
    confirmed_on: date | None

    @model_validator(mode='after')
    def meaningful_date(self):
        if (self.status == BackingState.none) != (self.confirmed_on is None):
            raise ValueError('backing date must apply to the current state')
        return self


class DocumentBackingProjection(Contract):
    fields: list[DocumentBackingField] = Field(min_length=4, max_length=4)

    @model_validator(mode='after')
    def complete_fields(self):
        if {row.field for row in self.fields} != set(get_args(FieldName)):
            raise ValueError('projection must include each allowed field exactly once')
        return self
