"""
Content vector encoders for LEAP's hybrid recommender.

Supports dense semantic embeddings via `sentence-transformers` (e.g. all-MiniLM-L6-v2)
with automatic fallback to TF-IDF when sentence-transformers or model weights are
unavailable (e.g., lightweight CI environments).
"""
from __future__ import annotations

import logging
from typing import Protocol

import numpy as np
from scipy.sparse import issparse
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize

from . import config

log = logging.getLogger("leap.ml")
_ST_MODEL_CACHE: dict[str, object] = {}


def _load_sentence_transformer(model_name: str):
    if model_name in _ST_MODEL_CACHE:
        return _ST_MODEL_CACHE[model_name]
    from sentence_transformers import SentenceTransformer  # type: ignore[import-not-found]
    try:
        loaded = SentenceTransformer(model_name, local_files_only=True)
    except Exception:  # noqa: BLE001 - fall back to remote download when not cached
        loaded = SentenceTransformer(model_name)
    _ST_MODEL_CACHE[model_name] = loaded
    return loaded


def to_dense_1d(vec) -> np.ndarray:
    """Convert a 1-row sparse matrix or 1D/2D numpy array into a flat 1D float64 vector."""
    if issparse(vec):
        arr = vec.toarray()
    else:
        arr = np.asarray(vec, dtype=np.float64)
    return arr.ravel().astype(np.float64, copy=False)


def _l2_normalize_rows(mat: np.ndarray) -> np.ndarray:
    arr = np.asarray(mat, dtype=np.float64)
    if arr.ndim == 1:
        arr = arr.reshape(1, -1)
    norms = np.linalg.norm(arr, axis=1, keepdims=True)
    safe = np.where(norms > 1e-12, norms, 1.0)
    return arr / safe


class ContentEncoder(Protocol):
    name: str
    model_name: str
    dimensions: int

    def fit_transform(self, texts: list[str]): ...
    def transform(self, texts: list[str]): ...


class SentenceTransformerEncoder:
    """Dense semantic embeddings using a SentenceTransformer (or compatible `.encode()`) model."""

    name = "sentence-transformer"

    def __init__(self, model_name: str | None = None, st_model=None) -> None:
        self.model_name = model_name or config.EMBEDDING_MODEL
        if st_model is not None:
            self._model = st_model
        else:
            self._model = _load_sentence_transformer(self.model_name)
        self.dimensions = 0

    def _encode(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.dimensions), dtype=np.float64)
        raw = self._model.encode(texts, normalize_embeddings=True, convert_to_numpy=True)
        out = _l2_normalize_rows(raw)
        if out.shape[1] and self.dimensions == 0:
            self.dimensions = int(out.shape[1])
        return out

    def fit_transform(self, texts: list[str]) -> np.ndarray:
        return self._encode(texts)

    def transform(self, texts: list[str]) -> np.ndarray:
        return self._encode(texts)


class TfidfEncoder:
    """Sparse n-gram TF-IDF fallback encoder when sentence-transformers is unavailable."""

    name = "tfidf"
    model_name = "tfidf-ngram-1-2"

    def __init__(self) -> None:
        self.vectorizer = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, stop_words="english")
        self.dimensions = 0

    def fit_transform(self, texts: list[str]):
        mat = normalize(self.vectorizer.fit_transform(texts))
        self.dimensions = int(mat.shape[1])
        return mat

    def transform(self, texts: list[str]):
        return normalize(self.vectorizer.transform(texts))


def build_encoder(backend: str | None = None, model_name: str | None = None, st_model=None):
    """
    Build the configured content encoder.
    - `st_model` provided or `backend="sentence-transformer"` -> SentenceTransformerEncoder
    - `backend="auto"` (default) -> tries SentenceTransformerEncoder, falls back to TfidfEncoder
    - `backend="tfidf"` -> TfidfEncoder
    """
    if st_model is not None:
        return SentenceTransformerEncoder(model_name=model_name, st_model=st_model)

    selected = (backend or config.CONTENT_ENCODER or "auto").strip().lower()
    if selected == "tfidf":
        return TfidfEncoder()
    if selected == "sentence-transformer":
        return SentenceTransformerEncoder(model_name=model_name)

    try:
        return SentenceTransformerEncoder(model_name=model_name)
    except Exception as exc:  # noqa: BLE001 - optional dependency / offline fallback
        log.warning("sentence-transformers unavailable (%s); falling back to TF-IDF encoder", exc)
        return TfidfEncoder()
