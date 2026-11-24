"""
Offline evaluation harness: temporal train/test split, per-user evaluation,
and side-by-side comparison of the hybrid model against baselines.
"""
from __future__ import annotations

import logging
from collections import defaultdict

import numpy as np

from app.model import Model, item_text
from app.recommender import rank as model_rank
from app.schemas import (
    Candidate,
    HistoryEntry,
    KnownSkill,
    Mastery,
    Profile,
    RecommendRequest,
)

from eval.baselines import ContentOnlyBaseline, PopularityBaseline
from eval.metrics import (
    coverage,
    diversity,
    hit_rate_at_k,
    map_at_k,
    ndcg_at_k,
    precision_at_k,
    recall_at_k,
)

log = logging.getLogger("leap.eval")


class OfflineEvaluator:
    """Hold-out evaluation for the LEAP recommender.

    For every user with ≥ ``min_interactions`` interactions the last
    ``test_ratio`` fraction of rows is held out as the test set.
    """

    def __init__(
        self,
        catalogue: list[dict],
        interactions: list[dict],
        test_ratio: float = 0.2,
        seed: int = 42,
        min_interactions: int = 5,
    ) -> None:
        self.catalogue = catalogue
        self.item_index: dict[str, dict] = {str(c["_id"]): c for c in catalogue}
        self.item_skills: dict[str, list[str]] = {
            str(c["_id"]): c.get("skills", []) for c in catalogue
        }
        self.test_ratio = test_ratio
        self.seed = seed
        self.min_interactions = min_interactions

        self.train_interactions: list[dict] = []
        self.test_sets: dict[str, set[str]] = {}  # userId -> set of held-out itemIds
        self.user_train: dict[str, list[dict]] = {}  # userId -> training rows

        self._split(interactions)

    # ---------------------------------------------------------------- split
    def _split(self, interactions: list[dict]) -> None:
        rng = np.random.RandomState(self.seed)

        per_user: dict[str, list[dict]] = defaultdict(list)
        for row in interactions:
            uid = str(row["userId"])
            per_user[uid].append(row)

        train_all: list[dict] = []
        test_sets: dict[str, set[str]] = {}
        user_train: dict[str, list[dict]] = {}

        for uid, rows in per_user.items():
            if len(rows) < self.min_interactions:
                train_all.extend(rows)
                user_train[uid] = rows
                continue

            # Shuffle to avoid ordering bias, then split
            indices = list(range(len(rows)))
            rng.shuffle(indices)
            n_test = max(1, int(len(rows) * self.test_ratio))

            test_idx = set(indices[:n_test])
            u_train = [rows[i] for i in range(len(rows)) if i not in test_idx]
            u_test = [rows[i] for i in test_idx]

            train_all.extend(u_train)
            user_train[uid] = u_train
            test_sets[uid] = {str(r["itemId"]) for r in u_test}

        self.train_interactions = train_all
        self.test_sets = test_sets
        self.user_train = user_train
        log.info(
            "split: %d train rows, %d test users, %d total test items",
            len(train_all),
            len(test_sets),
            sum(len(v) for v in test_sets.values()),
        )

    # ---------------------------------------------------------------- helpers
    def _build_request(self, uid: str, train_rows: list[dict], limit: int) -> RecommendRequest:
        """Build a RecommendRequest from stored training data for one user."""
        completed = {str(r["itemId"]) for r in train_rows if r.get("weight", 0) >= 1.0}
        history = [HistoryEntry(itemId=str(r["itemId"]), weight=float(r.get("weight", 1.0))) for r in train_rows]

        # Build a minimal profile
        known_skills: list[str] = []
        for r in train_rows:
            iid = str(r["itemId"])
            if iid in self.item_index:
                known_skills.extend(self.item_index[iid].get("skills", []))
        unique_skills = list(set(known_skills))

        profile = Profile(
            userId=uid,
            goals=[],
            goalSkills=unique_skills[:10],
            knownSkills=[KnownSkill(skill=s) for s in unique_skills[:10]],
            mastery=[Mastery(skill=s, score=0.3) for s in unique_skills[:10]],
            difficultyLevel="intermediate",
            interactionCount=len(train_rows),
        )

        candidates = [
            Candidate(**{**c, "_id": str(c["_id"])})
            for c in self.catalogue
            if str(c["_id"]) not in completed
        ]

        return RecommendRequest(
            userId=uid,
            profile=profile,
            candidateItems=candidates,
            history=history,
            completedItemIds=list(completed),
            limit=limit,
        )

    def _aggregate_metrics(
        self, per_user: list[dict], all_recommended: list[list[str]], k_values: list[int]
    ) -> dict:
        result: dict = {}
        for k in k_values:
            k_results = [u[k] for u in per_user]
            result[f"@{k}"] = {
                metric: round(float(np.mean([r[metric] for r in k_results])), 4)
                for metric in ["precision", "recall", "ndcg", "map", "hit_rate"]
            }
        result["coverage"] = round(coverage(all_recommended, len(self.catalogue)), 4)
        result["diversity"] = round(diversity(all_recommended, self.item_skills), 4)
        result["n_test_users"] = len(per_user)
        return result

    # ---------------------------------------------------------------- evaluate
    def evaluate_model(self, model: Model, k_values: list[int] | None = None) -> dict:
        if k_values is None:
            k_values = [5, 10, 20]
        max_k = max(k_values)

        per_user: list[dict] = []
        all_recommended: list[list[str]] = []

        for uid, relevant in self.test_sets.items():
            train_rows = self.user_train.get(uid, [])
            req = self._build_request(uid, train_rows, limit=max_k)
            if not req.candidateItems:
                continue

            result = model_rank(model, req)
            recommended = [item["itemId"] for item in result["items"]]
            all_recommended.append(recommended)

            u_metrics: dict = {}
            for k in k_values:
                u_metrics[k] = {
                    "precision": precision_at_k(recommended, relevant, k),
                    "recall": recall_at_k(recommended, relevant, k),
                    "ndcg": ndcg_at_k(recommended, relevant, k),
                    "map": map_at_k(recommended, relevant, k),
                    "hit_rate": hit_rate_at_k(recommended, relevant, k),
                }
            per_user.append(u_metrics)

        if not per_user:
            return {"error": "no test users with interactions"}

        return self._aggregate_metrics(per_user, all_recommended, k_values)

    # ---------------------------------------------------------------- baselines
    def evaluate_baselines(self, k_values: list[int] | None = None) -> dict:
        if k_values is None:
            k_values = [5, 10, 20]
        max_k = max(k_values)

        pop = PopularityBaseline()
        content = ContentOnlyBaseline()
        content.fit(self.catalogue)

        results: dict = {}
        for name, ranker in [("popularity", pop), ("content_only", content)]:
            per_user: list[dict] = []
            all_recommended: list[list[str]] = []

            for uid, relevant in self.test_sets.items():
                train_rows = self.user_train.get(uid, [])
                completed = {str(r["itemId"]) for r in train_rows if r.get("weight", 0) >= 1.0}
                candidates = [c for c in self.catalogue if str(c["_id"]) not in completed]

                if isinstance(ranker, PopularityBaseline):
                    recommended = ranker.rank(candidates, max_k)
                else:
                    # Build profile text from training items
                    profile_text = " ".join(
                        item_text(self.item_index[str(r["itemId"])])
                        for r in train_rows
                        if str(r["itemId"]) in self.item_index
                    )
                    recommended = ranker.rank(profile_text, candidates, max_k)

                all_recommended.append(recommended)
                u_metrics: dict = {}
                for k in k_values:
                    u_metrics[k] = {
                        "precision": precision_at_k(recommended, relevant, k),
                        "recall": recall_at_k(recommended, relevant, k),
                        "ndcg": ndcg_at_k(recommended, relevant, k),
                        "map": map_at_k(recommended, relevant, k),
                        "hit_rate": hit_rate_at_k(recommended, relevant, k),
                    }
                per_user.append(u_metrics)

            if per_user:
                results[name] = self._aggregate_metrics(per_user, all_recommended, k_values)

        return results

    # ---------------------------------------------------------------- compare
    def compare(self, model: Model, k_values: list[int] | None = None) -> dict:
        if k_values is None:
            k_values = [5, 10, 20]
        return {
            "hybrid_model": self.evaluate_model(model, k_values),
            "baselines": self.evaluate_baselines(k_values),
        }
