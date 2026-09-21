import copy

import pytest

from case_support import assert_expected, cases, flatten_result


@pytest.mark.parametrize("case", cases(12), ids=lambda case: case["name"])
def test_alg12_case(case):
    from app.tracking.goal_progress import calculate_goal_progress

    data = copy.deepcopy(case["input"])
    before = copy.deepcopy(data)
    result = calculate_goal_progress(**data)
    assert data == before, "Frozen goal and historical evidence must never mutate"
    assert_expected(flatten_result(result), case["expect"])
