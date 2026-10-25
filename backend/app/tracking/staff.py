"""Authorized HU30 commercial reads; current confirmations never replace history."""
from datetime import datetime, timezone

from .contracts import TrackingError
from .co_debtor import FINANCIAL_FIELDS, historical_visibility
from .co_debtor_access import project_row, redact_snapshot
from .co_debtor_projection import project_evaluation, used_evidence, verified_evidence

CO_DEBTOR_CONFIRMED_FIELDS = FINANCIAL_FIELDS
CO_DEBTOR_RAW_FIELDS = frozenset((*FINANCIAL_FIELDS, 'relacion_complementario'))
redact_co_debtor_data = redact_snapshot


class StaffLeadService:
    def __init__(self, repository, clock=None):
        self.repository = repository
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    def _actor(self, token):
        actor = self.repository.staff_actor(token)
        if actor.get('role') not in {'ejecutivo', 'admin', 'admin_inmobiliario'}:
            raise TrackingError('owner_mismatch')
        return actor

    def _authorize(self, actor, lead_id):
        if not self.repository.staff_can_access(actor, lead_id):
            raise TrackingError('owner_mismatch')

    def _invitations(self, leads):
        loader = getattr(self.repository, 'co_debtor_rows', None)
        if callable(loader):
            return [item for item in loader(leads) if item.get('lead_id') in leads]
        # Legacy adapters may provide state, but never evidence for financial fallback.
        output = []
        for lead in leads:
            item = self.repository.staff_co_debtor_invitation(lead)
            if item:
                output.append({**item, 'lead_id': lead})
        return output

    def _other(self, rows, invitations, now):
        used = {}
        for row in rows:
            snapshot = row.get('financial_data') or row.get('snapshot') or {}
            item, revision = used_evidence(snapshot, invitations)
            if verified_evidence(snapshot, item, revision) and item and item.get('participant_user_id') and historical_visibility(item, now)['visible']:
                used[item['id']] = item
        loader = getattr(self.repository, 'other_active_participations', None)
        return loader(list(used.values())) if callable(loader) and used else {}

    def _project(self, row, invitations, now, other):
        scoped = [item for item in invitations if item.get('lead_id') == row.get('user_id')]
        snapshot = row.get('financial_data') or row.get('snapshot') or {}
        item, _ = used_evidence(snapshot, scoped)
        output = project_row(row, scoped, now)
        output['co_debtor'] = project_evaluation(snapshot, scoped, now, other_active=other.get((item or {}).get('id'), False))
        return output

    def evaluations(self, token):
        actor, now = self._actor(token), self.clock()
        # The scoped RPC applies the same tenant predicate as the detail check.
        rows = [row for row in self.repository.staff_evaluations(actor) if row.get('user_id')]
        invitations = self._invitations({row['user_id'] for row in rows})
        other = self._other(rows, invitations, now)
        result = [self._project(row, invitations, now, other) for row in rows]
        contacts = self.repository.staff_contacts([row['user_id'] for row in result])
        return {'items': [{**row, **contacts.get(row['user_id'], {})} for row in result]}

    def lead_detail(self, token, lead_id):
        actor, now = self._actor(token), self.clock()
        self._authorize(actor, lead_id)
        rows = [row for row in self.repository.staff_lead_evaluations(lead_id) if row.get('user_id', lead_id) == lead_id]
        latest = max(rows, key=lambda row: (str(row.get('created_at') or ''), str(row.get('id') or '')), default={})
        invitations = self._invitations({lead_id})
        other = self._other(rows, invitations, now)
        projected = self._project({**latest, 'user_id': lead_id}, invitations, now, other)
        history = [self._project(row, invitations, now, other) for row in self.repository.staff_history(lead_id) if row.get('user_id', lead_id) == lead_id]
        return {'evaluation': projected, 'co_debtor': projected['co_debtor'], 'history': history}

    def evaluation_history(self, token, lead_id, evaluation_id):
        actor, now = self._actor(token), self.clock()
        self._authorize(actor, lead_id)
        invitations = self._invitations({lead_id})
        rows = [row for row in self.repository.staff_history(lead_id)
                if row.get('user_id', lead_id) == lead_id and row.get('evaluation_id') == evaluation_id]
        other = self._other(rows, invitations, now)
        return {'items': [self._project(row, invitations, now, other) for row in rows]}
