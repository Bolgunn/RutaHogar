import os
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .contracts import LeadChangeError
from .service import LeadChangeService


router = APIRouter(prefix="/lead-changes", tags=["lead-changes"])
bearer = HTTPBearer(auto_error=False)


def checked(call):
    try:
        return call()
    except LeadChangeError as error:
        status = {
            "persistence_unavailable": 503,
            "email_not_configured": 503,
            "email_provider_unavailable": 503,
            "email_provider_rejected": 502,
            "missing_recipient": 422,
        }.get(error.code, 422)
        raise HTTPException(status_code=status, detail={"code": error.code}) from None


def require_cron(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
    expected = (
        os.environ.get("LEAD_CHANGES_CRON_TOKEN", "").strip()
        or os.environ.get("CRON_SECRET", "").strip()
    )
    if not expected:
        raise HTTPException(status_code=503, detail={"code": "cron_token_unconfigured"})
    if credentials is None or credentials.scheme.lower() != "bearer" or credentials.credentials != expected:
        raise HTTPException(status_code=401, detail={"code": "unauthorized"})
    return True


@router.api_route("/daily-digest", methods=["GET", "POST"])
def daily_digest(
    _=Depends(require_cron),
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    dry_run: bool = False,
):
    return checked(lambda: LeadChangeService().run_daily_digest(limit=limit, dry_run=dry_run))
