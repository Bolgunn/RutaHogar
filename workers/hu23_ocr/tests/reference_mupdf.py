"""Development-only comparison against the pre-PDFium worker."""
from unittest.mock import patch
from .. import engine

class MuPdfDocument:
    def __init__(self, data, extension):
        import pymupdf
        self.m = pymupdf
        self.doc = pymupdf.open(stream=data, filetype=extension)
        self.page_count = self.doc.page_count
        self.needs_pass = self.doc.needs_pass

    def close(self):
        self.doc.close()

    def text(self, index):
        return self.doc[index].get_text('text', sort=True)

    def large_image(self, index):
        page = self.doc[index]
        return any(info['bbox'] and self.m.Rect(info['bbox']).get_area() > page.rect.get_area() / 4
                   for info in page.get_image_info())

    def size(self, index):
        rect = self.doc[index].rect
        return rect.width, rect.height

    def render(self, index, angle):
        page = self.doc[index]
        if angle == 0:
            pix = page.get_pixmap(dpi=200, colorspace=self.m.csGRAY, alpha=False)
        else:
            pix = page.get_pixmap(matrix=self.m.Matrix(200/72, 200/72).prerotate(angle),
                                  colorspace=self.m.csGRAY, alpha=False)
        try:
            return pix.tobytes('png')
        finally:
            del pix


def reference_extract(data, extension, document_type, reference):
    with patch.object(engine, 'open_document', side_effect=lambda data, extension: MuPdfDocument(data, extension)):
        return engine.extract(data, extension, document_type, reference)
