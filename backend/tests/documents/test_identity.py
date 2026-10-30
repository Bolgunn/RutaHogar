from datetime import date
from types import SimpleNamespace

import pytest

from app.documents.contracts import DocumentError
from app.documents.identity import compare_identity, normalize_rut
from app.documents.parsers import parse_document
from app.documents.service import DocumentService

PROFILE = {'rut': '12.345.678-5', 'nombre': 'Juan Carlos', 'apellido_paterno': 'Perez', 'apellido_materno': None}

@pytest.mark.parametrize('value,expected', [
    ('12345678-5', '123456785'), ('12.345.678 - 5', '123456785'),
    ('17.493.908-k', '17493908K'), ('17.493.908-K', '17493908K'),
    ('12.345.678-4', None), ('rut 12.345.678-5', None),
    ('1.111.111-4', '11111114'), ('2.222.222-8', '22222228'), ('1.111.111-5', None),
])
def test_rut_normalization(value, expected):
    assert normalize_rut(value) == expected

@pytest.mark.parametrize('evidence,expected', [
    ({'rut':'12345678-5'}, 'consistent'),
    ({'rut':'17.493.908-k'}, 'inconsistent'),
    ({'name':'Juan Carlos Perez'}, 'consistent'),
    ({'name':'JUAN CARLOS P\u00c9REZ'}, 'consistent'),
    ({'name':'Juan Perez'}, 'consistent'),
    ({'name':'Juan Pereza'}, 'consistent'),
    ({'name':'Maria Gonzalez'}, 'inconsistent'),
    ({'rut':'12345678-5', 'name':'Juan Perez'}, 'consistent'),
    ({'rut':'17493908-k', 'name':'Juan Perez'}, 'inconsistent'),
    ({}, 'indeterminate'), ({'rut':'invalid', 'name':'Juan'}, 'indeterminate'),
])
def test_identity_comparison(evidence, expected):
    assert compare_identity(PROFILE, evidence) == expected


def layout(*lines):
    return {'content':'', 'pages':[{'pageNumber':1, 'lines':[{'content':line} for line in lines]}]}


def test_only_subject_identity_is_extracted():
    result = parse_document('liquidacion_sueldo', layout('RUT empleador: 17.493.908-k',
        'Nombre trabajador: Juan Perez', 'RUT trabajador: 12.345.678-5', 'Liquido a pagar: $1.450.000'), date(2026,10,25))
    assert result.identity.rut == '123456785'
    assert result.identity.name == 'juan perez'
    assert result.candidates[0].value == 1450000
    assert compare_identity(PROFILE, result.identity.model_dump(exclude_none=True)) == 'consistent'


@pytest.mark.parametrize('worker_first', [False, True])
@pytest.mark.parametrize('name,rut,expected', [
    ('Camila Fernanda Prueba Usuario', '1.111.111-4', 'consistent'),
    ('Diego Andres Ejemplo Demo', '2.222.222-8', 'inconsistent'),
])
def test_identity_from_merged_employer_and_worker_columns(worker_first,name,rut,expected):
    name_fields=['Razon social: Empresa Demo RutaHogar SpA',f'Nombre trabajador: {name}']
    rut_fields=['RUT empleador: 76.000.000-0',f'RUT trabajador: {rut}']
    if worker_first:
        name_fields.reverse(); rut_fields.reverse()
    result=parse_document('liquidacion_sueldo',layout(' '.join(name_fields),' '.join(rut_fields),
        'RENTA LIQUIDA MENSUAL $1.450.000','Monto liquido a pagar: $1.450.000 CLP'),date(2026,10,29))
    assert result.identity.rut==normalize_rut(rut)
    assert result.identity.name==name.lower()
    assert result.candidates[0].value==1450000
    profile={'rut':'1.111.111-4','full_name':'Camila Fernanda Prueba Usuario'}
    assert compare_identity(profile,result.identity.model_dump(exclude_none=True))==expected


def test_merged_columns_do_not_use_employer_or_invalid_subject_rut():
    result=parse_document('liquidacion_sueldo',layout(
        'RUT empleador: 76.000.000-0 RUT trabajador: 1.111.111-5',
        'Nombre empresa: Empresa Demo RutaHogar SpA','Liquido a pagar: $1.450.000'),date(2026,10,29))
    assert result.identity is None


def test_conflicting_subject_values_on_one_line_remain_ambiguous():
    result=parse_document('liquidacion_sueldo',layout(
        'RUT empleador: 76.000.000-0 RUT trabajador: 1.111.111-4 RUT trabajador: 2.222.222-8',
        'Liquido a pagar: $1.450.000'),date(2026,10,29))
    assert result.identity is None


def test_ambiguous_identity_is_not_contradiction():
    result = parse_document('liquidacion_sueldo', layout('RUT trabajador: 12.345.678-5',
        'RUT trabajador: 17.493.908-k', 'Liquido a pagar: $1.450.000'), date(2026,10,25))
    assert result.identity is None


def test_service_rejects_before_financial_processing():
    result = parse_document('liquidacion_sueldo', layout('RUT trabajador: 17.493.908-k',
        'Liquido a pagar: $1.450.000'), date(2026,10,25))
    calls=[]
    repo=SimpleNamespace(read=lambda *_:{'process':{'document_type':'liquidacion_sueldo'}},
        load_identity=lambda *_:PROFILE,
        reject_identity=lambda *args: calls.append(args) or {'process':{'state':'processing_failed'}},
        load_tracking=lambda *_:pytest.fail('financial state must not be read for rejection'))
    out=DocumentService(repo).record_result('user','process',4,result,parse_token='lease')
    assert out['process']['state']=='processing_failed'
    assert calls==[('user','process',4,'lease')]


def test_public_ocr_rejection_never_discloses_identity():
    from app.documents.ocr import OcrService
    from app.documents.service import public_view
    process={'id':'p','state':'processing_failed','revision':4,'failure_code':'identity_inconsistent'}
    ocr=OcrService._view({'process':process,'job':None})
    view=public_view({'process':process,'candidates':[],'evidence':[]})
    assert ocr['message']=='Datos inconsistentes'
    assert view['failure_code']=='identity_inconsistent'
    assert 'rut' not in str(ocr).lower() and 'nombre' not in str(ocr).lower()
    assert 'rut' not in str(view).lower() and 'nombre' not in str(view).lower()


def test_financial_difference_never_drives_identity_comparison():
    profile={**PROFILE, 'ingreso_mensual':1200000, 'ahorro_disponible':0}
    document={'rut':'12345678-5','name':'Juan Perez','ingreso_mensual':1450000}
    assert compare_identity(profile,document)=='consistent'
