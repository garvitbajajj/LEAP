"""
Unit tests for eval.metrics — all metric functions with known inputs/outputs.

    cd ml/
    python -m pytest eval/test_metrics.py -v
"""
import math

import pytest

from eval.metrics import (
    coverage,
    diversity,
    hit_rate_at_k,
    map_at_k,
    ndcg_at_k,
    precision_at_k,
    recall_at_k,
)


# ---------------------------------------------------------------- precision@k
class TestPrecisionAtK:
    def test_all_relevant(self):
        assert precision_at_k(["a", "b", "c"], {"a", "b", "c"}, 3) == 1.0

    def test_none_relevant(self):
        assert precision_at_k(["a", "b", "c"], {"x", "y"}, 3) == 0.0

    def test_partial(self):
        assert precision_at_k(["a", "b", "c", "d"], {"a", "c"}, 4) == 0.5

    def test_k_smaller_than_list(self):
        assert precision_at_k(["a", "b", "c"], {"a"}, 2) == 0.5

    def test_k_larger_than_list(self):
        # Only 2 items in list but k=5 → denominator is k=5
        assert precision_at_k(["a", "b"], {"a", "b"}, 5) == 2 / 5

    def test_empty_recommended(self):
        assert precision_at_k([], {"a"}, 5) == 0.0

    def test_empty_relevant(self):
        assert precision_at_k(["a", "b"], set(), 2) == 0.0

    def test_k_zero(self):
        assert precision_at_k(["a"], {"a"}, 0) == 0.0

    def test_negative_k(self):
        assert precision_at_k(["a"], {"a"}, -1) == 0.0


# ---------------------------------------------------------------- recall@k
class TestRecallAtK:
    def test_all_recalled(self):
        assert recall_at_k(["a", "b"], {"a", "b"}, 2) == 1.0

    def test_partial_recall(self):
        assert recall_at_k(["a", "b", "c"], {"a", "d"}, 3) == 0.5

    def test_none_recalled(self):
        assert recall_at_k(["a", "b"], {"x"}, 2) == 0.0

    def test_empty_relevant(self):
        assert recall_at_k(["a"], set(), 1) == 0.0

    def test_empty_recommended(self):
        assert recall_at_k([], {"a"}, 3) == 0.0

    def test_k_zero(self):
        assert recall_at_k(["a"], {"a"}, 0) == 0.0


# ---------------------------------------------------------------- ndcg@k
class TestNdcgAtK:
    def test_perfect_ranking(self):
        # 2 relevant items ranked at positions 1 and 2
        assert ndcg_at_k(["a", "b", "c"], {"a", "b"}, 3) == pytest.approx(1.0)

    def test_reversed_ranking(self):
        # relevant items at positions 2 and 3 instead of 1 and 2
        recs = ["x", "a", "b"]
        relevant = {"a", "b"}
        dcg = 1 / math.log2(3) + 1 / math.log2(4)
        idcg = 1 / math.log2(2) + 1 / math.log2(3)
        assert ndcg_at_k(recs, relevant, 3) == pytest.approx(dcg / idcg)

    def test_single_hit_at_1(self):
        dcg = 1 / math.log2(2)
        idcg = 1 / math.log2(2)
        assert ndcg_at_k(["a", "b"], {"a"}, 2) == pytest.approx(dcg / idcg)

    def test_single_hit_at_2(self):
        dcg = 1 / math.log2(3)
        idcg = 1 / math.log2(2)
        assert ndcg_at_k(["x", "a"], {"a"}, 2) == pytest.approx(dcg / idcg)

    def test_no_hits(self):
        assert ndcg_at_k(["x", "y"], {"a"}, 2) == 0.0

    def test_empty_relevant(self):
        assert ndcg_at_k(["a", "b"], set(), 2) == 0.0

    def test_k_zero(self):
        assert ndcg_at_k(["a"], {"a"}, 0) == 0.0

    def test_more_relevant_than_k(self):
        # 3 relevant but k=2: idcg uses min(relevant, k) = 2
        recs = ["a", "b"]
        relevant = {"a", "b", "c"}
        dcg = 1 / math.log2(2) + 1 / math.log2(3)
        idcg = 1 / math.log2(2) + 1 / math.log2(3)
        assert ndcg_at_k(recs, relevant, 2) == pytest.approx(dcg / idcg)


# ---------------------------------------------------------------- map@k
class TestMapAtK:
    def test_perfect_ranking(self):
        # All relevant items at the top
        assert map_at_k(["a", "b", "c"], {"a", "b"}, 3) == pytest.approx(1.0)

    def test_all_relevant(self):
        # Everything recommended is relevant
        assert map_at_k(["a", "b"], {"a", "b"}, 2) == pytest.approx(1.0)

    def test_one_hit(self):
        # "a" at position 2: AP = (1/2) / min(1, 3) = 0.5
        assert map_at_k(["x", "a", "y"], {"a"}, 3) == pytest.approx(0.5)

    def test_two_hits_non_contiguous(self):
        # "a" at pos 1 (prec=1/1), "c" at pos 3 (prec=2/3)
        # AP = (1 + 2/3) / 2 = 5/6
        assert map_at_k(["a", "x", "c"], {"a", "c"}, 3) == pytest.approx(5 / 6)

    def test_no_hits(self):
        assert map_at_k(["x", "y"], {"a"}, 2) == 0.0

    def test_empty_relevant(self):
        assert map_at_k(["a"], set(), 1) == 0.0

    def test_k_zero(self):
        assert map_at_k(["a"], {"a"}, 0) == 0.0


# ---------------------------------------------------------------- hit_rate@k
class TestHitRateAtK:
    def test_hit(self):
        assert hit_rate_at_k(["a", "b", "c"], {"b"}, 3) == 1.0

    def test_miss(self):
        assert hit_rate_at_k(["a", "b"], {"c"}, 2) == 0.0

    def test_hit_in_first(self):
        assert hit_rate_at_k(["a", "b"], {"a"}, 1) == 1.0

    def test_hit_beyond_k(self):
        assert hit_rate_at_k(["a", "b", "c"], {"c"}, 2) == 0.0

    def test_empty_relevant(self):
        assert hit_rate_at_k(["a"], set(), 1) == 0.0

    def test_k_zero(self):
        assert hit_rate_at_k(["a"], {"a"}, 0) == 0.0


# ---------------------------------------------------------------- coverage
class TestCoverage:
    def test_full_coverage(self):
        assert coverage([["a", "b"], ["c"]], 3) == pytest.approx(1.0)

    def test_partial_coverage(self):
        assert coverage([["a", "b"], ["a", "c"]], 5) == pytest.approx(3 / 5)

    def test_empty_catalogue(self):
        assert coverage([["a"]], 0) == 0.0

    def test_empty_recommendations(self):
        assert coverage([], 10) == 0.0

    def test_duplicate_items(self):
        assert coverage([["a", "a", "b"]], 3) == pytest.approx(2 / 3)


# ---------------------------------------------------------------- diversity
class TestDiversity:
    def test_identical_skills(self):
        # All items share the same skills → Jaccard distance = 0
        skills = {"a": ["python"], "b": ["python"], "c": ["python"]}
        assert diversity([["a", "b", "c"]], skills) == pytest.approx(0.0)

    def test_disjoint_skills(self):
        # All items have different skills → Jaccard distance = 1
        skills = {"a": ["python"], "b": ["java"], "c": ["rust"]}
        assert diversity([["a", "b", "c"]], skills) == pytest.approx(1.0)

    def test_partial_overlap(self):
        skills = {"a": ["python", "ml"], "b": ["python", "data"]}
        # intersection={python}, union={python, ml, data} → distance = 1 - 1/3 = 2/3
        assert diversity([["a", "b"]], skills) == pytest.approx(2 / 3)

    def test_single_item_list(self):
        # Can't compute pairwise distance with one item
        assert diversity([["a"]], {"a": ["python"]}) == 0.0

    def test_empty_recommendations(self):
        assert diversity([], {"a": ["python"]}) == 0.0

    def test_missing_skills(self):
        # Items not in item_skills → empty sets → Jaccard distance = 0
        assert diversity([["x", "y"]], {}) == pytest.approx(0.0)

    def test_multiple_lists_averaged(self):
        skills = {"a": ["python"], "b": ["java"], "c": ["python"], "d": ["python"]}
        # List 1: a-b distance=1.0 → div=1.0
        # List 2: c-d distance=0.0 → div=0.0
        # Average = 0.5
        assert diversity([["a", "b"], ["c", "d"]], skills) == pytest.approx(0.5)
