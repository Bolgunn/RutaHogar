"""The synthetic HU23 PDF layout merges employer and worker columns."""
import json
import os
import subprocess

import pymupdf
import pytest

from app.documents.identity import compare_identity
from workers.hu23_ocr.engine import extract


def identity_pdf(name, rut):
    with pymupdf.open() as document:
        page=document.new_page()
        page.insert_text((40,50), '\n'.join([
            'LIQUIDACION DE SUELDO - DOCUMENTO SINTETICO SIN VALIDEZ',
            f'Razon social: Empresa Demo RutaHogar SpA Nombre trabajador: {name}',
            f'RUT empleador: 76.000.000-0 RUT trabajador: {rut}',
            'RENTA LIQUIDA MENSUAL $1.450.000',
            'Monto liquido a pagar: $1.450.000 CLP',
        ]),fontsize=12)
        return document.tobytes()


@pytest.mark.parametrize('name,rut,expected',[
    ('Camila Fernanda Prueba Usuario','1.111.111-4','consistent'),
    ('Diego Andres Ejemplo Demo','2.222.222-8','inconsistent'),
])
def test_pdfium_extracts_only_worker_identity_from_inline_columns(name,rut,expected):
    result=extract(identity_pdf(name,rut),'pdf','liquidacion_sueldo','2026-10-29')
    assert result['method']=='embedded_text'
    assert result['result']['identity']=={'rut':rut.replace('.','').replace('-',''),'name':name.lower()}
    assert result['result']['candidates'][0]['value']==1450000
    assert compare_identity({'rut':'1.111.111-4','full_name':'Camila Fernanda Prueba Usuario'},result['result']['identity'])==expected
    assert '76000000' not in json.dumps(result)


@pytest.mark.skipif(os.getenv('HU23_DOCKER_REAL_TEST')!='1',reason='opt-in built image smoke test')
def test_built_image_includes_identity_module_and_extracts_subject():
    # No mounted sources: this catches a missing COPY dependency even when
    # source-tree unit tests pass. No network or credentials are needed.
    image=os.getenv('HU23_TEST_DOCKER_IMAGE','rutahogar-hu23-ocr-local:dev')
    result=subprocess.run(['docker','run','--rm','--network','none','-i',image,
        'python','-c',"import sys,json; from workers.hu23_ocr.engine import extract; print(json.dumps(extract(sys.stdin.buffer.read(),'pdf','liquidacion_sueldo','2026-10-29')))"],
        input=identity_pdf('Camila Fernanda Prueba Usuario','1.111.111-4'),capture_output=True,timeout=30)
    assert result.returncode==0,result.stderr.decode()[-1000:]
    parsed=json.loads(result.stdout)
    assert parsed['result']['identity']=={'rut':'11111114','name':'camila fernanda prueba usuario'}
    assert parsed['result']['candidates'][0]['value']==1450000
