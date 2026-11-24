"""
Offline ranking metrics for the LEAP recommender evaluation harness.

All functions follow the convention:
    recommended  – ordered list of item IDs (best first)
    relevant     – set of item IDs the user actually engaged with
    k            – cut-off depth
"""
from __future__ import annotations

import math


# ---------------------------------------------------------------- per-user
def precision_at_k(recommended: list[str], relevant: set[str], k: int) -> float:
    """Fraction of the top-k recommendations that are relevant."""
    if k <= 0 or not relevant:
        return 0.0
    top = recommended[:k]
    if not top:
        return 0.0
    return sum(1 for r in top if r in relevant) / k


def recall_at_k(recommended: list[str], relevant: set[str], k: int) -> float:
    """Fraction of relevant items that appear in the top-k recommendations."""
    if k <= 0 or not relevant:
        return 0.0
    top = recommended[:k]
    return sum(1 for r in top if r in relevant) / len(relevant)


def ndcg_at_k(recommended: list[str], relevant: set[str], k: int) -> float:
    """Normalised DCG with binary relevance: rel_i ∈ {0,1}."""
    if k <= 0 or not relevant:
        return 0.0
    top = recommended[:k]
    dcg = sum(
        (1.0 / math.log2(i + 1)) for i, item in enumerate(top, start=1) if item in relevant
    )
    # ideal DCG: all relevant items ranked at the top
    ideal_hits = min(len(relevant), k)
    idcg = sum(1.0 / math.log2(i + 1) for i in range(1, ideal_hits + 1))
    return dcg / idcg if idcg > 0 else 0.0


def map_at_k(recommended: list[str], relevant: set[str], k: int) -> float:
    """Average Precision at k (AP@k)."""
    if k <= 0 or not relevant:
        return 0.0
    top = recommended[:k]
    hits = 0
    precision_sum = 0.0
    for i, item in enumerate(top, start=1):
        if item in relevant:
            hits += 1
            precision_sum += hits / i
    # Normalise by min(|relevant|, k) so users with many relevant items are
    # not penalised when k is small.
    return precision_sum / min(len(relevant), k)


def hit_rate_at_k(recommended: list[str], relevant: set[str], k: int) -> float:
    """1.0 if at least one relevant item appears in the top-k, else 0.0."""
    if k <= 0 or not relevant:
        return 0.0
    return 1.0 if any(r in relevant for r in recommended[:k]) else 0.0


# ---------------------------------------------------------------- aggregate
def coverage(all_recommended: list[list[str]], catalogue_size: int) -> float:
    """Fraction of the catalogue that appears in at least one recommendation list."""
    if catalogue_size <= 0 or not all_recommended:
        return 0.0
    unique = set()
    for recs in all_recommended:
        unique.update(recs)
    return len(unique) / catalogue_size


def diversity(all_recommended: list[list[str]], item_skills: dict[str, list[str]]) -> float:
    """Average intra-list diversity (ILD): mean pairwise Jaccard distance of
    skill sets within each recommendation list, averaged over all lists."""
    if not all_recommended:
        return 0.0

    list_divs: list[float] = []
    for recs in all_recommended:
        if len(recs) < 2:
            list_divs.append(0.0)
            continue
        pair_dists: list[float] = []
        for i in range(len(recs)):
            for j in range(i + 1, len(recs)):
                a = set(item_skills.get(recs[i], []))
                b = set(item_skills.get(recs[j], []))
                union = a | b
                if not union:
                    pair_dists.append(0.0)
                else:
                    pair_dists.append(1.0 - len(a & b) / len(union))
        list_divs.append(sum(pair_dists) / len(pair_dists))
    return sum(list_divs) / len(list_divs)
