"""Export HTTP boundary; actor and tenant come from the authenticated token."""
from typing import Annotated, Literal
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from ..tracking.routes import repository, bearer
from fastapi.security import HTTPAuthorizationCredentials
from ..tracking.contracts import TrackingError
from .service import ExportService

router = APIRouter(prefix="/exports", tags=["exports"])


class ExportCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: UUID
    kind: Literal["dossier", "leads", "metrics"]
    blocks: list[str] = Field(min_length=1, max_length=8)
    evaluation_ids: list[UUID] = Field(default_factory=list, max_length=500)
    project_id: UUID | None = None
    filters: dict[str, str | int | bool | list[str] | None] = Field(default_factory=dict, max_length=20)
    source_at: str | None = Field(default=None, max_length=64)


@router.post("/eligible")
@router.post("/prepare")
def prepare(command: ExportCommand, request: Request, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)], repo=Depends(repository)):
    if credentials is None:
        raise HTTPException(status_code=401, detail={"code": "unauthenticated"})
    try:
        return ExportService(repo).prepare(credentials.credentials, command, preview=request.url.path.endswith("/eligible"))
    except TrackingError as error:
        status = {"owner_mismatch": 403, "unauthenticated": 401, "persistence_unavailable": 503, "idempotency_conflict": 409}.get(error.code, 422)
        raise HTTPException(status_code=status, detail={"code": error.code}) from None


@router.get("")
def history(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)], repo=Depends(repository)):
    if credentials is None:
        raise HTTPException(status_code=401, detail={"code": "unauthenticated"})
    try:
        actor = repo.staff_actor(credentials.credentials)
        if actor.get("role") not in {"ejecutivo", "admin", "admin_inmobiliario"} or not actor.get("inmobiliaria_id"):
            raise TrackingError("owner_mismatch")
        records = repo.request("GET", f"/rest/v1/export_events?select=id,kind,generated_at,status,record_count,actor_id,actor_role,inmobiliaria_id,project_id,blocks,filters,source_at&actor_id=eq.{actor['id']}&actor_role=eq.{actor['role']}&inmobiliaria_id=eq.{actor['inmobiliaria_id']}&order=generated_at.desc&limit=100", token=credentials.credentials)
        service = ExportService(repo)
        records = service.describe_records(records)
        if any(record.get("project_id") for record in records):
            scope = repo.request("POST", "/rest/v1/rpc/commercial_funnel_facts", token=credentials.credentials, payload={})
            projects = {str(project["id"]): project.get("nombre") for project in scope.get("proyectos", [])}
            for record in records:
                record["project_name"] = projects.get(record.get("project_id"))
        return records
    except TrackingError as error:
        raise HTTPException(status_code={"owner_mismatch": 403, "unauthenticated": 401}.get(error.code, 503), detail={"code": error.code}) from None


class DeliveryCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")


@router.post("/{export_id}/delivery")
def delivery(export_id: UUID, command: DeliveryCommand, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)], repo=Depends(repository)):
    if credentials is None:
        raise HTTPException(status_code=401, detail={"code": "unauthenticated"})
    try:
        actor = repo.staff_actor(credentials.credentials)
        if actor.get("role") not in {"ejecutivo", "admin", "admin_inmobiliario"} or not actor.get("inmobiliaria_id"):
            raise TrackingError("owner_mismatch")
        rows = repo.request("GET", f"/rest/v1/export_events?id=eq.{export_id}&actor_id=eq.{actor['id']}&inmobiliaria_id=eq.{actor['inmobiliaria_id']}&select=id")
        if not rows:
            raise TrackingError("owner_mismatch")
        repo.request("POST", "/rest/v1/rpc/hu22_export_delivery", payload={"p_id": str(export_id), "p_sha256": command.sha256})
        return {"id": str(export_id), "status": "delivery_requested"}
    except TrackingError as error:
        raise HTTPException(status_code={"owner_mismatch": 403, "unauthenticated": 401, "idempotency_conflict": 409}.get(error.code, 503), detail={"code": error.code}) from None
