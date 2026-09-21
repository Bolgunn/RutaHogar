from datetime import datetime, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.tracking.contracts import TrackingCommand


def test_patch_preserves_presence_null_and_project_metadata():
    project = {"id": "project-1", "nombre": "Vivienda", "metadata": {"source": "catalog"}}
    patch = {"ahorro_disponible": 100, "comuna_objetivo": None, "project_goal": project}
    command = TrackingCommand(
        event_id=uuid4(), effective_at=datetime.now(timezone.utc), reason="monthly_update", patch=patch,
    )
    assert command.patch == patch
    assert "ingreso_mensual" not in command.patch
    assert command.model_dump(mode="json")["patch"]["project_goal"] == project


def test_owner_cannot_be_supplied_in_request():
    with pytest.raises(ValidationError):
        TrackingCommand(
            event_id=uuid4(), effective_at=datetime.now(timezone.utc), reason="update",
            patch={"ingreso_mensual": 100}, user_id="another-user",
        )


def test_partial_update_requires_fields_but_reevaluation_does_not():
    args = dict(event_id=uuid4(), effective_at=datetime.now(timezone.utc), reason="reevaluation")
    with pytest.raises(ValidationError):
        TrackingCommand(**args)
    assert TrackingCommand(**args, event_kind="evaluation").patch == {}
