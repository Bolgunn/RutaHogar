"""Parity on the same in-memory JPEG/PNG bytes, including rotations and alpha."""
import io
import shutil
from PIL import Image
import pytest

from workers.hu23_ocr.engine import extract
from workers.hu23_ocr.synthetic import fixtures
from workers.hu23_ocr.tests.reference_mupdf import reference_extract


@pytest.mark.skipif(not shutil.which('tesseract'), reason='requires Tesseract 5 + spa')
@pytest.mark.parametrize('extension', ['png', 'jpeg'])
@pytest.mark.parametrize('angle', [0, 90, 180, 270])
def test_image_candidates_and_rotation_match_existing_engine(extension, angle):
    _, kind, _, image_bytes = next(row for row in fixtures() if row[0] == 'payslip_' + extension)
    with Image.open(io.BytesIO(image_bytes)) as image:
        rotated = image.rotate(angle, expand=True)
        with io.BytesIO() as output:
            rotated.save(output, format='PNG' if extension == 'png' else 'JPEG', dpi=(200, 200))
            data = output.getvalue()
        rotated.close()
    original = reference_extract(data, extension, kind, '2026-10-25')
    proposed = extract(data, extension, kind, '2026-10-25')
    assert proposed['result'] == original['result']
    assert proposed['rotation'] == original['rotation']
    assert proposed['ocr_attempts'] == original['ocr_attempts']


@pytest.mark.skipif(not shutil.which('tesseract'), reason='requires Tesseract 5 + spa')
def test_transparent_png_on_white_background():
    _, kind, _, image_bytes = next(row for row in fixtures() if row[0] == 'payslip_png')
    with Image.open(io.BytesIO(image_bytes)) as source:
        gray = source.convert('L')
        alpha = gray.point(lambda p: 255-p)
        image = Image.new('RGBA', gray.size, (0, 0, 0, 0))
        image.putalpha(alpha)
        with io.BytesIO() as output:
            image.save(output, format='PNG', dpi=(200, 200))
            data = output.getvalue()
        gray.close(); alpha.close(); image.close()
    original = reference_extract(data, 'png', kind, '2026-10-25')
    proposed = extract(data, 'png', kind, '2026-10-25')
    assert proposed['result'] == original['result']
    assert proposed['result']['candidates'][0]['value'] == 1200000


@pytest.mark.skipif(not shutil.which('tesseract'), reason='requires Tesseract 5 + spa')
def test_jpeg_exif_orientation_does_not_change_semantics():
    _, kind, _, image_bytes = next(row for row in fixtures() if row[0] == 'payslip_jpeg')
    with Image.open(io.BytesIO(image_bytes)) as image:
        exif = image.getexif()
        exif[274] = 6
        with io.BytesIO() as output:
            image.save(output, format='JPEG', dpi=(200, 200), exif=exif)
            data = output.getvalue()
    original = reference_extract(data, 'jpeg', kind, '2026-10-25')
    proposed = extract(data, 'jpeg', kind, '2026-10-25')
    assert proposed['result'] == original['result']
    assert proposed['rotation'] == original['rotation']


@pytest.mark.skipif(not shutil.which('tesseract'), reason='requires Tesseract 5 + spa')
@pytest.mark.parametrize('extension', ['png', 'jpeg'])
def test_image_without_dpi_uses_same_limits_and_candidates(extension):
    _, kind, _, image_bytes = next(row for row in fixtures() if row[0] == 'payslip_' + extension)
    with Image.open(io.BytesIO(image_bytes)) as image:
        resized = image.resize((826, 1169))
        with io.BytesIO() as output:
            resized.save(output, format='PNG' if extension == 'png' else 'JPEG')
            data = output.getvalue()
        resized.close()
    original = reference_extract(data, extension, kind, '2026-10-25')
    proposed = extract(data, extension, kind, '2026-10-25')
    assert proposed['result'] == original['result']
    assert proposed['result']['candidates'][0]['value'] == 1200000
