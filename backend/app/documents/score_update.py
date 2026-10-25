"""Explicit HU23 evaluation; reuse HU13 orchestration without changing its global behavior."""
from copy import deepcopy
from datetime import datetime, timezone
import json
from uuid import NAMESPACE_URL, uuid5

from ..tracking.contracts import TrackingError, parse_time
from ..tracking.lineage import reconstruct
from ..tracking.scoring_adapter import financial_field_contract
from ..tracking.service import TrackingService, source_events
from .contracts import DocumentError
from .tracking_adapter import current_declaration
from .upload import UploadService

REASON = 'hu23_datos_validados'


def pending_context(data, now):
    bundle, evidence = data['tracking'], data['evidence']
    if not bundle.get('plan'):
        return {'pending': False, 'revision': bundle.get('revision'), 'validation_token': None,
                'fields': [], 'cleanup_required': False, 'evaluation_id': None}
    lineage = reconstruct(source_events(bundle), data['user_id'], financial_field_contract())
    applicable = [row for row in lineage['active_line'] if parse_time(row['effective_at']) <= now]
    current = applicable[-1]['snapshot'] if applicable else {}
    last = next((row for row in reversed(applicable) if row.get('evaluation_id') and row.get('evaluation')), None)
    history = {row['event_id']: row for row in bundle['events']}
    cutoff = (parse_time(last['provenance'].get('cutoff_at') or history[last['event_id']]['recorded_at'])
              if last else datetime.min.replace(tzinfo=timezone.utc))
    evaluated = next((row.get('financial_data') or {} for row in bundle.get('evaluations', [])
                      if last and row['id']==last['evaluation_id']), {})
    scored_input = evaluated.get('input') or evaluated.get('input_snapshot') or {}
    selected_by_field = {}
    for row in sorted(evidence, key=lambda row: (parse_time(row['confirmed_at']), row['process_id'], row['field'])):
        if row['backing_at_confirmation'] != 'respaldado':
            continue
        # A later historical evaluation may have scored an earlier snapshot.
        if parse_time(row['confirmed_at']) <= cutoff and scored_input.get(row['field']) == current.get(row['field']):
            continue
        source = history.get(row['source_event_id'])
        if not source or parse_time(source['effective_at']) > now:
            continue
        original = current_declaration(bundle, data['user_id'], through_revision=row['source_event_id'])
        if row['field'] in original and original[row['field']] == current.get(row['field']):
            selected_by_field[row['field']] = row
    selected = list(selected_by_field.values())
    selected.sort(key=lambda row: (row['process_id'], row['field']))
    sources = [{'process_id': row['process_id'], 'field': row['field']} for row in selected]
    identity = [data['user_id'], bundle['revision'], last['event_id'] if last else None,
                applicable[-1]['event_id'] if applicable else None, len(evidence), sources]
    token = str(uuid5(NAMESPACE_URL, json.dumps(identity, sort_keys=True, separators=(',', ':')))) if sources else None
    return {'pending': bool(sources), 'revision': bundle['revision'], 'validation_token': token,
            'fields': sorted(row['field'] for row in selected),
            'cleanup_required': any(row['deletion_state'] != 'deleted' for row in selected),
            'evaluation_id': last['evaluation_id'] if last else None,
            '_sources': sources, '_selected': selected, '_evidence_count': len(evidence),
            '_previous': lineage['active_line'][-1]['event_id'], '_snapshot': current,
            '_plan_id': bundle['plan']['id']}


class ScoreRepository:
    """Commit adapter; normal TrackingService builds the score and versioned evaluation."""
    def __init__(self, documents, intent, snapshot):
        self.documents, self.intent, self.snapshot = documents, intent, snapshot

    def load(self, user):
        bundle = self.documents.load_tracking(user)
        if bundle['revision'] != self.intent['revision']:
            raise DocumentError('stale_score_state')
        return bundle

    def load_co_debtor_consent(self, user):
        transport = getattr(self.documents, 'tracking', None)
        loader = getattr(transport, 'load_co_debtor_consent', None)
        return loader(user) if callable(loader) else None

    def commit(self, user, command, revision, records):
        records = deepcopy(records)
        if (len(records['events']) != 1 or len(records['evaluations']) != 1
                or records['events'][0]['recorded_complete_snapshot'] != self.snapshot):
            raise DocumentError('stale_score_state')
        details = {'reason': REASON, 'request_id': self.intent['request_id'],
                   'reference_evaluation_id': self.intent['reference_evaluation_id'],
                   'evidence': self.intent['sources']}
        records['events'][0]['provenance']['hu23_document_validation'] = deepcopy(details)
        records['evaluations'][0]['provenance']['hu23_document_validation'] = deepcopy(details)
        records['result']['evaluation']['provenance']['hu23_document_validation'] = deepcopy(details)
        return self.documents.rpc('hu23_score_commit', {'p_user': user,
            'p_event': self.intent['event_id'], 'p_command': command, 'p_revision': revision, 'p_records': records})


class DocumentScoreService:
    def __init__(self, repository, *, scorer=None, market_resolver=None, storage=None, clock=None):
        self.repository = repository
        self.scorer, self.market_resolver, self.storage = scorer, market_resolver, storage
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    def _data(self, user):
        return self.repository.rpc('hu23_score_context', {'p_user': user})

    def status(self, user):
        context = pending_context(self._data(user), self.clock())
        return {key: value for key, value in context.items() if not key.startswith('_')}

    def _intent(self, user, command, action, context=None):
        return self.repository.rpc('hu23_score_intent', {'p_user':user, 'p_action':action,
            'p_request':command.model_dump(mode='json'),
            'p_context': ({'sources':context['_sources'], 'evidence_count':context['_evidence_count'],
                          'previous_event_id':context['_previous'], 'plan_id':context['_plan_id'],
                          'reference_evaluation_id':context['evaluation_id']} if context else {})})

    @staticmethod
    def _result(result):
        evaluation = result['evaluation']
        return {'evaluation_id': evaluation['id'], 'score': evaluation['result']['score'],
                'classification': evaluation['result']['classification'],
                'algorithm_version': evaluation['result']['algorithm_version']}

    def update(self, user, command):
        existing = self._intent(user, command, 'find')
        if existing and existing.get('completed_at'):
            return self._result(existing['result'])
        context = pending_context(self._data(user), self.clock())
        if not context['pending']:
            raise DocumentError('no_score_pending')
        if str(command.expected_revision) != context['revision'] or str(command.validation_token) != context['validation_token']:
            raise DocumentError('stale_score_state')
        # Preserve the approved order: original removed before the explicit evaluation.
        # One Storage operation per request bounds serverless work; further failures remain recoverable.
        if context['cleanup_required']:
            row = next(row for row in context['_selected'] if row['deletion_state'] != 'deleted')
            UploadService(self.repository, self.storage).try_cleanup(user, row['process_id'])
            context = pending_context(self._data(user), self.clock())
            if context['cleanup_required']:
                raise DocumentError('document_cleanup_pending')
        intent = self._intent(user, command, 'prepare', context)
        if intent.get('completed_at'):
            return self._result(intent['result'])
        adapter = ScoreRepository(self.repository, intent, context['_snapshot'])
        options = {}
        if self.scorer is not None: options['scorer'] = self.scorer
        if self.market_resolver is not None: options['market_snapshot_resolver'] = self.market_resolver
        tracking = TrackingService(adapter, clock=lambda:parse_time(intent['created_at']), **options)
        try:
            result = tracking.execute(user, {'event_id':intent['event_id'], 'event_kind':'evaluation',
                'effective_at':intent['created_at'], 'reason':REASON,
                'previous_event_id':intent['previous_event_id'], 'patch':{}})
        except TrackingError as error:
            if error.code == 'lineage_conflict':
                raise DocumentError('stale_score_state') from None
            raise
        except DocumentError:
            raise
        except Exception:
            # Provider/scorer exceptions must not log or expose the financial input.
            raise DocumentError('score_update_unavailable') from None
        return self._result(result)
