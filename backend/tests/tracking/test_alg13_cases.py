import pytest

from case_support import cases


@pytest.mark.parametrize("case", cases(13), ids=lambda case: case["name"])
def test_alg13_case(case):
    from projection_support import check_projection_case

    check_projection_case(case)
