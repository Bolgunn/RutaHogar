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
from test_persistence import seed


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


@pytest.mark.parametrize('compatible', [True, False])
def test_synthetic_identities_and_executive_privacy(setup, compatible):
    user,pid,repo,docs=setup
    identity={'full_name':'Camila Fernanda Prueba Usuario','rut':'1.111.111-4'}
    repo.load_identity=lambda _: identity
    executive=seed('ejecutivo')
    name=identity['full_name'] if compatible else 'Diego Andres Ejemplo Demo'
    rut=identity['rut'] if compatible else '2.222.222-8'

    class SyntheticClient:
        def parse(self, *_):
            return parse_document('liquidacion_sueldo', {'content':'', 'pages':[{'pageNumber':1, 'lines':[
                {'content':f'Razon social: Empresa Demo RutaHogar SpA Nombre trabajador: {name}'},
                {'content':f'RUT empleador: 76.000.000-0 RUT trabajador: {rut}'},
                {'content':'Liquido a pagar: $1.450.000'}]}]}, date(2026,10,25))

    admit_upload(user,pid,repo)
    before=repo.load_tracking(user)
    LocalOcrService(repo,Storage(),client=SyntheticClient()).start(user,pid)
    view=docs.read(user,pid)
    assert view['state']==('awaiting_review' if compatible else 'processing_failed')
    if compatible:
        assert view['failure_code'] is None
        assert any(row['field']=='ingreso_mensual' and row['detected_value']==1450000 for row in view['candidates'])
    else:
        assert view['failure_code']=='identity_inconsistent' and view['candidates']==[]
    assert repo.load_tracking(user)==before
    # The commercial role has no owner access, candidates, identity or original file.
    with pytest.raises(DocumentError,match='not_found'):
        docs.read(executive,pid)
    for table, condition in [('document_processes',f'id={lit(pid)}'),
                             ('document_candidates',f'process_id={lit(pid)}'),
                             ('document_field_evidence',f'process_id={lit(pid)}'),
                             ('storage.objects',"bucket_id='hu23-document-temporary'")]:
        assert sql(f'SELECT count(*) FROM {table} WHERE {condition};',role='authenticated',owner=executive)=='0'
