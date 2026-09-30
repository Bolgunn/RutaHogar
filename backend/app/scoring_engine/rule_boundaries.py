"""Pure HU13 boundary adapter for the CURRENT three-variable projection contract.

All monetary predicates are engine-owned. Affine crossings are solved between
domain/ALG-9 branch boundaries; discrete classifications use the real runner.
Timestamps use PostgreSQL/Python's shared microsecond resolution, not a horizon.
"""

from datetime import timedelta
from math import ceil, isfinite

from .boundary_contract import financial_rule_margins
from .indicators import calculate_financial_indicators
from .project_fit import PROJECT_BLOCKER_CODES
from .property_value import resolve_property_value_clp
from .purchase_capacity import capacity_rule_margins
from ..tracking.contracts import parse_time

DAY_MICROSECONDS = timedelta(days=1) // timedelta(microseconds=1)
TICK = timedelta(microseconds=1)


class RuleBoundaryProvider:
    def held_blocker(self, _state, result):
        # Only the project-fit age/term blocker is held under this numeric contract.
        return any(row["code"] in PROJECT_BLOCKER_CODES and row["code"] == "edad_plazo_riesgoso"
                   for row in result.get("blockers", []))

    def milestones(self, latest, models, cutoff, state_at, scorer):
        if set(models) - {"ingreso_mensual", "deuda_mensual", "ahorro_disponible"}:
            raise ValueError("Boundary provider must be extended before projecting another field")
        raw = {}
        cuts = {0.0}
        for name, model in models.items():
            if model["status"] != "projected":
                continue
            slope = model["slope_per_day"]
            origin_days = (cutoff - parse_time(model["origin_at"])).total_seconds() / 86400
            intercept = model["intercept"] + slope * origin_days
            minimum = model["domain"].get("min")
            raw[name] = (intercept, slope, minimum)
            if minimum is not None:
                crossing = (minimum - intercept) / slope
                if crossing > 0 and isfinite(crossing):
                    cuts.add(crossing)

        def state_on_segment(day, segment):
            state = dict(latest)
            for name, (a, b, minimum) in raw.items():
                # Determine the domain branch at an interior point of the segment.
                if minimum is not None and a + b * segment < minimum:
                    state[name] = minimum
                else:
                    state[name] = a + b * day
            return state

        def indicators(state):
            return calculate_financial_indicators(state, resolve_property_value_clp(state)["property_value_clp"])

        def predicates(state):
            ind = indicators(state)
            return financial_rule_margins(state, ind)

        def canonical_day(day):
            return ceil(day * DAY_MICROSECONDS) / DAY_MICROSECONDS

        def add_roots(predicate, boundaries):
            found = set()
            ordered = sorted(boundaries)
            for index, lower in enumerate(ordered):
                upper = ordered[index + 1] if index + 1 < len(ordered) else float("inf")
                interior = (lower + upper) / 2 if isfinite(upper) else lower + 1
                # Affine extension within a known branch; sampling distance is not a horizon.
                delta = (upper - lower) / 4 if isfinite(upper) else 1
                v0 = predicate(state_on_segment(interior, interior))
                v1 = predicate(state_on_segment(interior + delta, interior))
                for zero, one in zip(v0, v1):
                    slope = (one - zero) / delta
                    if slope:
                        root = interior - zero / slope
                        if isfinite(root) and lower <= root <= upper and root > 0:
                            found.add(canonical_day(root))
            return found

        cuts |= add_roots(predicates, cuts)

        def capacity_predicates(state):
            return capacity_rule_margins(state, indicators(state))

        tick_days = 1 / DAY_MICROSECONDS

        def is_actual_capacity_transition(day):
            before_day = max(0.0, day - tick_days)
            before = capacity_predicates(state_on_segment(before_day, before_day))
            after = capacity_predicates(state_on_segment(day + tick_days, day + tick_days))
            return any(
                left != right and (left == 0 or right == 0 or (left < 0 < right) or (right < 0 < left))
                for left, right in zip(before, after)
            )

        # ALG-9 is piecewise: discovering one branch boundary can invalidate a
        # root extrapolated from the old segment and reveal another one. Grow
        # the partition monotonically until no predicate produces a new
        # representable boundary. This is a structural fixed point over the
        # engine predicates, not a time horizon or a financial iteration cap.
        while True:
            discovered = add_roots(capacity_predicates, cuts)
            new_boundaries = {
                day for day in discovered - cuts if is_actual_capacity_transition(day)
            }
            if not new_boundaries:
                break
            cuts |= new_boundaries
        dates = {cutoff + TICK}
        for day in cuts:
            if day <= 0:
                continue
            at = cutoff + timedelta(microseconds=ceil(day * DAY_MICROSECONDS))
            dates.update((at - TICK, at, at + TICK))
        ordered = sorted(date for date in dates if date > cutoff)

        # Each remaining interval has monotone continuous savings/income gaps and
        # score components. Find every classification/status change by real calls;
        # no score interpolation, copied weights, guessed months or terminal cap.
        cache = {}
        def outcome(at):
            if at not in cache:
                cache[at] = scorer(state_at(at), at)
            return cache[at]

        for left, right in zip(ordered, ordered[1:]):
            for selector in (
                lambda result: result["classification"],
                lambda result: result["project_fit"]["status"],
            ):
                cursor = left
                while selector(outcome(cursor)) != selector(outcome(right)):
                    lo, hi = cursor, right
                    value = selector(outcome(lo))
                    while hi - lo > TICK:
                        mid = lo + ((hi - lo) // TICK // 2) * TICK
                        if selector(outcome(mid)) == value:
                            lo = mid
                        else:
                            hi = mid
                    dates.update((hi - TICK, hi))
                    cursor = hi
        return sorted(date for date in dates if date > cutoff)
