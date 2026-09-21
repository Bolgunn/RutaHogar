"""Read-only boundary contract composed from predicates used by the scoring engine."""

from .blockers import blocker_rule_margins
from .components import component_rule_margins
from .project_fit import project_fit_rule_margins


def financial_rule_margins(data: dict, indicators: dict) -> tuple:
    groups = (
        blocker_rule_margins(data, indicators).values(),
        project_fit_rule_margins(data, indicators).values(),
        *component_rule_margins(data, indicators).values(),
    )
    return tuple(value for group in groups for value in group)
