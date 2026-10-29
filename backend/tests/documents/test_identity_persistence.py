"""Identity rejection uses the existing OCR lease and closes the real SQL process."""
from datetime import date
from uuid import uuid4
import json

import pytest

from app.documents.contracts import ConfirmProcess, DocumentError
from app.documents.local_ocr import LocalOcrService
from app.documents.parsers import parse_document
from test_local_ocr_persistence import Storage
from test_persistence import setup, admit_upload, sql, lit, pytestmark


class IdentityClient:
    def parse(self, *_):
        return parse_document('liquidacion_sueldo', {'content':'', 'pages':[{'pageNumber':1, 'lines':[
            {'content':'Nombre trabajador: Juan Perez'}, {'content':'RUT trabajador: 17.493.908-k'},
            {'content':'Liquido a pagar: $1.450.000'}]}]}, date(2026,10,25))


def test_inconsistent_identity_closes_process_without_persisting_values_or_confirmation(setup):
    user,pid,repo,docs=setup
    repo.load_identity=lambda _: {'rut':'12.345.678-5','nombre':'Juan','apellido_paterno':'Perez'}
    admit_upload(user,pid,repo)
    before=repo.load_tracking(user)
    bundle=LocalOcrService(repo,Storage(),client=IdentityClient()).start(user,pid)
    assert bundle['process']['state']=='processing_failed'
    view=docs.read(user,pid)
    assert view['failure_code']=='identity_inconsistent' and view['candidates']==[] and view['evidence']==[]
    assert '17493908' not in json.dumps(view) and 'juan perez' not in json.dumps(view).lower()
    assert repo.load_tracking(user)==before
    with pytest.raises(DocumentError,match='invalid_transition'):
        docs.confirm(user,pid,ConfirmProcess(request_id=uuid4(),expected_revision=view['revision'],confirmed=True,decisions=[]))
    assert sql("select has_function_privilege('anon','public.hu23_reject_identity(uuid,uuid,integer,uuid)','execute')")=='f'
    assert sql("select has_function_privilege('authenticated','public.hu23_reject_identity(uuid,uuid,integer,uuid)','execute')")=='f'
