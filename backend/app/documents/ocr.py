"""Durable, request-driven OCR steps. No background tasks, sleep loops or raw OCR persistence."""
import logging
from .azure import AzureOcrClient, OcrError
from .contracts import DocumentError
from .storage import TemporaryStorage
from .upload import UploadService

logger = logging.getLogger(__name__)


class OcrService:
    def __init__(self, repository, *, azure=None, storage=None):
        self.repository = repository
        self.azure = azure
        self.storage = storage or TemporaryStorage(repository)

    def _client(self):
        if self.azure is None:
            try:
                self.azure = AzureOcrClient()
            except OcrError:
                raise DocumentError('ocr_unavailable') from None
        return self.azure

    def _step(self, user, process_id, action, token=None, payload=None):
        return self.repository.rpc('hu23_ocr_step', {'p_user': user, 'p_process': process_id,
            'p_action': action, 'p_token': token, 'p_payload': payload or {}})

    @staticmethod
    def _view(bundle):
        process, job = bundle['process'], bundle.get('job')
        return {'provider': job.get('provider', 'azure') if job else 'azure', 'process_id': process['id'], 'state': process['state'], 'revision': process['revision'],
                'status': job['job_state'] if job else None,
                'next_attempt_at': job['next_attempt_at'] if job else None,
                'result_deletion_state': job['deletion_state'] if job else None,
                'message': ('No pudimos procesar este documento. Puedes intentar con otro archivo.'
                            if process['state'] == 'processing_failed' else None)}

    def _provider(self, user, process_id, *, cleanup=False):
        from .local_ocr import configured_provider
        bundle = self._step(user, process_id, 'read')
        job = bundle.get('job')
        if cleanup and job:
            return job.get('provider', 'azure')
        selected = 'azure' if self.azure is not None else configured_provider()
        pinned = job.get('provider', 'azure') if job else selected
        if not cleanup and job and pinned != selected:
            raise DocumentError('ocr_provider_mismatch')
        return pinned

    def start(self, user, process_id, *, expected_provider=None):
        from .local_ocr import configured_provider
        selected = 'azure' if self.azure is not None else configured_provider()
        if expected_provider is not None and expected_provider != selected:
            raise DocumentError('ocr_provider_mismatch')
        if self._provider(user, process_id) == 'local':
            from .local_ocr import LocalOcrService
            return self._view(LocalOcrService(self.repository, self.storage).start(user, process_id))
        self._client()
        return self._execute(user, process_id, 'start')

    def poll(self, user, process_id):
        if self._provider(user, process_id) == 'local':
            return self._view(self._step(user, process_id, 'read'))
        self._client()
        return self._execute(user, process_id, 'poll')

    def _execute(self, user, process_id, action):
        bundle = self._step(user, process_id, action)
        operation = bundle.get('action')
        if operation:
            job, process = bundle['job'], bundle['process']
            try:
                if operation == 'submit':
                    path = process['storage_path']
                    if not path or not path.startswith(f'{user}/{process_id}/'):
                        raise DocumentError('storage_unavailable')
                    started = self._client().begin(self.storage.signed_read(path))
                    payload = {'outcome': 'started', 'result_id': str(started.result_id),
                               'retry_after': started.retry_after}
                elif operation == 'poll':
                    result, delay = self._client().poll(job['result_id'])
                    payload = {'outcome': 'failed' if result.status == 'failed' else
                               'succeeded' if result.status == 'succeeded' else 'running', 'retry_after': delay}
                    # OCR/layout is intentionally discarded here; T4 retrieves it internally.
                    del result
                else:
                    self._client().delete(job['result_id'])
                    payload = {'outcome': 'deleted'}
            except DocumentError as error:
                # Signing failed BEFORE submit, so retrying is safe.
                logger.warning('hu23_ocr stage=%s reason=%s process=%s', operation, str(error), process_id)
                payload = {'outcome': 'retry', 'retry_after': 2}
            except OcrError as error:
                logger.warning('hu23_ocr stage=%s reason=%s status=%s provider=%s outcome=%s process=%s',
                               operation, error.reason, error.status, error.provider_code, error.code, process_id)
                payload = {'outcome': 'unknown' if error.code == 'submission_unknown' else
                           'retry' if error.code == 'transient' or operation == 'delete' else 'failed',
                           'error': error.code, 'retry_after': error.retry_after}
                # DELETE 404 cannot prove absence after a local failure/deadline.
                # Keep the duty: T8 reconciles with GET status before acknowledging it.
            bundle = self._step(user, process_id, 'settle', job['lease_token'], payload)
        # Separate original and remote result cleanup; each duty survives physical failures.
        if bundle['process']['closed_at']:
            UploadService(self.repository, self.storage).try_cleanup(user, process_id)
            if operation != 'delete' and action != 'cleanup':
                self.try_cleanup(user, process_id)
            bundle = self._step(user, process_id, 'read')
        return self._view(bundle)

    def try_cleanup(self, user, process_id):
        """Best effort AFTER logical cancellation/failure; absence of keys cannot undo closure."""
        try:
            if self._provider(user, process_id, cleanup=True) == 'local':
                from .local_ocr import LocalOcrService
                LocalOcrService(self.repository, self.storage).cleanup(user, process_id)
                return
            self._execute(user, process_id, 'cleanup')
        except (DocumentError, OcrError):
            # Database already records deletion duty. Recovery retries it later.
            return

    def read_layout(self, user, process_id):
        """Internal T4 port; NEVER expose this payload to a public route or database column."""
        bundle = self._step(user, process_id, 'read')
        job, process = bundle.get('job'), bundle['process']
        if (not job or job['job_state'] != 'succeeded' or process['state'] != 'ocr_ready'
                or job['deletion_state'] != 'not_requested'):
            raise DocumentError('invalid_transition')
        result, _ = self._client().poll(job['result_id'])
        if result.status != 'succeeded':
            raise DocumentError('invalid_result')
        return result

    def release_result(self, user, process_id):
        """Internal T4 acknowledgement, only after its minimal candidates commit."""
        self._step(user, process_id, 'discard')
        self.try_cleanup(user, process_id)
