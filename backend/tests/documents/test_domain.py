from copy import deepcopy
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.documents.config import MAX_DOCUMENT_BYTES, MAX_PDF_PAGES, MAX_RETENTION, REVIEW_LIFETIME
from app.documents.contracts import Candidate, ConfirmProcess, CreateProcess, DocumentError, StructuredResult
from app.documents.domain import backing_state, compare, current_backing, validate_transition
from app.documents.tracking_adapter import prepare_update


def result(kind='liquidacion_sueldo', field='ingreso_mensual', value=1200000):
    return {'document_type': kind, 'parser_version': 'parser-v1', 'normalizer_version': 'normalizer-v1',
            'candidates': [{'field': field, 'value': value, 'page': 1}]}


@pytest.mark.parametrize('kind,field,value', [
    ('liquidacion_sueldo','ahorro_disponible',1), ('certificado_ahorro','ingreso_mensual',1),
    ('documento_laboral','ingreso_mensual',1), ('documento_laboral','deuda_mensual',1),
    ('liquidacion_sueldo','nombre','forbidden'), ('liquidacion_sueldo','rut','forbidden'),
])
def test_document_allowlist_rejects_other_financial_and_personal_fields(kind, field, value):
    with pytest.raises(ValidationError):
        StructuredResult.model_validate(result(kind,field,value))


@pytest.mark.parametrize('value', [True, False, '1000', -1, 0, float('nan'), float('inf'), 9007199254740992])
def test_income_is_a_strict_positive_finite_net_amount(value):
    with pytest.raises(ValidationError):
        StructuredResult.model_validate(result(value=value))


@pytest.mark.parametrize('field,values', [
    ('tipo_contrato',['indefinido','plazo_fijo','independiente','honorarios_variable']),
    ('continuidad_laboral',['menos_6_meses','entre_6_y_12_meses','entre_1_y_3_anios','mas_3_anios']),
])
def test_existing_enums(field, values):
    for value in values:
        StructuredResult.model_validate(result('documento_laboral',field,value))
    with pytest.raises(ValidationError):
        StructuredResult.model_validate(result('documento_laboral',field,'arbitrary'))


def test_zero_savings_and_unresolved_candidate():
    StructuredResult.model_validate(result('certificado_ahorro','ahorro_disponible',0))
    candidate = Candidate(field='ingreso_mensual', detection='ambiguous', page=1)
    assert compare(1,candidate) == 'insufficient'
    with pytest.raises(ValidationError):
        Candidate(field='ingreso_mensual',value=1,detection='ambiguous',page=1)


def test_no_extra_text_raw_ocr_or_owner_in_contracts():
    with pytest.raises(ValidationError):
        StructuredResult.model_validate({**result(), 'ocr_text':'sensitive'})
    with pytest.raises(ValidationError):
        CreateProcess(document_type='liquidacion_sueldo',user_id=str(uuid4()))
    with pytest.raises(ValidationError):
        StructuredResult.model_validate({**result(), 'candidates': result()['candidates']*2})


def test_lifecycle_is_explicit_and_closed_states_cannot_reopen():
    for a,b in [('awaiting_upload','ready'),('ready','processing'),('processing','awaiting_review'),
                ('awaiting_review','confirmed'),('processing','processing_failed')]:
        validate_transition(a,b)
    for a,b in [('awaiting_upload','confirmed'),('cancelled','confirmed'),('confirmed','processing'),
                ('processing_failed','ready')]:
        with pytest.raises(DocumentError): validate_transition(a,b)


@pytest.mark.parametrize('declared,detected,decision,historical,current', [
    (100,100,'keep_declared','match','respaldado'),
    (100,120,'accept_detected','difference','respaldado'),
    (100,120,'keep_declared','difference','con_diferencia'),
])
def test_historical_comparison_and_current_evidence_are_distinct(declared,detected,decision,historical,current):
    comparison=compare(declared,Candidate(field='ingreso_mensual',value=detected,page=1))
    assert comparison==historical
    assert backing_state(comparison,decision)==current
    assert current_backing(current,999,detected)=='sin_respaldo'


def test_limits_are_one_explicit_contract():
    assert (MAX_DOCUMENT_BYTES,MAX_PDF_PAGES)==(4000000,2)
    assert REVIEW_LIFETIME.total_seconds()+3600 < MAX_RETENTION.total_seconds()


@pytest.mark.parametrize('confirmed',[False,1,'true'])
def test_confirmation_requires_actual_explicit_true(confirmed):
    with pytest.raises(ValidationError):
        ConfirmProcess(request_id=uuid4(),expected_revision=3,confirmed=confirmed,
                       decisions=[{'field':'ingreso_mensual','decision':'accept_detected'}])


def test_domain_enums_stay_compatible_with_existing_financial_contract():
    from app.documents.contracts import CONTRACT_TYPES, CONTINUITY
    from app.main import VALID_CONTRACT_TYPES, VALID_CONTINUITY_VALUES
    assert CONTRACT_TYPES==VALID_CONTRACT_TYPES
    assert CONTINUITY==VALID_CONTINUITY_VALUES
