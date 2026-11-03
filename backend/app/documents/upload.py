"""Short authenticated upload lease + atomic Storage metadata admission, without binaries."""
from .config import public_limits
from .contracts import DocumentError
from .service import DocumentService
from .storage import TemporaryStorage


class UploadService:
    def __init__(self, repository, storage=None):
        self.repository = repository
        self.documents = DocumentService(repository)
        self.storage = storage or TemporaryStorage(repository)

    def _expired(self, user, process_id, bundle):
        if bundle['process']['state'] == 'expired':
            self.try_cleanup(user, process_id)
            raise DocumentError('expired')

    def authorize(self, user, process_id, command):
        bundle = self.repository.rpc('hu23_upload_authorize', {
            'p_user': user, 'p_process': process_id, 'p_request': command.model_dump(mode='json'),
        })
        self._expired(user, process_id, bundle)
        upload = bundle['upload']
        return {'authorization': 'authenticated', 'bucket': upload['bucket_id'], 'path': upload['storage_path'],
                'expires_at': upload['upload_expires_at'], 'revision': bundle['process']['revision'],
                'content_type': upload['content_type'], 'restrictions': public_limits()}

    def complete(self, user, process_id, command):
        bundle = self.repository.rpc('hu23_upload_complete', {
            'p_user': user, 'p_process': process_id, 'p_revision': command.expected_revision,
        })
        self._expired(user, process_id, bundle)
        if bundle.get('upload_error'):
            self.try_cleanup(user, process_id)
            raise DocumentError(bundle['upload_error'])
        return self.documents._view(user, bundle)

    def try_cleanup(self, user, process_id):
        bundle = self.repository.read(user, process_id)
        p = bundle['process']
        if not p['closed_at'] or p['deletion_state'] not in ('delete_pending', 'retry_required'):
            return
        try:
            claimed = self.documents.mark_deletion(user, process_id, p['revision'], 'deleting')['process']
        except DocumentError as error:
            if str(error) == 'stale_review':
                return
            raise
        try:
            if not p['storage_path'].startswith(f'{user}/{process_id}/'):
                raise DocumentError('storage_unavailable')
            self.storage.delete(p['storage_path'])
        except DocumentError:
            self.documents.mark_deletion(user, process_id, claimed['revision'], 'retry_required')
        else:
            # The object name remains in the private upload tombstone for late-write recovery.
            try:
                self.documents.mark_deletion(user, process_id, claimed['revision'], 'deleted')
            except DocumentError as error:
                if str(error) != 'upload_not_deleted':
                    raise
                self.documents.mark_deletion(user, process_id, claimed['revision'], 'retry_required')

    def cancel(self, user, process_id, command):
        self.documents.cancel(user, process_id, command)
        self.try_cleanup(user, process_id)
        return self.documents.read(user, process_id)

    def confirm(self, user, process_id, command):
        self.documents.confirm(user, process_id, command)
        self.try_cleanup(user, process_id)
        return self.documents.read(user, process_id)
