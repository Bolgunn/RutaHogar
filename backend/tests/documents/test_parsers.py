"""Synthetic financial OCR only; no provider, DB or personal data."""
from datetime import date
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.documents.contracts import Candidate, DocumentError
from app.documents.domain import compare, backing_state
from app.documents.normalization import clp, continuity, document_date
from app.documents.parsers import RawResult, parse_document

REFERENCE=date(2026,10,25)
FIXTURES=Path(__file__).parent/'fixtures'


def fixture(name):
    return json.loads((FIXTURES/(name+'.json')).read_text())


def layout(*lines):
    return {'content':'\n'.join(lines),'pages':[{'pageNumber':1,'lines':[{'content':line} for line in lines]}]}


def extract(kind,*lines):
    return parse_document(kind,layout(*lines),REFERENCE).candidates


@pytest.mark.parametrize('name,kind,expected',[
    ('payslip','liquidacion_sueldo',{'ingreso_mensual':1200000}),
    ('savings','certificado_ahorro',{'ahorro_disponible':4000000}),
    ('employment','documento_laboral',{'tipo_contrato':'indefinido','continuidad_laboral':'entre_1_y_3_anios'}),
])
def test_synthetic_fixtures_extract_only_allowlisted_fields(name,kind,expected):
    result=parse_document(kind,fixture(name),REFERENCE)
    assert {c.field:c.value for c in result.candidates}==expected
    assert all(c.detection=='detected' for c in result.candidates)
    serialized=result.model_dump_json()
    for forbidden in ('PERSONA_','DIRECCION_','CUENTA_','Total haberes','Renta imponible','Fecha de ingreso'):
        assert forbidden not in serialized


@pytest.mark.parametrize('value,expected',[
    ('$1.234.567',1234567),('CLP $ 1.234.567,00',1234567),('1234567',1234567),
    ('1 234 567 pesos chilenos',1234567),('$ 1.234.567.-',1234567),
    ('$ 1 . 234 . 567',1234567),('1234,50',1234.5),('0',0),('1.234,56 CLP',1234.56),
])
def test_clp_formats_preserve_exact_value(value,expected):
    assert clp(value)==expected


@pytest.mark.parametrize('value',[
    '$1,234,567','USD 1200','UF 40','1.23','1,234','-1000','(1000)','1e6',
    '$1.000 $2.000','1.OOO.000','9007199254740992','9007199254740990,99',
])
def test_ambiguous_clp_is_never_salvaged_or_rounded(value):
    with pytest.raises(ValueError):clp(value)
    candidate=extract('liquidacion_sueldo','Líquido a pagar: '+value)[0]
    assert candidate.detection=='ambiguous' and candidate.value is None


@pytest.mark.parametrize('label',['Total haberes','Sueldo base','Renta imponible','Renta bruta'])
def test_gross_taxable_or_base_income_cannot_substitute_for_net(label):
    row=extract('liquidacion_sueldo',label+': $1.200.000')[0]
    assert row.detection=='not_detected' and row.value is None


def test_reasonable_noise_and_safe_currency_line_adjacency():
    assert extract('liquidacion_sueldo','  RÉNTA   LÍQUIDA  MENSUAL :  $ 1 200 000  ')[0].value==1200000
    assert extract('liquidacion_sueldo','Líquido a pagar:','CLP 1.200.000')[0].value==1200000
    assert extract('liquidacion_sueldo','Líquido a pagar:','991234567')[0].detection=='ambiguous'


@pytest.mark.parametrize('kind,lines',[
    ('liquidacion_sueldo',['Líquido a pagar: $1.000.000','Renta líquida: $2.000.000']),
    ('liquidacion_sueldo',['Líquido a pagar: $1.000.000','Líquido a pagar: $1.000.000']),
    ('liquidacion_sueldo',['Periodo: septiembre 2026','Periodo: octubre 2026','Líquido a pagar: $1.000.000']),
    ('liquidacion_sueldo',['Moneda: USD','Líquido a pagar: $1.000.000']),
    ('liquidacion_sueldo',['Liquidación quincenal','Líquido a pagar: $1.000.000']),
    ('certificado_ahorro',['Saldo disponible: $1000','Saldo disponible: $2000']),
    ('certificado_ahorro',['Cuenta N°: A','Cuenta N°: B','Saldo disponible: $1000']),
])
def test_multiple_candidates_periods_accounts_or_wrong_currency_are_unresolved(kind,lines):
    row=extract(kind,*lines)[0]
    assert row.detection=='ambiguous' and row.value is None


@pytest.mark.parametrize('kind,field',[
    ('liquidacion_sueldo','ingreso_mensual'),('certificado_ahorro','ahorro_disponible'),
])
def test_missing_or_wrong_document_fields_are_not_detected(kind,field):
    row=extract(kind,'Nombre: PERSONA_SINTETICA','RUT: RUT_SINTETICO','Deuda mensual: $50.000')[0]
    assert row.field==field and row.detection=='not_detected'


@pytest.mark.parametrize('line,expected',[
    ('Tipo de contrato: Indefinido','indefinido'),
    ('Contrato de trabajo de duración indefinida','indefinido'),
    ('Contrato de trabajo a plazo fijo','plazo_fijo'),
    ('Tipo de contrato: independiente','independiente'),
    ('Contrato de prestación de servicios a honorarios','honorarios_variable'),
    ('Tipo de contrato: honorarios / variable','honorarios_variable'),
])
def test_employment_equivalences_use_existing_enums(line,expected):
    assert extract('documento_laboral',line)[0].value==expected


@pytest.mark.parametrize('lines',[
    ['Tipo de contrato: indefinido','Tipo de contrato: plazo fijo'],
    ['Tipo de contrato: no es indefinido'],
    ['Tipo de contrato: podría convertirse en indefinido'],
])
def test_negative_hypothetical_or_conflicting_contracts_are_not_chosen(lines):
    assert extract('documento_laboral',*lines)[0].detection=='ambiguous'


@pytest.mark.parametrize('reference,expected',[
    (date(2026,6,30),'menos_6_meses'),(date(2026,7,1),'entre_6_y_12_meses'),
    (date(2026,12,31),'entre_6_y_12_meses'),(date(2027,1,1),'entre_1_y_3_anios'),
    (date(2029,1,1),'entre_1_y_3_anios'),(date(2029,1,2),'mas_3_anios'),
])
def test_calendar_continuity_boundaries(reference,expected):
    assert continuity(date(2026,1,1),reference)==expected


def test_leap_day_and_end_of_month_are_calendar_based():
    assert continuity(date(2024,2,29),date(2025,2,28))=='entre_1_y_3_anios'
    assert continuity(date(2026,8,31),date(2027,2,28))=='entre_6_y_12_meses'


@pytest.mark.parametrize('value',['25/10/2026','25-10-2026','2026-10-25','25 de octubre de 2026'])
def test_controlled_date_formats(value):
    assert document_date(value)==REFERENCE


def test_issue_date_is_conservative_reference_not_current_clock():
    row=extract('documento_laboral','Fecha de ingreso: 01/01/2024','Fecha de emisión: 01/06/2024')[1]
    assert row.value=='menos_6_meses'


@pytest.mark.parametrize('lines',[
    ['Fecha de ingreso: 31/02/2024'],
    ['Fecha de ingreso: 01/01/2027'],
    ['Fecha de ingreso: 01/01/2024','Fecha de ingreso: 01/01/2025'],
    ['Fecha de ingreso: 01/01/2024','Fecha de emisión: 01/01/2027'],
    ['Fecha de ingreso: 01/01/2024','Fecha de término: 01/01/2025'],
    ['Fecha de ingreso: 01/01/2024','Continuidad laboral: menos de 6 meses'],
])
def test_uncertain_future_expired_or_conflicting_dates_are_ambiguous(lines):
    row=extract('documento_laboral',*lines)[1]
    assert row.detection=='ambiguous' and row.value is None


def test_parser_cannot_output_another_document_field():
    with pytest.raises(ValidationError):
        RawResult(document_type='liquidacion_sueldo',candidates=[
            {'field':'ahorro_disponible','value':'$1000','detection':'detected','page':1}])
    with pytest.raises(ValidationError):
        RawResult(document_type='documento_laboral',candidates=[
            {'field':'rut','value':'RUT_SINTETICO','detection':'detected','page':1}])


def test_comparison_is_exact_and_has_no_backing_before_decision():
    detected=extract('liquidacion_sueldo','Líquido a pagar: CLP 1.200.000,50')[0]
    assert compare(1200000.50,detected)=='match'
    assert compare(1200000.49,detected)=='difference'
    assert backing_state(compare(1200000.50,detected),'undecided')=='sin_respaldo'
    assert compare('indefinido',extract('documento_laboral','Tipo de contrato: indefinido')[0])=='match'
    assert compare('plazo_fijo',extract('documento_laboral','Tipo de contrato: indefinido')[0])=='difference'


def test_page_provenance_and_content_only_single_page():
    source={'content':'\n','pages':[{'pageNumber':1,'lines':[]},
        {'pageNumber':2,'lines':[{'content':'Líquido a pagar: $1200000'}]}]}
    # Two-page fallback requires unambiguous indexed spans, never guessed page assignment.
    with pytest.raises(DocumentError,match='^invalid_result$'):
        parse_document('liquidacion_sueldo',source,REFERENCE)
    source['pages'][0]['lines']=[{'content':'Encabezado'}]
    assert parse_document('liquidacion_sueldo',source,REFERENCE).candidates[0].page==2
    assert parse_document('liquidacion_sueldo',{'content':'Líquido a pagar: $1200000','pages':[{'pageNumber':1}]},REFERENCE).candidates[0].value==1200000


def test_malformed_layout_errors_do_not_expose_input():
    with pytest.raises(DocumentError,match='^invalid_result$'):
        parse_document('liquidacion_sueldo',{'content':'NO_LOG_SENSITIVE','pages':[{'pageNumber':99}]},REFERENCE)


@pytest.mark.parametrize('period',[
    'Periodo: septiembre y octubre 2026',
    'Periodo de pago: 01/09/2026 al 31/10/2026',
    'Mes: remuneraciones de 2 meses',
])
def test_multi_month_net_pay_is_not_assumed_to_be_one_month(period):
    row=extract('liquidacion_sueldo',period,'Líquido a pagar: $2000000')[0]
    assert row.detection=='ambiguous' and row.value is None
