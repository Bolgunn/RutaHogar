"""Owner-controlled consumption of OCR; only temporary allowlisted candidates reach DB."""
from datetime import datetime
import logging

from .azure import OcrError
from .contracts import DocumentError
from .ocr import OcrService
from .parsers import parse_document
from .service import DocumentService
from .upload import UploadService

logger = logging.getLogger(__name__)


class ParsingService:
    def __init__(self, repository, *, ocr=None):
        self.repository = repository
        self.documents = DocumentService(repository)
        self.ocr = ocr or OcrService(repository)

    def _control(self, user, process_id, action, token=None, delay=2):
        return self.repository.rpc('hu23_parse_control', {'p_user':user, 'p_process':process_id,
            'p_action':action, 'p_token':token, 'p_delay':delay})

    def _cleanup(self, user, process_id):
        bundle = self.repository.read(user,process_id)
        if bundle['process']['closed_at']:
            UploadService(self.repository,self.ocr.storage).try_cleanup(user,process_id)
        self.ocr.try_cleanup(user,process_id)

    def consume(self, user, process_id):
        if self.ocr._provider(user, process_id) == 'local':
            from .local_ocr import LocalOcrService
            LocalOcrService(self.repository, self.ocr.storage).start(user, process_id)
            return self.documents.read(user, process_id)
        claimed = self._control(user,process_id,'claim')
        process, job = claimed['process'], claimed.get('job')
        if not claimed['claimed']:
            if process['closed_at'] or process['state']=='awaiting_review':
                self._cleanup(user,process_id)
            return self.documents.read(user,process_id)
        token = job['lease_token']
        try:
            recognition = self.ocr.read_layout(user,process_id)
            # Stable replay reference, never the moving wall clock. Explicit issue date takes precedence.
            reference = datetime.fromisoformat(process['created_at'].replace('Z','+00:00')).date()
            result = parse_document(process['document_type'],recognition.analyzeResult,reference)
            del recognition
            self.documents.record_result(user,process_id,process['revision'],result,parse_token=token)
        except OcrError as error:
            logger.warning('hu23_ocr stage=parse reason=%s status=%s provider=%s outcome=%s process=%s',
                           error.reason, error.status, error.provider_code, error.code, process_id)
            self._control(user,process_id,'retry' if error.code=='transient' else 'fail',token,error.retry_after)
        except DocumentError as error:
            code = str(error)
            if code not in {'invalid_result','lineage_conflict','stale_review','already_closed','invalid_transition','expired'}:
                # An uncertain DB acknowledgement must not be turned into a destructive failure.
                raise
            try:
                self._control(user,process_id,'fail' if code in {'invalid_result','lineage_conflict'} else 'release',token)
            except DocumentError as conflict:
                if str(conflict)!='stale_review':
                    raise
        self._cleanup(user,process_id)
        return self.documents.read(user,process_id)
