"""Authenticated HTTP transport; all domain decisions live outside routes."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from .contracts import ConfirmationCommand, CorrectionCommand, TrackingCommand, TrackingError
from .repository import TrackingRepository
from .service import TrackingService

router = APIRouter(prefix="/tracking", tags=["tracking"])
bearer = HTTPBearer(auto_error=False)


def repository(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
    if credentials is None:
        raise HTTPException(status_code=401, detail={"code": "unauthenticated"})
    return checked(TrackingRepository)


def checked(call):
    try:
        return call()
    except TrackingError as error:
        status = {
            "unauthenticated": 401, "owner_mismatch": 403, "not_found": 404,
            "idempotency_conflict": 409, "lineage_conflict": 409, "persistence_unavailable": 503,
        }.get(error.code, 422)
        raise HTTPException(status_code=status, detail={"code": error.code}) from None


def context(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
            repo=Depends(repository)):
    if credentials is None:
        raise HTTPException(status_code=401, detail={"code": "unauthenticated"})
    user_id = checked(lambda: repo.authenticate(credentials.credentials))
    return user_id, repo, TrackingService(repo)


@router.get("")
def summary(ctx=Depends(context), as_of: AwareDatetime | None = None):
    user_id, _, service = ctx
    return checked(lambda: service.read(user_id, as_of))


@router.get("/history")
def history(ctx=Depends(context), view: Literal["active", "audit"] = "active",
            cursor: Annotated[int, Query(ge=0)] = 0,
            limit: Annotated[int, Query(ge=1, le=200)] = 50):
    user_id, _, service = ctx
    result = checked(lambda: service.read(user_id))
    rows = result[f"{view}_line"]
    return {"items": rows[cursor:cursor + limit], "view": view,
            "next_cursor": cursor + limit if cursor + limit < len(rows) else None}


@router.post("/events")
def append(command: TrackingCommand, ctx=Depends(context)):
    user_id, _, service = ctx
    return checked(lambda: service.execute(user_id, command.model_dump(mode="json")))


@router.post("/events/{target_event_id}/corrections")
def correct(target_event_id: UUID, command: CorrectionCommand, ctx=Depends(context)):
    user_id, _, service = ctx
    return checked(lambda: service.execute(user_id, command.model_dump(mode="json"), str(target_event_id)))


@router.post("/goals/{goal_id}/confirmations")
def confirm(goal_id: UUID, command: ConfirmationCommand, ctx=Depends(context)):
    user_id, repo, _ = ctx
    if not command.reason.strip():
        raise HTTPException(status_code=422, detail={"code": "invalid_reason"})
    return checked(lambda: repo.confirm(user_id, str(goal_id), command.model_dump(mode="json")))


@router.get("/projection")
def projection(ctx=Depends(context), as_of: AwareDatetime | None = None):
    user_id, _, service = ctx
    return checked(lambda: service.projection(user_id, as_of))


class EvaluationAnnotation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    event_id: UUID
    effective_at: AwareDatetime
    kind: Literal["plan_accepted", "narrative", "housing_plan", "milestone"]
    payload: dict = Field(default_factory=dict)


@router.post("/evaluations/{evaluation_id}/events")
def annotate(evaluation_id: UUID, command: EvaluationAnnotation, ctx=Depends(context)):
    user_id, repo, _ = ctx
    return checked(lambda: repo.annotate(user_id, str(evaluation_id), command.model_dump(mode="json")))
