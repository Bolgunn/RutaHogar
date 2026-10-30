from datetime import date
import json
import shutil
from unittest.mock import patch
from uuid import uuid4

import pytest

from workers.hu23_ocr.engine import extract, source_url, WorkerError
from workers.hu23_ocr.synthetic import fixtures


def fixture(name):
    return next((ext, data, kind) for label, kind, ext, data in fixtures() if label == name)


@pytest.mark.parametrize('name,expected', [('payslip_embedded', 1200000), ('savings_embedded', 4000000)])
def test_embedded_text_reuses_parser_without_tesseract(name, expected):
    ext, data, kind = fixture(name)
    with patch('workers.hu23_ocr.engine.tesseract', side_effect=AssertionError('unnecessary OCR')):
        result = extract(data, ext, kind, '2026-10-25')
    assert result['method'] == 'embedded_text'
    assert result['result']['candidates'][0]['value'] == expected
    assert not any(secret in json.dumps(result) for secret in ['PERSONA_', 'DIRECCION_', 'content', 'pages'])


@pytest.mark.parametrize('name,detection', [('missing_embedded', 'not_detected'), ('ambiguous_embedded', 'ambiguous')])
def test_missing_and_ambiguous_semantics(name, detection):
    ext, data, kind = fixture(name)
    result = extract(data, ext, kind, '2026-10-25')
    assert result['result']['candidates'][0]['detection'] == detection
    assert result['ocr_attempts'] == 0


def test_employment_uses_existing_calendar_normalization():
    ext, data, kind = fixture('employment_embedded')
    result = extract(data, ext, kind, '2026-10-25')
    assert {c['field']: c['value'] for c in result['result']['candidates']} == {
        'tipo_contrato': 'indefinido', 'continuidad_laboral': 'entre_1_y_3_anios'}


@pytest.mark.skipif(not shutil.which('tesseract'), reason='requires system Tesseract 5 + spa')
@pytest.mark.parametrize('name', ['payslip_scan', 'payslip_png', 'payslip_jpeg'])
def test_real_tesseract_spanish_synthetic_income(name):
    ext, data, kind = fixture(name)
    result = extract(data, ext, kind, '2026-10-25')
    assert result['method'] == 'tesseract'
    assert result['result']['candidates'][0]['value'] == 1200000


@pytest.mark.parametrize('change', [lambda url: url.replace('127.0.0.1', 'evil.invalid'),
    lambda url: url.replace('/object/sign/', '/object/public/'), lambda url: url + '&other=secret',
    lambda url: url.replace('.pdf', '.exe'), lambda url: url.replace('/storage/v1/', '/%2e%2e/')])
def test_worker_rejects_ssrf_and_non_hu23_paths(change):
    url = f'http://127.0.0.1:54321/storage/v1/object/sign/hu23-document-temporary/{uuid4()}/{uuid4()}/{uuid4()}.pdf?token=synthetic'
    assert source_url(url, 'http://127.0.0.1:54321')[1] == 'pdf'
    with pytest.raises(WorkerError, match='invalid_source'):
        source_url(change(url), 'http://127.0.0.1:54321')


def test_reject_limits_magic_encryption_and_page_count():
    import pymupdf
    with pytest.raises(WorkerError): extract(b'x' * 4_000_001, 'pdf', 'liquidacion_sueldo', '2026-10-25')
    with pytest.raises(WorkerError): extract(b'not a pdf', 'pdf', 'liquidacion_sueldo', '2026-10-25')
    with pymupdf.open() as doc:
        for _ in range(3): doc.new_page()
        with pytest.raises(WorkerError): extract(doc.tobytes(), 'pdf', 'liquidacion_sueldo', '2026-10-25')
    with pymupdf.open() as doc:
        doc.new_page()
        data = doc.tobytes(encryption=pymupdf.PDF_ENCRYPT_AES_256, user_pw='synthetic-only')
        with pytest.raises(WorkerError): extract(data, 'pdf', 'liquidacion_sueldo', '2026-10-25')


def test_tesseract_failure_is_redacted_and_no_files_written(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    ext, data, kind = fixture('payslip_scan')
    with patch('workers.hu23_ocr.engine.tesseract', side_effect=WorkerError('tesseract_failed')):
        with pytest.raises(WorkerError, match='tesseract_failed'):
            extract(data, ext, kind, '2026-10-25')
    assert list(tmp_path.iterdir()) == []


def test_ocr_stops_after_first_valid_orientation():
    ext, data, kind = fixture('payslip_scan')
    with patch('workers.hu23_ocr.engine.tesseract', side_effect=['Texto sin campo', 'Liquido a pagar: $1.200.000']) as ocr:
        result = extract(data, ext, kind, '2026-10-25')
    assert result['result']['candidates'][0]['value'] == 1200000
    assert result['rotation'] == 90 and result['ocr_attempts'] == 2 and ocr.call_count == 2


def test_success_and_ambiguity_never_trigger_rotation():
    ext, data, kind = fixture('payslip_scan')
    for content, detection in [('Liquido a pagar: $1.200.000', 'detected'),
                               ('Liquido a pagar: $1.200.000\nLiquido a pagar: $1.100.000', 'ambiguous')]:
        with patch('workers.hu23_ocr.engine.tesseract', return_value=content) as ocr:
            result = extract(data, ext, kind, '2026-10-25')
        assert result['result']['candidates'][0]['detection'] == detection
        assert result['rotation'] == 0 and result['ocr_attempts'] == 1 and ocr.call_count == 1


def test_ambiguous_rotated_attempt_is_not_replaced_by_a_later_guess():
    ext, data, kind = fixture('payslip_scan')
    outputs = ['Texto sin campo', 'Liquido a pagar: $1.200.000\nLiquido a pagar: $1.100.000',
               'Liquido a pagar: $1.200.000']
    with patch('workers.hu23_ocr.engine.tesseract', side_effect=outputs) as ocr:
        result = extract(data, ext, kind, '2026-10-25')
    assert result['result']['candidates'][0]['detection'] == 'ambiguous'
    assert result['result']['candidates'][0]['value'] is None
    assert ocr.call_count == 2 and result['rotation'] == 90


def test_missing_field_exhausts_rotations_without_inventing_value():
    ext, data, kind = fixture('payslip_scan')
    with patch('workers.hu23_ocr.engine.tesseract', return_value='sin datos') as ocr:
        result = extract(data, ext, kind, '2026-10-25')
    assert result['result']['candidates'][0]['detection'] == 'not_detected'
    assert ocr.call_count == 4 and result['ocr_attempts'] == 4


@pytest.mark.skipif(not shutil.which('tesseract'), reason='requires system Tesseract 5 + spa')
@pytest.mark.parametrize('name', ['payslip_rotated_scan', 'payslip_rotated_180', 'payslip_rotated_270'])
def test_real_rotated_scan(name):
    ext, data, kind = next((ext, data, kind) for label, kind, ext, data in fixtures(extended=True) if label == name)
    result = extract(data, ext, kind, '2026-10-25')
    assert result['result']['candidates'][0]['value'] == 1200000
    assert result['rotation'] in (90, 180, 270) and result['ocr_attempts'] in (2, 3, 4)


def test_rotation_cannot_change_an_already_detected_value():
    ext, data, _ = fixture('payslip_scan')
    values = ['Tipo de contrato: Indefinido',
              'Tipo de contrato: Plazo fijo\nFecha de ingreso: 01/10/2024\nFecha de emision: 25 de octubre de 2026',
              'Tipo de contrato: Indefinido\nFecha de ingreso: 01/10/2024\nFecha de emision: 25 de octubre de 2026']
    with patch('workers.hu23_ocr.engine.tesseract', side_effect=values) as ocr:
        result = extract(data, ext, 'documento_laboral', '2026-10-25')
    assert {row['field']: row['value'] for row in result['result']['candidates']} == {
        'tipo_contrato': 'indefinido', 'continuidad_laboral': 'entre_1_y_3_anios'}
    assert ocr.call_count == 3 and result['rotation'] == 180


@pytest.mark.skipif(not shutil.which('tesseract'), reason='requires system Tesseract 5 + spa')
def test_two_scanned_pages_keep_second_page_provenance():
    ext, data, kind = next((ext, data, kind) for label, kind, ext, data in fixtures(extended=True)
                           if label == 'payslip_two_pages')
    assert len(data) <= 4_000_000
    result = extract(data, ext, kind, '2026-10-25')
    row = result['result']['candidates'][0]
    assert row['value'] == 1200000 and row['page'] == 2
    assert result['rotation'] == 0 and result['ocr_attempts'] == 2


@pytest.mark.skipif(not shutil.which('tesseract'), reason='requires system Tesseract 5 + spa')
@pytest.mark.parametrize('name', ['payslip_low_resolution', 'payslip_poor_contrast', 'payslip_moderate_noise'])
def test_synthetic_image_degradation(name):
    ext, data, kind = next((ext, data, kind) for label, kind, ext, data in fixtures(extended=True) if label == name)
    result = extract(data, ext, kind, '2026-10-25')
    assert result['result']['candidates'][0]['value'] == 1200000


@pytest.mark.skipif(not shutil.which('tesseract'), reason='requires system Tesseract 5 + spa')
@pytest.mark.parametrize('name,detection,attempts', [('missing_scan', 'not_detected', 4),
                                                       ('ambiguous_scan', 'ambiguous', 1)])
def test_real_scan_does_not_guess_missing_or_ambiguous_income(name, detection, attempts):
    ext, data, kind = fixture(name)
    result = extract(data, ext, kind, '2026-10-25')
    assert result['result']['candidates'][0]['detection'] == detection
    assert result['result']['candidates'][0]['value'] is None
    assert result['ocr_attempts'] == attempts


@pytest.mark.skipif(not shutil.which('tesseract'), reason='requires system Tesseract 5 + spa')
def test_two_pages_with_blank_first_page_retain_provenance():
    import pymupdf
    ext, pdf, kind = fixture('payslip_embedded')
    with pymupdf.open() as document, pymupdf.open(stream=pdf, filetype='pdf') as source:
        document.new_page()
        document.insert_pdf(source)
        data = document.tobytes(deflate=True)
    result = extract(data, ext, kind, '2026-10-25')
    assert result['result']['candidates'][0]['value'] == 1200000
    assert result['result']['candidates'][0]['page'] == 2


@pytest.mark.skipif(not shutil.which('tesseract'), reason='requires system Tesseract 5 + spa')
@pytest.mark.parametrize('angle', [90, 180, 270])
def test_real_sideways_scan_pixels_on_unrotated_pdf(angle):
    import pymupdf
    ext, data, kind = next((ext, data, kind) for label, kind, ext, data in fixtures(extended=True)
                           if label == f'payslip_pixels_{angle}')
    with pymupdf.open(stream=data, filetype=ext) as document:
        assert document[0].rotation == 0
    result = extract(data, ext, kind, '2026-10-25')
    assert result['result']['candidates'][0]['value'] == 1200000
    assert result['rotation'] in (90, 180, 270) and result['ocr_attempts'] in (2, 3, 4)


@pytest.mark.skipif(not shutil.which('tesseract'), reason='requires system Tesseract 5 + spa')
def test_different_page_orientations_never_invent_employment_fields():
    ext, data, kind = next((ext, data, kind) for label, kind, ext, data in fixtures(extended=True)
                           if label == 'employment_mixed_orientation')
    result = extract(data, ext, kind, '2026-10-25')
    rows = {item['field']: item for item in result['result']['candidates']}
    assert rows['tipo_contrato']['value'] == 'indefinido'
    assert rows['tipo_contrato']['page'] == 1
    assert rows['continuidad_laboral']['value'] == 'entre_1_y_3_anios'
    assert rows['continuidad_laboral']['page'] == 2
    assert result['rotation'] == 270 and result['ocr_attempts'] == 5


def test_subject_identity_is_extracted_only_for_internal_result():
    ext, data, kind = fixture('payslip_scan')
    source = ('RUT trabajador: 12.345.678-5\nNombre trabajador: Juan Perez\n'
              'RUT empleador: 17.493.908-k\nLiquido a pagar: $1.450.000')
    with patch('workers.hu23_ocr.engine.tesseract', return_value=source):
        result = extract(data, ext, kind, '2026-10-25')['result']
    assert result['identity']['rut'] == '123456785'
    assert result['identity']['name'] == 'juan perez'
    assert result['candidates'][0]['value'] == 1450000
    assert 'empleador' not in json.dumps(result)
