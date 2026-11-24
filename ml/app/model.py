"""
The fitted model: a TF-IDF content space over the catalogue and an item-item
collaborative-filtering similarity matrix over the implicit-feedback matrix.

Fitting pulls both datasets from the LEAP API over API-key auth. If the API is
unreachable the model fits a content-only space from whatever candidates it is
given, so a recommendation request never fails just because the server is down.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import urllib.request
from datetime import datetime, timezone

import numpy as np
from scipy.sparse import csr_matrix
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize

from . import config
from .als import ALSResult, ImplicitALS, score_learner_history

log = logging.getLogger("leap.ml")


def item_text(item: dict) -> str:
    """Skills are repeated so they carry more weight than incidental description words."""
    skills = " ".join(s.replace("-", " ") for s in item.get("skills", []))
    return f"{item.get('title', '')} {item.get('description', '')} {skills} {skills}"


class Model:
    def __init__(self) -> None:
        self.version: str | None = None
        self.trained_at: str | None = None
        self.source = "unfitted"
        self.items: dict[str, dict] = {}
        self.ids: list[str] = []
        self.index: dict[str, int] = {}
        self.vectorizer: TfidfVectorizer | None = None
        self.content = None          # sparse (n_items x vocab), rows L2-normalised
        self.cf_sim: np.ndarray | None = None  # dense (n_items x n_items), diagonal zeroed
        self.item_factors: np.ndarray | None = None  # (n_items x n_factors) L2-normalised
        self.user_factors: np.ndarray | None = None  # (n_users x n_factors)
        self.als_result: ALSResult | None = None
        self.cf_method = "als"
        self.interaction_rows = 0
        self._lock = threading.Lock()

    @property
    def fitted(self) -> bool:
        return self.vectorizer is not None

    # ------------------------------------------------------------ fitting
    def fit(self, catalogue: list[dict], interactions: list[dict], source: str) -> None:
        if not catalogue:
            raise ValueError("cannot fit on an empty catalogue")
        ids = [str(i["_id"]) for i in catalogue]
        index = {item_id: k for k, item_id in enumerate(ids)}

        vectorizer = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, stop_words="english")
        content = vectorizer.fit_transform([item_text(i) for i in catalogue])

        # Implicit Alternating Least Squares (ALS) matrix factorisation.
        # Decomposes user x item implicit interactions into compact latent factor vectors,
        # scaling past dense n^2 pairwise similarity matrices to O(n_items * k).
        k_factors = config.ALS_FACTORS
        item_factors = np.zeros((len(ids), k_factors), dtype=np.float64)
        user_factors = np.zeros((0, k_factors), dtype=np.float64)
        als_result = None
        cf_sim = np.zeros((len(ids), len(ids)), dtype=np.float64)

        rows = [r for r in interactions if str(r["itemId"]) in index and r.get("weight", 0) > 0]
        if rows:
            users = {u: k for k, u in enumerate(sorted({str(r["userId"]) for r in rows}))}
            m = csr_matrix(
                ([float(r["weight"]) for r in rows],
                 ([users[str(r["userId"])] for r in rows], [index[str(r["itemId"])] for r in rows])),
                shape=(len(users), len(ids)),
            )
            als = ImplicitALS(
                n_factors=config.ALS_FACTORS,
                regularization=config.ALS_REGULARIZATION,
                iterations=config.ALS_ITERATIONS,
                alpha=config.ALS_ALPHA,
                random_state=42,
            )
            als_result = als.fit(m)
            item_factors = als_result.normalized_item_factors
            user_factors = als_result.user_factors
            # Compute item-item cosine similarity in latent space: (N x k) @ (k x N)
            cf_sim = (item_factors @ item_factors.T).astype(np.float64)
            np.fill_diagonal(cf_sim, 0.0)

        with self._lock:
            self.items = {str(i["_id"]): i for i in catalogue}
            self.ids, self.index = ids, index
            self.vectorizer, self.content = vectorizer, content
            self.cf_sim, self.item_factors, self.user_factors = cf_sim, item_factors, user_factors
            self.als_result = als_result
            self.interaction_rows = len(rows)
            self.source = source
            self.trained_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
            self.version = f"hybrid-v1.{datetime.now(timezone.utc):%Y%m%d%H%M%S}"
        self._write_registry()
        log.info("model fitted: %s items, %s interactions, source=%s", len(ids), len(rows), source)

    def fit_from_api(self) -> None:
        catalogue = _get(f"{config.LEAP_API_URL}/internal/catalogue")["items"]
        interactions = _get(f"{config.LEAP_API_URL}/internal/interactions")["rows"]
        self.fit(catalogue, interactions, source="leap-api")

    def ensure_fitted(self, fallback_catalogue: list[dict]) -> None:
        if self.fitted:
            return
        try:
            self.fit_from_api()
        except Exception as exc:  # noqa: BLE001 - any failure means "fit content-only"
            log.warning("could not reach LEAP API (%s); fitting content-only model", exc)
            self.fit(fallback_catalogue, [], source="candidates-only")

    # ------------------------------------------------------------ vectors
    def vector(self, item: dict):
        """Content vector for an item; unseen items are projected into the fitted space."""
        k = self.index.get(str(item.get("_id", item.get("id"))))
        if k is not None:
            return self.content[k]
        return normalize(self.vectorizer.transform([item_text(item)]))

    def text_vector(self, text: str):
        return normalize(self.vectorizer.transform([text]))

    def score_cf_history(self, history: list[tuple[str, float]], candidate_ids: list[str]) -> np.ndarray:
        """
        Fast O(len(cands) * k) latent factor scoring directly from learner history,
        bypassing dense pairwise matrix allocations.
        """
        if self.item_factors is None or not history or not candidate_ids:
            return np.zeros(len(candidate_ids), dtype=np.float64)
        hist_pairs = [(self.index[i], float(w)) for i, w in history if i in self.index]
        if not hist_pairs:
            return np.zeros(len(candidate_ids), dtype=np.float64)
        h_idx, h_weights = zip(*hist_pairs)
        c_idx = [self.index[c] for c in candidate_ids if c in self.index]
        if not c_idx:
            return np.zeros(len(candidate_ids), dtype=np.float64)
        raw_scores = score_learner_history(self.item_factors, h_idx, h_weights, c_idx)
        score_map = dict(zip([c for c in candidate_ids if c in self.index], raw_scores))
        return np.array([score_map.get(c, 0.0) for c in candidate_ids], dtype=np.float64)

    # ------------------------------------------------------------ registry
    def _write_registry(self) -> None:
        try:
            os.makedirs(config.REGISTRY_DIR, exist_ok=True)
            meta = {
                "version": self.version, "trainedAt": self.trained_at, "source": self.source,
                "algorithm": "hybrid: tfidf content + ALS matrix-factorisation CF + skill gap + popularity, MMR re-rank",
                "items": len(self.ids), "interactionRows": self.interaction_rows,
                "cf": {"method": "als", "factors": config.ALS_FACTORS, "iterations": config.ALS_ITERATIONS},
            }
            with open(os.path.join(config.REGISTRY_DIR, "active.json"), "w", encoding="utf-8") as f:
                json.dump(meta, f, indent=2)
        except OSError as exc:
            log.warning("registry write failed: %s", exc)

    def describe(self) -> dict:
        return {
            "version": self.version, "trainedAt": self.trained_at, "source": self.source,
            "fitted": self.fitted, "items": len(self.ids), "interactionRows": self.interaction_rows,
            "cfMethod": self.cf_method, "latentFactors": config.ALS_FACTORS,
        }


def _get(url: str) -> dict:
    req = urllib.request.Request(url, headers={"X-API-Key": config.LEAP_API_KEY})
    with urllib.request.urlopen(req, timeout=5) as resp:  # noqa: S310 - URL comes from config
        return json.loads(resp.read())


MODEL = Model()
