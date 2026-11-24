import builtins
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.embeddings import SentenceTransformerEncoder, TfidfEncoder, build_encoder
from app.model import MODEL, Model
from app.recommender import rank
from app.schemas import RecommendRequest


class FakeSentenceTransformer:
    """
    Deterministic semantic stub mapping concepts (even with zero shared words)
    into dense L2-normalised vectors so synonym retrieval is tested without
    downloading HuggingFace weights in CI.
    """

    def encode(self, texts, normalize_embeddings=True, convert_to_numpy=True):
        rows = []
        for t in texts:
            low = t.lower()
            # 4 semantic axes: [databases/sql, python/scripting, visualization, web]
            v = np.array([
                1.0 if any(k in low for k in ("sql", "relational", "database", "query", "tables")) else 0.0,
                1.0 if any(k in low for k in ("python", "scripting", "loop", "function")) else 0.0,
                1.0 if any(k in low for k in ("chart", "plot", "visual", "dashboard")) else 0.0,
                1.0 if any(k in low for k in ("html", "css", "markup", "browser")) else 0.0,
            ], dtype=np.float64)
            if np.linalg.norm(v) == 0:
                v = np.array([0.25, 0.25, 0.25, 0.25], dtype=np.float64)
            if normalize_embeddings:
                v = v / np.linalg.norm(v)
            rows.append(v)
        return np.vstack(rows)


CATALOGUE = [
    {"_id": "db1", "title": "Relational Tables Guide", "description": "normalization and schemas",
     "skills": ["databases"], "prerequisites": [], "difficulty": 1, "popularity": 0.4},
    {"_id": "web1", "title": "HTML Markup", "description": "tags and browser layout",
     "skills": ["html-css"], "prerequisites": [], "difficulty": 1, "popularity": 0.4},
    {"_id": "py1", "title": "Scripting Loops", "description": "iteration patterns",
     "skills": ["scripting"], "prerequisites": [], "difficulty": 1, "popularity": 0.4},
]


def test_sentence_transformer_encoder_produces_unit_dense_vectors():
    enc = SentenceTransformerEncoder(model_name="all-MiniLM-L6-v2", st_model=FakeSentenceTransformer())
    mat = enc.fit_transform(["Relational databases", "HTML browser layout"])
    assert isinstance(mat, np.ndarray)
    assert mat.shape == (2, 4)
    assert enc.name == "sentence-transformer"
    assert enc.dimensions == 4
    assert np.allclose(np.linalg.norm(mat, axis=1), 1.0)


def test_semantic_synonym_matching_beats_zero_lexical_overlap():
    enc = SentenceTransformerEncoder(model_name="all-MiniLM-L6-v2", st_model=FakeSentenceTransformer())
    m = Model()
    m.fit(CATALOGUE, [], source="test-st", encoder=enc)

    assert m.content_encoder == "sentence-transformer"
    assert m.embedding_model == "all-MiniLM-L6-v2"
    assert m.embedding_dim == 4
    assert m.describe()["contentEncoder"] == "sentence-transformer"

    # Learner goal mentions "sql" -> zero lexical overlap with "Relational Tables Guide",
    # yet semantic embedding matches db1 first.
    req = RecommendRequest(
        userId="u1",
        profile={"userId": "u1", "goals": ["data-analyst"], "goalSkills": ["sql"],
                 "mastery": [], "difficultyLevel": "beginner"},
        candidateItems=CATALOGUE,
        history=[],
        completedItemIds=[],
        limit=3,
    )
    out = rank(m, req)
    assert out["items"][0]["itemId"] == "db1"


def test_auto_encoder_falls_back_to_tfidf_when_package_missing(monkeypatch):
    from app import embeddings

    embeddings._ST_MODEL_CACHE.clear()
    real_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "sentence_transformers":
            raise ImportError("not installed")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)
    enc = build_encoder(backend="auto")
    assert isinstance(enc, TfidfEncoder)


def test_embed_endpoint_returns_dense_vector_with_sentence_transformer():
    from app.main import app

    prev = (MODEL.encoder, MODEL.content_encoder, MODEL.embedding_model, MODEL.embedding_dim, MODEL.content, MODEL.version)
    try:
        enc = SentenceTransformerEncoder(model_name="all-MiniLM-L6-v2", st_model=FakeSentenceTransformer())
        MODEL.fit(CATALOGUE, [], source="test-st", encoder=enc)
        client = TestClient(app)
        res = client.post("/ml/v1/embed", json={"texts": ["SQL query optimization"]}, headers={"X-API-Key": "test-key"})
        assert res.status_code == 200
        body = res.json()
        assert body["embeddings"][0]["encoder"] == "sentence-transformer"
        assert body["embeddings"][0]["dimensions"] == 4
        assert len(body["embeddings"][0]["embedding"]) == 4
    finally:
        (MODEL.encoder, MODEL.content_encoder, MODEL.embedding_model, MODEL.embedding_dim, MODEL.content, MODEL.version) = prev
