"""Owner lifecycle only. No client endpoint can register OCR or acknowledge deletion."""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from ..tracking.contracts import TrackingError
from .contracts import CancelProcess, ConfirmProcess, CreateProcess, DocumentError, ProcessView
from .repository import DocumentRepository
from .service import DocumentService
from .upload import UploadService
from .ocr import OcrService
from .parsing import ParsingService
from .score_update import DocumentScoreService
from .backing import DocumentBackingService
from .contracts import DocumentBackingProjection
from .contracts import DocumentScoreResult, DocumentScoreStatus, UpdateValidatedScore
from .contracts import StartOcr, PollOcr, OcrView
from .config import public_limits
from .contracts import AuthorizeUpload, CompleteUpload, UploadAuthorizationView


class PrivateValidationRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def redacted_handler(request: Request):
            try:
                response = await handler(request)
                response.headers["Cache-Control"] = "no-store"
                return response
            except HTTPException as exc:
                exc.headers = {**(exc.headers or {}), 'Cache-Control': 'no-store'}
                raise
            except RequestValidationError:
                # FastAPI's default error includes the supplied input, including forged OCR.
                raise HTTPException(422, detail={"code": "invalid_request"}, headers={"Cache-Control": "no-store"}) from None
        return redacted_handler


router = APIRouter(prefix="/tracking/documents", tags=["documents"], route_class=PrivateValidationRoute)
bearer = HTTPBearer(auto_error=False)


def checked(call):
    try:
        return call()
    except (DocumentError, TrackingError) as exc:
        code = str(exc)
        status = {"unauthenticated": 401, "not_found": 404, "owner_mismatch": 403, "expired": 410,
                  "stale_review": 409, "lineage_conflict": 409, "idempotency_conflict": 409,
                  "no_score_pending": 409, "stale_score_state": 409, "document_cleanup_pending": 409,
                  "score_update_unavailable": 503, "market_data_unavailable": 503, "score_update_disabled": 503,
                  "already_closed": 409, "invalid_transition": 409, "tracking_baseline_required": 409,
                  "persistence_unavailable": 503, "storage_unavailable": 503, "ocr_unavailable": 503, "parsing_disabled": 503, "confirmation_disabled": 503,
                  "local_ocr_unavailable": 503, "ocr_provider_mismatch": 409,
                  "local_ocr_public_origin_invalid": 503,
                  "upload_already_exists": 409, "upload_format_locked": 409,
                  "upload_not_authorized": 409, "upload_not_verified": 409}.get(code, 422)
        raise HTTPException(status, detail={"code": code}) from None


def repository(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
    if credentials is None:
        raise HTTPException(401, detail={"code": "unauthenticated"})
    return checked(DocumentRepository)


def context(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)], repo=Depends(repository)):
    if credentials is None:
        raise HTTPException(401, detail={"code": "unauthenticated"})
    user = checked(lambda: repo.authenticate(credentials.credentials))
    return user, DocumentService(repo)


@router.post("/sessions", status_code=201, response_model=ProcessView)
def create(command: CreateProcess, ctx=Depends(context)):
    user, service = ctx
    return checked(lambda: service.create(user, command))


@router.get("/sessions/{process_id}", response_model=ProcessView)
def read(process_id: UUID, ctx=Depends(context)):
    user, service = ctx
    return checked(lambda: service.read(user, str(process_id)))


@router.post("/sessions/{process_id}/confirm", response_model=ProcessView)
def confirm(process_id: UUID, command: ConfirmProcess, ctx=Depends(context)):
    user, service = ctx
    checked(lambda: UploadService(service.repository).confirm(user, str(process_id), command))
    OcrService(service.repository).try_cleanup(user, str(process_id))
    return checked(lambda: service.read(user, str(process_id)))


@router.post("/sessions/{process_id}/cancel", response_model=ProcessView)
def cancel(process_id: UUID, command: CancelProcess, ctx=Depends(context)):
    user, service = ctx
    checked(lambda: UploadService(service.repository).cancel(user, str(process_id), command))
    OcrService(service.repository).try_cleanup(user, str(process_id))
    return checked(lambda: service.read(user, str(process_id)))


def global_admin_context(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
                         repo=Depends(repository)):
    if credentials is None:
        raise HTTPException(401, detail={"code": "unauthenticated"})
    actor = checked(lambda: repo.tracking.staff_actor(credentials.credentials))
    if actor.get("role") != "admin" or actor.get("inmobiliaria_id") is not None:
        raise HTTPException(403, detail={"code": "forbidden"})
    return actor


@router.get('/diagnostics/ocr')
def ocr_diagnostics(_admin=Depends(global_admin_context)):
    # Configuration presence only: never return or log supplied values.
    import os
    from .azure import AzureOcrClient, OcrError
    from .local_ocr import LocalOcrClient

    configured = lambda name: bool(os.getenv(name, '').strip())
    raw_provider = os.getenv('HU23_OCR_PROVIDER')
    provider = raw_provider if raw_provider in ('azure', 'local') else ('azure' if raw_provider is None else 'invalid')
    worker_url = configured('HU23_LOCAL_OCR_URL')
    worker_token = configured('HU23_LOCAL_OCR_TOKEN')
    azure_endpoint = configured('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT')
    azure_key = configured('AZURE_DOCUMENT_INTELLIGENCE_KEY')
    ready = False
    # The backend defaults to Azure, but an absent explicit provider is not
    # counted as ready in this deployment diagnostic.
    if raw_provider == 'azure' and azure_endpoint and azure_key:
        try:
            AzureOcrClient()
            ready = True
        except OcrError:
            pass
    elif raw_provider == 'local' and worker_url and worker_token:
        try:
            LocalOcrClient()
            ready = True
        except DocumentError:
            pass
    return {'provider': provider, 'worker_url_configured': worker_url,
            'worker_token_configured': worker_token, 'azure_endpoint_configured': azure_endpoint,
            'azure_key_configured': azure_key, 'ready_for_selected_provider': ready}


@router.get('/config')
def configuration(ctx=Depends(context)):
    from .local_ocr import configured_provider
    return {'ocr_provider': checked(configured_provider), 'restrictions': public_limits(), 'document_types': ['liquidacion_sueldo','certificado_ahorro','documento_laboral']}


@router.post('/sessions/{process_id}/upload', response_model=UploadAuthorizationView)
def authorize_upload(process_id: UUID, command: AuthorizeUpload, ctx=Depends(context)):
    user, service = ctx
    return checked(lambda: UploadService(service.repository).authorize(user, str(process_id), command))


@router.post('/sessions/{process_id}/upload/complete', response_model=ProcessView)
def complete_upload(process_id: UUID, command: CompleteUpload, ctx=Depends(context)):
    user, service = ctx
    return checked(lambda: UploadService(service.repository).complete(user, str(process_id), command))


@router.post('/sessions/{process_id}/ocr/start', status_code=202, response_model=OcrView)
def start_ocr(process_id: UUID, command: StartOcr, ctx=Depends(context)):
    user, service = ctx
    return checked(lambda: OcrService(service.repository).start(user, str(process_id), expected_provider=command.expected_provider))


@router.post('/sessions/{process_id}/ocr/poll', response_model=OcrView)
def poll_ocr(process_id: UUID, command: PollOcr, ctx=Depends(context)):
    user, service = ctx
    return checked(lambda: OcrService(service.repository).poll(user, str(process_id)))


@router.post('/sessions/{process_id}/parse', status_code=202, response_model=ProcessView)
def parse_ocr(process_id: UUID, command: PollOcr, ctx=Depends(context)):
    user, service = ctx
    return checked(lambda: ParsingService(service.repository).consume(user, str(process_id)))


@router.get('/score/status', response_model=DocumentScoreStatus)
def document_score_status(ctx=Depends(context)):
    user, service = ctx
    return checked(lambda: DocumentScoreService(service.repository).status(user))


@router.post('/score/update', response_model=DocumentScoreResult)
def update_document_score(command: UpdateValidatedScore, ctx=Depends(context)):
    user, service = ctx
    return checked(lambda: DocumentScoreService(service.repository).update(user, command))


@router.get('/backing', response_model=DocumentBackingProjection)
def own_document_backing(ctx=Depends(context)):
    user, service = ctx
    return checked(lambda: DocumentBackingService(service.repository).owner(user))


@router.get('/staff/leads/{lead_id}/backing', response_model=DocumentBackingProjection)
def staff_document_backing(lead_id: UUID,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    repo=Depends(repository)):
    if credentials is None:
        raise HTTPException(401, detail={'code':'unauthenticated'})
    return checked(lambda: DocumentBackingService(repo).staff(credentials.credentials,str(lead_id)))


# Scheduler auth is deliberately separate from owner/Auth context and commercial roles.
def require_cleanup_cron(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
    import hmac
    import os
    secrets = [os.getenv('CRON_SECRET'), os.getenv('HU23_CLEANUP_CRON_TOKEN')]
    secrets = [value for value in secrets if value]
    if not secrets:
        raise HTTPException(503, detail={'code': 'cleanup_unavailable'})
    if credentials is None or not any(hmac.compare_digest(credentials.credentials.encode(), value.encode()) for value in secrets):
        raise HTTPException(401, detail={'code': 'unauthenticated'})


def cleanup_service(_auth=Depends(require_cleanup_cron)):
    from .cleanup import DocumentCleanupService
    return checked(lambda: DocumentCleanupService(DocumentRepository()))


@router.get('/cleanup')
def scheduled_cleanup(service=Depends(cleanup_service)):
    return checked(service.run)


@router.post('/cleanup')
def manual_cleanup(service=Depends(cleanup_service)):
    return checked(service.run)
