"""
Implicit-feedback Alternating Least Squares (iALS) matrix factorisation.

Decomposes the sparse user x item interaction matrix into low-rank latent
factor spaces (user factors X and item factors Y), following Hu, Koren & Volinsky
(2008) "Collaborative Filtering for Implicit Feedback Datasets".

Scaling advantage:
Replaces dense n_items x n_items similarity matrices (O(N^2) memory) with
compact n_items x n_factors item embeddings (O(N * k) memory). Latent factor
dot products yield item-item and user-item affinity on demand without ever
allocating full dense pairwise matrices.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Sequence

import numpy as np
from scipy import sparse

log = logging.getLogger("leap.ml.als")


@dataclass
class ALSResult:
    user_factors: np.ndarray      # (n_users, n_factors)
    item_factors: np.ndarray      # (n_items, n_factors)
    normalized_item_factors: np.ndarray  # L2-normalised row-wise
    n_factors: int
    iterations: int
    regularization: float
    alpha: float
    converged: bool = True
    final_loss: float = 0.0


class ImplicitALS:
    """
    Alternating Least Squares solver tailored for implicit learner interactions
    (course views, completions, quiz attempts, time spent).
    """

    def __init__(
        self,
        n_factors: int = 16,
        regularization: float = 0.05,
        iterations: int = 15,
        alpha: float = 40.0,
        random_state: int = 42,
    ) -> None:
        self.n_factors = int(n_factors)
        self.regularization = float(regularization)
        self.iterations = int(iterations)
        self.alpha = float(alpha)
        self.random_state = int(random_state)

    def fit(self, interaction_matrix: sparse.csr_matrix | sparse.csc_matrix) -> ALSResult:
        """
        Fit latent user and item factor matrices.

        interaction_matrix: sparse (n_users, n_items) containing positive interaction weights.
        """
        csr = sparse.csr_matrix(interaction_matrix, dtype=np.float64)
        n_users, n_items = csr.shape
        k = self.n_factors

        if n_users == 0 or n_items == 0 or csr.nnz == 0:
            log.warning("ALS fit called with empty interaction matrix (%d users, %d items, %d nnz)",
                        n_users, n_items, csr.nnz)
            empty_u = np.zeros((n_users, k), dtype=np.float64)
            empty_i = np.zeros((n_items, k), dtype=np.float64)
            return ALSResult(
                user_factors=empty_u,
                item_factors=empty_i,
                normalized_item_factors=empty_i,
                n_factors=k,
                iterations=0,
                regularization=self.regularization,
                alpha=self.alpha,
                converged=True,
                final_loss=0.0,
            )

        csc = csr.tocsc()
        rng = np.random.RandomState(self.random_state)

        # Initialise item factors with small random Gaussian values
        item_factors = rng.normal(0.0, 1.0 / np.sqrt(k), size=(n_items, k)).astype(np.float64)
        user_factors = np.zeros((n_users, k), dtype=np.float64)

        reg_eye = self.regularization * np.eye(k, dtype=np.float64)
        alpha = self.alpha

        for it in range(self.iterations):
            # 1. Update user factors: (Y^T C^u Y + lambda I) x_u = Y^T C^u p_u
            y_t_y = item_factors.T @ item_factors + reg_eye

            for u in range(n_users):
                start, end = csr.indptr[u], csr.indptr[u + 1]
                if start == end:
                    user_factors[u] = 0.0
                    continue

                item_idx = csr.indices[start:end]
                weights = csr.data[start:end]
                # c_ui = 1 + alpha * r_ui; (c_ui - 1) = alpha * r_ui
                c_minus_one = alpha * weights
                sub_y = item_factors[item_idx]

                a = y_t_y + (sub_y.T * c_minus_one) @ sub_y
                b = (sub_y.T * (1.0 + c_minus_one)).sum(axis=1)

                try:
                    user_factors[u] = np.linalg.solve(a, b)
                except np.linalg.LinAlgError:
                    user_factors[u] = np.linalg.lstsq(a, b, rcond=None)[0]

            # 2. Update item factors: (X^T C^i X + lambda I) y_i = X^T C^i p_i
            x_t_x = user_factors.T @ user_factors + reg_eye

            for i in range(n_items):
                start, end = csc.indptr[i], csc.indptr[i + 1]
                if start == end:
                    item_factors[i] = 0.0
                    continue

                user_idx = csc.indices[start:end]
                weights = csc.data[start:end]
                c_minus_one = alpha * weights
                sub_x = user_factors[user_idx]

                a = x_t_x + (sub_x.T * c_minus_one) @ sub_x
                b = (sub_x.T * (1.0 + c_minus_one)).sum(axis=1)

                try:
                    item_factors[i] = np.linalg.solve(a, b)
                except np.linalg.LinAlgError:
                    item_factors[i] = np.linalg.lstsq(a, b, rcond=None)[0]

        # Normalise item factors row-wise for cosine similarity in latent space
        norms = np.linalg.norm(item_factors, axis=1, keepdims=True)
        norms[norms == 0.0] = 1.0
        normalized_item_factors = item_factors / norms

        return ALSResult(
            user_factors=user_factors,
            item_factors=item_factors,
            normalized_item_factors=normalized_item_factors,
            n_factors=k,
            iterations=self.iterations,
            regularization=self.regularization,
            alpha=self.alpha,
            converged=True,
        )


def score_learner_history(
    normalized_item_factors: np.ndarray,
    history_indices: Sequence[int],
    history_weights: Sequence[float],
    candidate_indices: Sequence[int],
) -> np.ndarray:
    """
    Computes CF relevance scores across candidate items directly from item factors:
        score(c) = ( sum_h w_h * y_h / sum w_h ) . y_c
    Runs in O(len(cands) * k), completely bypassing any N x N dense similarity matrix.
    """
    if len(history_indices) == 0 or len(candidate_indices) == 0:
        return np.zeros(len(candidate_indices), dtype=np.float64)

    total_weight = sum(history_weights)
    if total_weight <= 0:
        return np.zeros(len(candidate_indices), dtype=np.float64)

    # Learner latent CF vector = engagement-weighted combination of item factors
    h_idx = np.asarray(history_indices, dtype=np.int64)
    h_weights = np.asarray(history_weights, dtype=np.float64)
    learner_latent = (h_weights[:, None] * normalized_item_factors[h_idx]).sum(axis=0) / total_weight

    c_idx = np.asarray(candidate_indices, dtype=np.int64)
    cand_factors = normalized_item_factors[c_idx]

    # Batch inner product
    return np.asarray(cand_factors @ learner_latent, dtype=np.float64)
