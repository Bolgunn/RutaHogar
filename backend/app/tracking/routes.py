"""Authenticated HTTP transport; all domain decisions live outside routes."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from .contracts import ConfirmationCommand, CorrectionCommand, TrackingCommand, TrackingError
from .repository import TrackingRepository
from .service import TrackingService, client_tracking_view
from .staff import StaffLeadService
from .owner_reads import OwnerReadService

PRIVATE_HEADERS = {"Cache-Control": "private, no-store", "Pragma": "no-cache", "Vary": "Authorization"}


def private_response(response: Response):
    response.headers.update(PRIVATE_HEADERS)


router = APIRouter(prefix="/tracking", tags=["tracking"], dependencies=[Depends(private_response)])
bearer = HTTPBearer(auto_error=False)


def repository(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
    if credentials is None:
        raise HTTPException(status_code=401, detail={"code": "unauthenticated"}, headers=PRIVATE_HEADERS)
    return checked(TrackingRepository)


def checked(call):
    try:
        return call()
    except TrackingError as error:
        status = {
            "unauthenticated": 401, "owner_mismatch": 403, "not_found": 404,
            "idempotency_conflict": 409, "lineage_conflict": 409, "persistence_unavailable": 503,
            "market_data_unavailable": 503, "co_debtor_revision_conflict": 409,
            "co_debtor_relation_conflict": 409, "co_debtor_participation_closed": 409, "co_debtor_confirmation_required": 409,
            "co_debtor_consent_revoked": 409, "co_debtor_confirmation_already_applied": 409,
        }.get(error.code, 422)
        raise HTTPException(status_code=status, detail={"code": error.code}, headers=PRIVATE_HEADERS) from None


def context(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
            repo=Depends(repository)):
    if credentials is None:
        raise HTTPException(status_code=401, detail={"code": "unauthenticated"}, headers=PRIVATE_HEADERS)
    user_id = checked(lambda: repo.authenticate(credentials.credentials))
    return user_id, repo, TrackingService(repo)


def staff_context(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
                  repo=Depends(repository)):
    if credentials is None:
        raise HTTPException(status_code=401, detail={"code": "unauthenticated"}, headers=PRIVATE_HEADERS)
    return credentials.credentials, StaffLeadService(repo)


def owner_view(repo, user_id, value):
    if not callable(getattr(repo, "co_debtor_rows", None)):
        return value
    return OwnerReadService(repo, user_id).tracking_view(value)


@router.get("/owner/evaluations")
def owner_evaluations(ctx=Depends(context)):
    user_id, repo, _ = ctx
    return checked(lambda: OwnerReadService(repo, user_id).evaluations())


@router.get("/owner/scoring-history")
def owner_history(ctx=Depends(context)):
    user_id, repo, _ = ctx
    return checked(lambda: OwnerReadService(repo, user_id).history())


@router.get("/evaluations/{evaluation_id}/history")
def evaluation_history(evaluation_id: UUID, ctx=Depends(context),
                       credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)] = None):
    user_id, repo, _ = ctx

    def read():
        identity = repo.evaluation_identity(str(evaluation_id))
        if not identity:
            raise TrackingError("owner_mismatch")
        if identity["user_id"] != user_id:
            staff = StaffLeadService(repo)
            return staff.evaluation_history(credentials.credentials, identity["user_id"], str(evaluation_id))
        return {"items": [row for row in OwnerReadService(repo, identity["user_id"]).history()["items"]
                          if row.get("evaluation_id") == str(evaluation_id)]}

    return checked(read)


@router.get("/owner/co-debtor")
def owner_co_debtor(ctx=Depends(context)):
    user_id, repo, _ = ctx
    return checked(lambda: {"items": list(OwnerReadService(repo, user_id).invitations_view())})


@router.get("")
def summary(ctx=Depends(context), as_of: AwareDatetime | None = None):
    user_id, repo, service = ctx
    return checked(lambda: owner_view(repo, user_id, client_tracking_view(service.read(user_id, as_of))))


@router.get("/history")
def history(ctx=Depends(context), view: Literal["active", "audit"] = "active",
            cursor: Annotated[int, Query(ge=0)] = 0,
            limit: Annotated[int, Query(ge=1, le=200)] = 50):
    user_id, repo, service = ctx
    result = checked(lambda: owner_view(repo, user_id, client_tracking_view(service.read(user_id))))
    rows = result[f"{view}_line"]
    return {"items": rows[cursor:cursor + limit], "view": view,
            "next_cursor": cursor + limit if cursor + limit < len(rows) else None}


@router.post("/events")
def append(command: TrackingCommand, ctx=Depends(context)):
    user_id, repo, service = ctx
    return checked(lambda: owner_view(repo, user_id, service.execute(user_id, command.model_dump(mode="json"))))


@router.post("/events/{target_event_id}/corrections")
def correct(target_event_id: UUID, command: CorrectionCommand, ctx=Depends(context)):
    user_id, repo, service = ctx
    return checked(lambda: owner_view(repo, user_id, service.execute(user_id, command.model_dump(mode="json"), str(target_event_id))))


@router.post("/goals/{goal_id}/confirmations")
def confirm(goal_id: UUID, command: ConfirmationCommand, ctx=Depends(context)):
    user_id, repo, _ = ctx
    if not command.reason.strip():
        raise HTTPException(status_code=422, detail={"code": "invalid_reason"}, headers=PRIVATE_HEADERS)
    return checked(lambda: owner_view(repo, user_id, repo.confirm(user_id, str(goal_id), command.model_dump(mode="json"))))


@router.get("/projection")
def projection(ctx=Depends(context), as_of: AwareDatetime | None = None):
    user_id, repo, service = ctx
    return checked(lambda: owner_view(repo, user_id, service.projection(user_id, as_of)))


@router.get("/staff/evaluations")
def staff_evaluations(ctx=Depends(staff_context)):
    token, service = ctx
    return checked(lambda: service.evaluations(token))


@router.get("/staff/leads/{lead_id}")
def staff_lead_detail(lead_id: UUID, ctx=Depends(staff_context)):
    token, service = ctx
    return checked(lambda: service.lead_detail(token, str(lead_id)))


class EvaluationAnnotation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    event_id: UUID
    effective_at: AwareDatetime
    kind: Literal["plan_accepted", "narrative", "housing_plan", "milestone"]
    payload: dict = Field(default_factory=dict)


class CoDebtorConfirmationEvaluationCommand(BaseModel):
    """Deliberately empty: the authenticated session is the only lead input."""

    model_config = ConfigDict(extra="forbid")


@router.post("/evaluations/co-debtor-confirmation")
def update_score_with_confirmed_co_debtor(
    _command: CoDebtorConfirmationEvaluationCommand | None = None,
    ctx=Depends(context),
):
    user_id, repo, service = ctx
    return checked(lambda: owner_view(repo, user_id, service.update_score_with_confirmed_co_debtor(user_id)))


@router.post("/evaluations/{evaluation_id}/events")
def annotate(evaluation_id: UUID, command: EvaluationAnnotation, ctx=Depends(context)):
    user_id, repo, _ = ctx
    return checked(lambda: owner_view(repo, user_id, repo.annotate(user_id, str(evaluation_id), command.model_dump(mode="json"))))
