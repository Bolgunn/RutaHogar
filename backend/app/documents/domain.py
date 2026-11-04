"""Pure lifecycle/comparison rules; no I/O, OCR, financial formulas or scoring."""
from decimal import Decimal
from .contracts import BackingState, Comparison, Decision, DocumentError, ProcessState

TERMINAL = {ProcessState.confirmed, ProcessState.cancelled, ProcessState.processing_failed, ProcessState.expired}
TRANSITIONS = {
    ProcessState.awaiting_upload: {ProcessState.ready},
    ProcessState.ready: {ProcessState.processing},
    ProcessState.processing: {ProcessState.awaiting_review, ProcessState.ocr_ready},
    ProcessState.ocr_ready: {ProcessState.awaiting_review},
    ProcessState.awaiting_review: {ProcessState.confirmed},
}


def validate_transition(current, target):
    current, target = ProcessState(current), ProcessState(target)
    allowed = TRANSITIONS.get(current, set())
    if current in TERMINAL or (target not in allowed and target not in {
        ProcessState.cancelled, ProcessState.processing_failed, ProcessState.expired,
    }):
        raise DocumentError("invalid_transition")


def compare(declared, candidate):
    if candidate.detection != "detected" or declared is None:
        return Comparison.insufficient
    value = candidate.value
    same = (Decimal(str(declared)) == Decimal(str(value))
            if isinstance(value, (int, float)) and isinstance(declared, (int, float))
            else declared == value)
    return Comparison.match if same else Comparison.difference


def backing_state(comparison, decision):
    if comparison == Comparison.insufficient or decision == Decision.undecided:
        return BackingState.none
    if comparison == Comparison.match or decision == Decision.accept:
        return BackingState.backed
    return BackingState.difference


def current_backing(evidence, current_source_value, reviewed_source_value):
    """A later failed attempt must not be supplied as replacement evidence."""
    return BackingState(evidence) if current_source_value == reviewed_source_value else BackingState.none
