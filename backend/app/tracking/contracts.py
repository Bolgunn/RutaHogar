"""HTTP contracts; financial rules remain owned by the scoring engine."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator


class TrackingCommand(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    event_id: UUID
    event_kind: Literal["data_update", "evaluation"] = "data_update"
    effective_at: AwareDatetime
    reason: str = Field(min_length=1)
    previous_event_id: UUID | None = None
    patch: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_command(self):
        if not self.reason.strip():
            raise ValueError("reason must not be blank")
        if self.event_kind == "data_update" and not self.patch:
            raise ValueError("data_update requires a nonempty patch")
        return self


class CorrectionCommand(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    event_id: UUID
    effective_at: AwareDatetime
    reason: str = Field(min_length=1)
    correction_effect: Literal["replace", "annul"]
    patch: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_command(self):
        if not self.reason.strip():
            raise ValueError("reason must not be blank")
        if self.correction_effect == "annul" and self.patch:
            raise ValueError("annul cannot replace fields")
        return self


class ConfirmationCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: UUID
    effective_at: AwareDatetime
    reason: str = Field(min_length=1)
    confirmed: bool


class TrackingError(ValueError):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def parse_time(value: str | datetime) -> datetime:
    parsed = value if isinstance(value, datetime) else datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise TrackingError("invalid_timestamp")
    return parsed
