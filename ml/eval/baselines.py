"""
Baseline recommenders for A/B comparison with the hybrid model.
"""
from __future__ import annotations

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize

from app.model import item_text


class PopularityBaseline:
    """Rank candidates by descending popularity score."""

    def rank(self, candidates: list[dict], k: int) -> list[str]:
        scored = sorted(candidates, key=lambda c: -float(c.get("popularity", 0)))
        return [str(c["_id"]) for c in scored[:k]]


class ContentOnlyBaseline:
    """Pure TF-IDF cosine similarity between a profile text and catalogue items."""

    def __init__(self) -> None:
        self.vectorizer: TfidfVectorizer | None = None
        self.catalogue: list[dict] = []
        self._content = None

    def fit(self, catalogue: list[dict]) -> None:
        self.catalogue = catalogue
        self.vectorizer = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, stop_words="english")
        self._content = self.vectorizer.fit_transform([item_text(c) for c in catalogue])

    def rank(self, profile_text: str, candidates: list[dict], k: int) -> list[str]:
        if not self.vectorizer or not candidates:
            return []
        cand_ids = {str(c["_id"]) for c in candidates}
        cat_index = {str(c["_id"]): i for i, c in enumerate(self.catalogue)}

        profile_vec = normalize(self.vectorizer.transform([profile_text]))

        scored: list[tuple[float, str]] = []
        for c in candidates:
            cid = str(c["_id"])
            if cid in cat_index:
                sim = float((profile_vec @ self._content[cat_index[cid]].T).toarray()[0, 0])
            else:
                vec = normalize(self.vectorizer.transform([item_text(c)]))
                sim = float((profile_vec @ vec.T).toarray()[0, 0])
            scored.append((sim, cid))

        scored.sort(key=lambda x: -x[0])
        return [cid for _, cid in scored[:k]]
