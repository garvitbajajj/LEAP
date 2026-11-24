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

        # Item-item cosine similarity over the user x item engagement matrix.
        # ponytail: dense n^2 similarity is fine for a few thousand items; switch to
        # sparse top-k neighbours (or ALS factors) past ~20k.
        cf_sim = np.zeros((len(ids), len(ids)))
        rows = [r for r in interactions if str(r["itemId"]) in index and r.get("weight", 0) > 0]
        if rows:
            users = {u: k for k, u in enumerate(sorted({str(r["userId"]) for r in rows}))}
            m = csr_matrix(
                ([float(r["weight"]) for r in rows],
                 ([users[str(r["userId"])] for r in rows], [index[str(r["itemId"])] for r in rows])),
                shape=(len(users), len(ids)),
            )
            cols = normalize(m, axis=0)
            cf_sim = (cols.T @ cols).toarray()
            np.fill_diagonal(cf_sim, 0.0)

        with self._lock:
            self.items = {str(i["_id"]): i for i in catalogue}
            self.ids, self.index = ids, index
            self.vectorizer, self.content, self.cf_sim = vectorizer, content, cf_sim
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

    # ------------------------------------------------------------ registry
    def _write_registry(self) -> None:
        try:
            os.makedirs(config.REGISTRY_DIR, exist_ok=True)
            meta = {
                "version": self.version, "trainedAt": self.trained_at, "source": self.source,
                "algorithm": "hybrid: tfidf content + item-item CF + skill gap + popularity, MMR re-rank",
                "items": len(self.ids), "interactionRows": self.interaction_rows,
            }
            with open(os.path.join(config.REGISTRY_DIR, "active.json"), "w", encoding="utf-8") as f:
                json.dump(meta, f, indent=2)
        except OSError as exc:
            log.warning("registry write failed: %s", exc)

    def describe(self) -> dict:
        return {
            "version": self.version, "trainedAt": self.trained_at, "source": self.source,
            "fitted": self.fitted, "items": len(self.ids), "interactionRows": self.interaction_rows,
        }


def _get(url: str) -> dict:
    req = urllib.request.Request(url, headers={"X-API-Key": config.LEAP_API_KEY})
    with urllib.request.urlopen(req, timeout=5) as resp:  # noqa: S310 - URL comes from config
        return json.loads(resp.read())


MODEL = Model()
