import numpy as np
import pytest
from scipy import sparse

from app.als import ImplicitALS, score_learner_history


def test_als_empty_matrix():
    als = ImplicitALS(n_factors=8, iterations=5)
    empty = sparse.csr_matrix((0, 0))
    res = als.fit(empty)
    assert res.user_factors.shape == (0, 8)
    assert res.item_factors.shape == (0, 8)

    zero_data = sparse.csr_matrix((5, 10))
    res2 = als.fit(zero_data)
    assert res2.user_factors.shape == (5, 8)
    assert res2.item_factors.shape == (10, 8)
    assert np.all(res2.user_factors == 0.0)


def test_als_factor_shapes_and_normalization():
    # 4 users, 5 items
    data = np.array([
        [1, 2, 0, 0, 0],
        [2, 3, 0, 0, 0],
        [0, 0, 1, 2, 0],
        [0, 0, 2, 1, 0],
    ], dtype=float)
    csr = sparse.csr_matrix(data)
    als = ImplicitALS(n_factors=4, iterations=10, random_state=42)
    res = als.fit(csr)

    assert res.user_factors.shape == (4, 4)
    assert res.item_factors.shape == (5, 4)
    assert res.normalized_item_factors.shape == (5, 4)

    # Observed items (0..3) have unit L2 norms
    norms = np.linalg.norm(res.normalized_item_factors[:4], axis=1)
    assert np.allclose(norms, 1.0, atol=1e-5)

    # Item 4 was never observed, its factors should remain zero
    assert np.allclose(res.item_factors[4], 0.0)
    assert np.allclose(res.normalized_item_factors[4], 0.0)


def test_als_learns_latent_patterns():
    # Cluster 1: users 0,1 interact with items 0,1
    # Cluster 2: users 2,3 interact with items 2,3
    data = np.array([
        [3, 3, 0, 0],
        [2, 3, 0, 0],
        [0, 0, 3, 3],
        [0, 0, 2, 3],
    ], dtype=float)
    csr = sparse.csr_matrix(data)
    als = ImplicitALS(n_factors=8, iterations=15, alpha=40.0, random_state=42)
    res = als.fit(csr)

    factors = res.normalized_item_factors
    # Sim within cluster 1 (item 0 and 1) should be high
    sim_0_1 = float(factors[0] @ factors[1])
    # Sim across clusters (item 0 and 2) should be low
    sim_0_2 = float(factors[0] @ factors[2])

    assert sim_0_1 > 0.8
    assert sim_0_1 > sim_0_2


def test_als_score_learner_history():
    data = np.array([
        [3, 3, 0],
        [3, 2, 0],
        [0, 0, 3],
    ], dtype=float)
    csr = sparse.csr_matrix(data)
    als = ImplicitALS(n_factors=6, iterations=12, random_state=42)
    res = als.fit(csr)

    # Learner engaged with item 0
    scores = score_learner_history(
        normalized_item_factors=res.normalized_item_factors,
        history_indices=[0],
        history_weights=[1.0],
        candidate_indices=[1, 2],
    )
    assert len(scores) == 2
    # Item 1 (co-occurred with 0) should score higher than item 2 (separate cluster)
    assert scores[0] > scores[1]


def test_als_reproducibility():
    data = sparse.csr_matrix(np.random.RandomState(1).poisson(0.5, (10, 8)).astype(float))
    als1 = ImplicitALS(n_factors=4, iterations=5, random_state=99)
    als2 = ImplicitALS(n_factors=4, iterations=5, random_state=99)

    res1 = als1.fit(data)
    res2 = als2.fit(data)

    assert np.allclose(res1.user_factors, res2.user_factors)
    assert np.allclose(res1.item_factors, res2.item_factors)
