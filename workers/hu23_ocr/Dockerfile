FROM python:3.12-slim-bookworm@sha256:6dd8b6dab6b3adc7812bab69eca5dbdc1a5cc690ad28306d234ffb4ef8ac9753
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/opt/rutahogar/backend:/opt/rutahogar
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-spa && rm -rf /var/lib/apt/lists/* && groupadd --system worker && useradd --system --gid worker --home-dir /nonexistent --no-create-home worker
WORKDIR /opt/rutahogar
COPY workers/hu23_ocr/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt && rm /tmp/requirements.txt
COPY workers/hu23_ocr/__init__.py workers/hu23_ocr/engine.py workers/hu23_ocr/pdf_ops.py workers/hu23_ocr/server.py workers/hu23_ocr/task.py workers/hu23_ocr/
COPY backend/app/__init__.py backend/app/__init__.py
COPY backend/app/documents/__init__.py backend/app/documents/config.py backend/app/documents/contracts.py backend/app/documents/identity.py backend/app/documents/normalization.py backend/app/documents/parsers.py backend/app/documents/
USER worker:worker
EXPOSE 8011
CMD ["python", "-m", "workers.hu23_ocr.server"]
