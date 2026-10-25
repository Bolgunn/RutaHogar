"""Bounded cron recovery. No downloads, financial writes or user-facing raw metadata."""
import logging
import time
from uuid import UUID

from .azure import AzureOcrClient, OcrError
from .contracts import DocumentError
from .storage import TemporaryStorage

BATCH_LIMIT = 50
MAX_BATCH_LIMIT = 100
IO_TIMEOUT = 3.0
RUN_BUDGET = 35.0
OPERATION_RESERVE = 15.0
logger = logging.getLogger(__name__)


class DocumentCleanupService:
    def __init__(self, repository, *, storage=None, azure=None, clock=time.monotonic):
        self.repository = repository
        self.storage = storage or TemporaryStorage(repository)
        self.azure = azure
        self.clock = clock

    def _rpc(self, action, run=None, **kwargs):
        return self.repository.rpc('hu23_cleanup', {'p_action': action, 'p_run': run, **kwargs}, timeout=IO_TIMEOUT)

    def _azure(self):
        if self.azure is None:
            self.azure = AzureOcrClient(timeout=IO_TIMEOUT)
        return self.azure

    def _delete_storage(self, path):
        if path is not None:
            # Defense in depth; identity is loaded only from the private claim RPC.
            parts = path.split('/')
            if len(parts) != 3 or any(part in ('', '.', '..') for part in parts):
                raise DocumentError('invalid_result')
            try:
                UUID(parts[0]); UUID(parts[1])
            except ValueError:
                raise DocumentError('invalid_result') from None
            self.storage.delete(path, timeout=IO_TIMEOUT)
        return {'outcome': 'deleted'}

    def _delete_azure(self, claim):
        client = self._azure()
        if claim['probe']:
            state, delay = client.probe(claim['result_id'])
            return {'outcome': 'deleted' if state is None else
                    ('running' if state == 'notStarted' else state), 'retry_after': delay}
        try:
            client.delete(claim['result_id'])
        except OcrError as exc:
            if exc.code == 'not_found':
                # DELETE 404 alone does not establish absence of a still-running job.
                return {'outcome': 'missing',
                        'retry_after': exc.retry_after}
            raise
        return {'outcome': 'deleted'}

    def run(self, limit=BATCH_LIMIT):
        started = self.clock()
        report = dict(busy=False, selected=0, attempted=0, storage_deleted=0, azure_deleted=0,
                      purged=0, retried=0, skipped=0, failed=0, unresolved=0, budget_exhausted=False)
        reservation = self._rpc('begin')
        if not reservation or reservation.get('busy'):
            report['busy'] = True
            return report
        run = reservation['token']
        try:
            items = self._rpc('list', run, p_limit=max(1, min(limit, MAX_BATCH_LIMIT))) or []
            report['selected'] = len(items)
            report['batch_full'] = len(items) >= min(limit, MAX_BATCH_LIMIT)
            for item in items:
                if self.clock() - started > RUN_BUDGET - OPERATION_RESERVE:
                    report['budget_exhausted'] = True
                    break
                claim = None
                try:
                    claim = self._rpc('claim', run, p_process=item['process_id'], p_kind=item['kind'])
                    if not claim:
                        report['skipped'] += 1
                        continue
                    report['attempted'] += 1
                    if claim.get('unresolved'):
                        report['unresolved'] += 1
                        continue
                    if claim.get('purged'):
                        report['purged'] += 1
                        continue
                    if claim.get('absent'):
                        report['azure_deleted'] += 1
                        continue
                    try:
                        payload = self._delete_storage(claim['path']) if item['kind'] == 'storage' else self._delete_azure(claim)
                    except (DocumentError, OcrError) as exc:
                        payload = {'outcome': 'retry', 'retry_after': getattr(exc, 'retry_after', 60)}
                    settled = self._rpc('settle', run, p_process=item['process_id'], p_kind=item['kind'],
                                        p_token=claim['token'], p_payload=payload)
                    if settled is None:
                        report['skipped'] += 1
                    elif settled.get('outcome') == 'deleted':
                        report[item['kind'] + '_deleted'] += 1
                    else:
                        report['retried'] += 1
                except (DocumentError, OcrError):
                    # A lost settle leaves a lease, not a lost obligation. Continue the batch.
                    report['failed'] += 1
            report.update(self._rpc('metrics', run) or {})
        finally:
            try:
                self._rpc('finish', run)
            except DocumentError:
                report['failed'] += 1
        if report['failed'] or report['retried'] or report.get('overdue_originals') or report.get('unresolved_submissions') or report.get('batch_full') or report['budget_exhausted']:
            # Only counters; never provider errors, process identifiers, URLs or values.
            logger.warning('HU23 cleanup recovery counters: %s', report)
        return report
