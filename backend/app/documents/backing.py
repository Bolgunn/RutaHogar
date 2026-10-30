"""E4: field/status/date only. Commercial authorization precedes every subject read."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from ..tracking.contracts import parse_time, TrackingError
from ..tracking.lineage import reconstruct
from ..tracking.scoring_adapter import financial_field_contract
from ..tracking.service import source_events
from ..tracking.staff import StaffLeadService
from .domain import current_backing
from .tracking_adapter import current_declaration

BACKING_FIELDS = ('ingreso_mensual','ahorro_disponible','tipo_contrato','continuidad_laboral')
BUSINESS_TIMEZONE = ZoneInfo('America/Santiago')


class DocumentBackingService:
    def __init__(self, repository, clock=None):
        self.repository = repository
        self.clock = clock or (lambda:datetime.now(timezone.utc))

    def _projection(self, subject, *, owner):
        # This RPC returns at most four confirmed metadata rows, never candidates/storage/OCR.
        rows = self.repository.rpc('hu23_backing_evidence', {'p_subject':subject,'p_owner':owner})
        fields = {field:{'field':field,'status':'sin_respaldo','confirmed_on':None} for field in BACKING_FIELDS}
        if not rows:
            # Legacy accounts require no HU13 baseline adoption or financial read.
            return {'fields':list(fields.values())}
        bundle = self.repository.load_tracking(subject)
        if not bundle.get('plan') or not bundle.get('evaluations'):
            return {'fields':list(fields.values())}
        now = self.clock()
        history = {row['event_id']:row for row in bundle['events']}
        lineage = reconstruct(source_events(bundle),subject,financial_field_contract())
        applicable = [row for row in lineage['active_line'] if parse_time(row['effective_at'])<=now]
        current = applicable[-1]['snapshot'] if applicable else {}
        originals = {}
        for row in rows:
            field, source_id = row['field'], row['source_event_id']
            if field not in fields or source_id not in history or parse_time(history[source_id]['effective_at'])>now:
                continue
            if source_id not in originals:
                originals[source_id] = current_declaration(bundle,subject,through_revision=source_id)
            source_value = originals[source_id].get(field)
            if source_value is None or current.get(field) is None:
                continue
            state = current_backing(row['backing_at_confirmation'],current[field],source_value).value
            fields[field]['status'] = state
            if state != 'sin_respaldo':
                fields[field]['confirmed_on'] = parse_time(row['confirmed_at']).astimezone(BUSINESS_TIMEZONE).date()
        return {'fields':list(fields.values())}

    def owner(self, user):
        return self._projection(user,owner=True)

    def staff(self, token, subject):
        transport = getattr(self.repository,'tracking',None)
        if transport is None:
            raise TrackingError('persistence_unavailable')
        authorization = StaffLeadService(transport)
        actor = authorization._actor(token)
        authorization._authorize(actor,subject)
        return self._projection(subject,owner=False)
