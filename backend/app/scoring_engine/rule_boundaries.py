"""Pure HU13 boundary adapter for the CURRENT three-variable projection contract.

All monetary predicates are engine-owned. Affine crossings are solved between
domain/ALG-9 branch boundaries; discrete classifications use the real runner.
Timestamps use PostgreSQL/Python's shared microsecond resolution, not a horizon.
"""

from datetime import timedelta
from math import ceil, isfinite

from .blockers import DIVIDEND_RATIO_LIMIT, TOTAL_BURDEN_LIMIT, DEBT_RATIO_LIMIT
from .components import PAYMENT_RATIO_LIMITS, DEBT_RATIO_LIMITS, TOTAL_BURDEN_LIMITS, SAVINGS_RATIO_LIMITS
from .indicators import calculate_financial_indicators
from .project_fit import PROJECT_BLOCKER_CODES, REQUIRED_INCOME_MULTIPLIER
from .property_value import resolve_property_value_clp
from .purchase_capacity import capacity_limits, dividend_limits, _deuda_total
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
            income, debt = ind["ingreso_total"], state.get("deuda_mensual", 0)
            dividend, savings = state.get("dividendo_estimado") or 0, state.get("ahorro_disponible", 0)
            values = [dividend * REQUIRED_INCOME_MULTIPLIER - income,
                      ind["pie_minimo_clp"] - savings]
            values.extend(dividend - ratio * income for ratio in (*PAYMENT_RATIO_LIMITS, DIVIDEND_RATIO_LIMIT))
            values.extend(debt - ratio * income for ratio in (*DEBT_RATIO_LIMITS, DEBT_RATIO_LIMIT))
            values.extend(debt + dividend - ratio * income for ratio in (*TOTAL_BURDEN_LIMITS, TOTAL_BURDEN_LIMIT))
            values.extend(savings - ratio * ind["property_value_clp"] for ratio in SAVINGS_RATIO_LIMITS)
            by_income, by_burden = dividend_limits(income, _deuda_total(state))
            values.extend((by_income, by_burden, by_income - by_burden))
            return values

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
                            found.add(root)
            return found

        cuts |= add_roots(predicates, cuts)

        def capacity_predicates(state):
            limits = capacity_limits(state, indicators(state))
            if limits["missing_income"]:
                return []
            return [limits["por_renta"] - limits["por_pie"],
                    limits["asistida_por_renta"] - limits["asistida_por_pie"]]

        cuts |= add_roots(capacity_predicates, cuts)
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
