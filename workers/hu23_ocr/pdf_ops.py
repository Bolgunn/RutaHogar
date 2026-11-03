"""Memory-only PDF and image operations for the local OCR worker."""
import io


class PdfiumDocument:
    def __init__(self, data, extension):
        import pypdfium2 as pdfium
        self.doc = pdfium.PdfDocument(data)
        try:
            self.page_count = len(self.doc)
            self.needs_pass = False
        except Exception:
            self.doc.close()
            raise

    def close(self):
        self.doc.close()

    def text(self, index):
        page = self.doc[index]
        try:
            text = page.get_textpage()
            try:
                return text.get_text_range()
            finally:
                text.close()
        finally:
            page.close()

    def large_image(self, index):
        from pypdfium2 import raw
        page = self.doc[index]
        try:
            width, height = page.get_size()
            for obj in page.get_objects(filter=(raw.FPDF_PAGEOBJ_IMAGE,)):
                try:
                    left, bottom, right, top = obj.get_bounds()
                    if abs((right-left)*(top-bottom)) > width*height/4:
                        return True
                finally:
                    obj.close()
            return False
        finally:
            page.close()

    def size(self, index):
        page = self.doc[index]
        try:
            return page.get_size()
        finally:
            page.close()

    def render(self, index, angle):
        page = self.doc[index]
        try:
            bitmap = page.render(scale=200/72, rotation=angle, grayscale=True)
            try:
                data = bytes(bitmap.buffer)
                pixels = b''.join(data[i*bitmap.stride:i*bitmap.stride+bitmap.width]
                                  for i in range(bitmap.height))
                from PIL import Image
                image = Image.frombytes('L', (bitmap.width, bitmap.height), pixels)
                try:
                    with io.BytesIO() as output:
                        image.save(output, format='PNG', compress_level=1)
                        return output.getvalue()
                finally:
                    image.close()
            finally:
                bitmap.close()
        finally:
            page.close()


class ImageDocument:
    def __init__(self, data, extension):
        from PIL import Image
        self.image = Image.open(io.BytesIO(data))
        # The existing image admission handles a single image/page; use its first frame.
        self.page_count = 1
        self.needs_pass = False
        import math
        dpi = self.image.info.get('dpi', (96, 96))
        if not isinstance(dpi, (tuple, list)) or len(dpi) < 2:
            dpi = (96, 96)
        self.dpi = tuple(value if isinstance(value, (int, float)) and math.isfinite(value) and value > 0 else 96
                         for value in dpi[:2])

    def close(self):
        self.image.close()

    def text(self, index):
        return ''

    def large_image(self, index):
        return True

    def size(self, index):
        if self.image.getexif().get(274) in (5, 6, 7, 8):
            return self.image.height * 72 / self.dpi[1], self.image.width * 72 / self.dpi[0]
        return self.image.width * 72 / self.dpi[0], self.image.height * 72 / self.dpi[1]

    def render(self, index, angle):
        from PIL import Image, ImageOps
        oriented = ImageOps.exif_transpose(self.image)
        try:
            rgba = oriented.convert('RGBA')
        finally:
            oriented.close()
        try:
            white = Image.new('RGBA', rgba.size, 'white')
            try:
                white.alpha_composite(rgba)
                image = white.convert('L')
            finally:
                white.close()
        finally:
            rgba.close()
        try:
            width, height = self.size(index)
            new_size = (round(width * 200 / 72), round(height * 200 / 72))
            if new_size != image.size:
                resized = image.resize(new_size, Image.Resampling.BILINEAR)
                image.close()
                image = resized
            if angle:
                rotated = image.transpose({90: Image.Transpose.ROTATE_270, 180: Image.Transpose.ROTATE_180,
                                           270: Image.Transpose.ROTATE_90}[angle])
                image.close()
                image = rotated
            with io.BytesIO() as out:
                image.save(out, format='PNG')
                return out.getvalue()
        finally:
            image.close()


def open_document(data, extension):
    return PdfiumDocument(data, extension) if extension == 'pdf' else ImageDocument(data, extension)
