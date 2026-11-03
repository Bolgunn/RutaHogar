"""HU30 read contract. Select immutable evidence; never score or rewrite it."""
from copy import deepcopy

from .bipersonal import evaluation_type
from .co_debtor import FINANCIAL_FIELDS, historical_visibility, parse_timestamp, select_confirmation
from .co_debtor_access import snapshot_reference, can_show_snapshot, snapshot_has_complement
from .repository import select_current_co_debtor_invitation

VERSION = 'hu30-projection-v1'


def rows(value):
    return [value] if isinstance(value, dict) else list(value or [])


def snapshot_parts(snapshot):
    snapshot = snapshot or {}
    return (snapshot.get('input') or snapshot.get('input_snapshot') or {},
            snapshot.get('result') or snapshot.get('result_snapshot') or {}, snapshot.get('provenance') or {})


def used_evidence(snapshot, invitations):
    ref = snapshot_reference(snapshot)
    matches = [(item, revision) for item in invitations
               if ref and (revision := select_confirmation(item.get('co_debtor_confirmations'), ref))]
    return matches[0] if len(matches) == 1 else (None, None)


def verified_evidence(snapshot, item, revision):
    if not item or not revision:
        return False
    state, _, provenance = snapshot_parts(snapshot)
    consent = provenance.get('co_debtor_consent') or {}
    actor = item.get('participant_user_id')
    relations = rows(item.get('co_debtor_consent_events'))
    relation = next((event for event in relations if event.get('id') == consent.get('relation_declaration_event_id')
                     and event.get('relation_revision') is not None), None)
    accepted = any(c.get('participant_user_id') == actor and c.get('accepted_relation_event_id')
                   for c in rows(item.get('co_debtor_confirmations')))
    return bool(actor and revision.get('participant_user_id') == actor and accepted and relation
                and consent.get('complement_source') == 'co_debtor_confirmed'
                and revision.get('revision_number') == consent.get('revision_number')
                and relation.get('relation_value') == state.get('relacion_complementario')
                and all(revision.get(field) == state.get(field) for field in FINANCIAL_FIELDS))


def current_participation(invitations, now):
    item = select_current_co_debtor_invitation(invitations)
    if not item:
        return None, None, False
    revision = select_confirmation(item.get('co_debtor_confirmations'))
    accepted = any(c.get('accepted_relation_event_id') and c.get('participant_user_id') == item.get('participant_user_id')
                   for c in rows(item.get('co_debtor_confirmations')))
    valid = bool(item.get('status') == 'confirmed' and revision and item.get('participant_user_id')
                 and revision.get('participant_user_id') == item.get('participant_user_id') and accepted
                 and any(e.get('relation_revision') is not None for e in rows(item.get('co_debtor_consent_events')))
                 and historical_visibility(item, now)['closure_at'] is None and historical_visibility(item, now)['visible'])
    return item, revision, valid


def status_of(item, now):
    if not item:
        return 'not_confirmed'
    if any(e.get('event_type') == 'revoked' for e in rows(item.get('co_debtor_consent_events'))):
        return 'revoked'
    if item.get('status') == 'pending':
        expires = parse_timestamp(item.get('expires_at'))
        if expires is None or expires <= now:
            return 'expired'
    return item.get('status', 'not_confirmed')


def revision_view(revision):
    return {'id': revision['id'], 'revision_number': revision.get('revision_number')} if revision and revision.get('id') else None


def project_evaluation(snapshot, invitations, now, *, owner=False, current_snapshot=None, other_active=False):
    state, result, provenance = snapshot_parts(snapshot)
    indicators = result.get('financial_indicators') or {}
    item, revision = used_evidence(snapshot, invitations)
    verified = verified_evidence(snapshot, item, revision)
    classification = evaluation_type(snapshot, verified_revision=verified)
    if not verified and classification == 'individual' and snapshot_has_complement(snapshot):
        classification = 'unverifiable_origin'
    # A stored confirmed classification survives closure; it is never inferred
    # from a new confirmation, a positive income or a current invitation.
    visible = can_show_snapshot(snapshot, invitations, now, owner=owner)
    window = historical_visibility(item, now) if item else {'visible': False, 'closure_at': None, 'historical_visible_until': None}
    events = rows((item or {}).get('co_debtor_consent_events'))
    revoked = [parse_timestamp(e.get('occurred_at')) for e in events if e.get('event_type') == 'revoked']
    replaced = [parse_timestamp(e.get('occurred_at')) for e in events if e.get('event_type') == 'replaced'
                and window['closure_at'] and parse_timestamp(e.get('occurred_at'))
                and parse_timestamp(e.get('occurred_at')) >= parse_timestamp(window['closure_at'])]
    revoked_at = min(filter(None, revoked), default=None)
    replaced_at = min(filter(None, replaced), default=None)
    current, current_revision, usable = current_participation(invitations, now)
    current_state, _, current_provenance = snapshot_parts(current_snapshot or snapshot)
    complete = all(current_state.get(field) is not None for field in FINANCIAL_FIELDS)
    matches = bool(usable and complete and current_state.get('complemento_renta') is True
                   and all(current_state.get(field) == current_revision.get(field) for field in FINANCIAL_FIELDS))
    later = bool(matches and current_provenance.get('co_debtor_confirmation_id') != current_revision.get('id'))
    pending = bool(usable and not matches)
    stored_summary = result.get('bipersonal_summary')
    summary = deepcopy(stored_summary) if (visible and verified and isinstance(stored_summary, dict)
        and stored_summary.get('version') == 'hu30-bipersonal-v1'
        and stored_summary.get('evaluation_type') == classification) else None
    without = (summary or {}).get('without_complement') or {}
    delta = (summary or {}).get('delta') or {}
    uf = indicators.get('uf_value_clp') if visible else None
    warnings = []
    if item and (window['closure_at'] or item.get('status') in ('revoked', 'replaced')
                 or any(e.get('event_type') == 'revoked' for e in events)):
        first_revoked = ((revoked_at and (not replaced_at or revoked_at <= replaced_at))
                         or (not revoked_at and not replaced_at and (item.get('status') == 'revoked'
                             or any(e.get('event_type') == 'revoked' for e in events))))
        warnings.append('historical_consent_revoked' if first_revoked else 'historical_participation_replaced')
        if not window['closure_at']:
            warnings.append('closure_time_unknown')
        if not window['visible']:
            warnings.append('historical_details_hidden')
    if classification == 'unverifiable_origin':
        warnings.append('unverifiable_origin')
    initial = next((c for c in sorted(rows((item or {}).get('co_debtor_confirmations')), key=lambda c: c.get('revision_number') or 0)
                    if c.get('accepted_relation_event_id')), None)
    initial_event = next((e for e in events if e.get('id') == (initial or {}).get('accepted_relation_event_id')), None)
    holder = {'income': indicators.get('ingreso_principal', state.get('ingreso_mensual')),
              'debt': indicators.get('deuda_principal', state.get('deuda_mensual')), 'contract': state.get('tipo_contrato')}
    co = None
    relation = None
    if visible and revision:
        co = dict(zip(('income', 'debt', 'contract', 'employment_continuity', 'delinquency'), (state.get(f) for f in FINANCIAL_FIELDS)))
        co.update(income_considered=indicators.get('ingreso_complementario_considerado'), debt_considered=indicators.get('deuda_complementaria_considerada'))
        relation = {'value': state.get('relacion_complementario'), 'source': 'lead_declared',
                    'declaration_event_id': (provenance.get('co_debtor_consent') or {}).get('relation_declaration_event_id'),
                    'initial_accepted_value': (initial_event or {}).get('relation_value'),
                    'modified_after_acceptance': bool(initial_event and initial_event.get('id') != (provenance.get('co_debtor_consent') or {}).get('relation_declaration_event_id'))}
    projection = {'version': VERSION, 'evaluation_type': classification,
        'availability': (summary or {}).get('availability', 'insufficient_data'),
        'participation_id': (item or {}).get('id'), 'status': status_of(item or current, now),
        'source': (provenance.get('co_debtor_consent') or {}).get('complement_source') or ('lead_declared' if classification == 'declared_complement' else 'unverifiable_origin' if classification == 'unverifiable_origin' else None),
        'used_revision': revision_view(revision), 'relation': relation,
        'provenance': {'confirmation_id': (revision or {}).get('id'),
                       'revision_number': (revision or {}).get('revision_number'),
                       'relation_declaration_event_id': relation.get('declaration_event_id') if relation else None,
                       'complement_source': (provenance.get('co_debtor_consent') or {}).get('complement_source'),
                       'scoring_version': provenance.get('scoring_version')},
        'visibility': 'visible' if visible else 'hidden', 'revoked_at': revoked_at.isoformat() if revoked_at else None,
        'replaced_at': replaced_at.isoformat() if replaced_at else None,
        'historical_visible_until': window['historical_visible_until'], 'warnings': warnings,
        'holder': holder, 'co_debtor': co, 'bipersonal_summary': summary,
        'financial_totals': {'income': indicators.get('ingreso_total'), 'debt': indicators.get('deuda_total')} if visible else None,
        'capacity': {'without_complement': deepcopy(without),
                     'with_complement': {'purchase_capacity_uf': indicators.get('capacidad_compra_estimada_uf'),
                         'purchase_capacity_clp': indicators.get('capacidad_compra_estimada_clp'),
                         'income_capacity_uf': indicators.get('capacidad_por_renta_uf')},
                     'delta': deepcopy(delta), 'uf_value_clp': uf,
                     'uf_date': (indicators.get('capacidad_supuestos') or {}).get('uf_fecha')} if visible and summary else None,
        'risks': [{'code': b['code'], 'severity': b.get('severity'), 'scope': 'co_debtor' if b['code'].startswith('complemento_') else 'evaluation'}
                  for b in result.get('blockers', []) if isinstance(b, dict) and b.get('code') in
                  {'complemento_debil', 'complemento_incompleto', 'morosidad_vigente', 'carga_total_alta', 'deuda_actual_alta', 'pie_insuficiente', 'dividendo_exigente', 'edad_plazo_riesgoso'}] if visible else []}
    # Compatibility: HU18's commercial section reads `confirmed`, but it now
    # represents exactly the revision used, never the latest confirmation.
    if visible and revision:
        projection['confirmed'] = {f: state.get(f) for f in FINANCIAL_FIELDS}
    if owner:
        projection.update(current_participation={'id': (current or {}).get('id'), 'status': status_of(current, now)},
            current_revision=revision_view(current_revision) if usable else None,
            update_required=pending, matching_confirmed_later=later,
            message='Antecedentes coincidentes confirmados posteriormente' if later else None)
    else:
        projection['has_other_active_participations'] = bool(other_active and visible and verified)
    return projection
