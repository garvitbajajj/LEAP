import numpy as np
import pytest

from app.model import Model
from app.recommender import rank
from app.schemas import RecommendRequest

CATALOGUE = [
    {"_id": "py1", "title": "Python Intro", "description": "variables and loops", "skills": ["python-basics"],
     "prerequisites": [], "difficulty": 1, "popularity": 0.9},
    {"_id": "py2", "title": "Python Functions", "description": "functions and scope", "skills": ["python-basics"],
     "prerequisites": ["py1"], "difficulty": 2, "popularity": 0.7},
    {"_id": "sql1", "title": "SQL Basics", "description": "select queries on tables", "skills": ["sql"],
     "prerequisites": [], "difficulty": 1, "popularity": 0.5},
    {"_id": "sql2", "title": "SQL Joins", "description": "joins and group by", "skills": ["sql"],
     "prerequisites": ["sql1"], "difficulty": 3, "popularity": 0.4},
    {"_id": "pd", "title": "pandas Wrangling", "description": "dataframes cleaning", "skills": ["data-wrangling"],
     "prerequisites": ["py2"], "difficulty": 2, "popularity": 0.6},
    {"_id": "web", "title": "HTML Foundations", "description": "markup and css layout", "skills": ["html-css"],
     "prerequisites": [], "difficulty": 1, "popularity": 0.8},
]

INTERACTIONS = [
    {"userId": f"u{u}", "itemId": i, "weight": 3}
    for u in range(8) for i in ("py1", "py2", "pd")
] + [
    {"userId": f"w{u}", "itemId": i, "weight": 2}
    for u in range(5) for i in ("sql1", "sql2")
]


@pytest.fixture()
def als_model():
    m = Model()
    m.fit(CATALOGUE, INTERACTIONS, source="test-als")
    return m


def make_request(candidates, history=(), completed=(), goals=("data-analyst",),
                 goal_skills=("python-basics", "sql", "data-wrangling"), limit=10):
    return RecommendRequest(
        userId="test_learner",
        profile={"userId": "test_learner", "goals": list(goals), "goalSkills": list(goal_skills),
                 "mastery": [], "difficultyLevel": "beginner"},
        candidateItems=[c for c in CATALOGUE if c["_id"] in candidates],
        history=[{"itemId": i, "weight": w} for i, w in history],
        completedItemIds=list(completed),
        limit=limit,
    )


def test_als_model_fitting_attributes(als_model):
    assert als_model.fitted is True
    assert als_model.cf_method == "als"
    assert als_model.item_factors is not None
    assert als_model.item_factors.shape == (len(CATALOGUE), 16)
    assert als_model.user_factors is not None
    assert als_model.user_factors.shape[0] == 13  # 8 u-users + 5 w-users
    assert als_model.als_result is not None


def test_als_latent_factor_similarity(als_model):
    # Items py1, py2, and pd were strongly co-taken
    idx_py1 = als_model.index["py1"]
    idx_py2 = als_model.index["py2"]
    idx_sql1 = als_model.index["sql1"]

    sim_py1_py2 = float(als_model.item_factors[idx_py1] @ als_model.item_factors[idx_py2])
    sim_py1_sql1 = float(als_model.item_factors[idx_py1] @ als_model.item_factors[idx_sql1])

    assert sim_py1_py2 > sim_py1_sql1
    assert sim_py1_py2 > 0.5


def test_als_score_cf_history_direct(als_model):
    history = [("py1", 3.0)]
    candidate_ids = ["py2", "sql1", "unseen_item"]

    scores = als_model.score_cf_history(history, candidate_ids)
    assert len(scores) == 3
    # py2 should have highest affinity to py1 in ALS latent space
    assert scores[0] > scores[1]
    # unseen item gets 0 score
    assert scores[2] == 0.0


def test_als_recommender_hybrid_ranking(als_model):
    hist = [("py1", 3.0), ("sql1", 1.0), ("web", 1.0)]
    req = make_request(["py2", "sql2", "pd"], history=hist, completed=["py1"])

    out = rank(als_model, req)
    assert out["strategy"] == "hybrid"
    item_ids = [i["itemId"] for i in out["items"]]
    assert item_ids[0] == "py2"


def test_als_recommender_cf_explanation(als_model):
    # Candidate pd has no direct prerequisite completed, but strong CF affinity with py1 and py2
    hist = [("py1", 3.0), ("py2", 3.0), ("web", 1.0)]
    req = make_request(["pd"], history=hist, completed=[])

    out = rank(als_model, req)
    reason = out["items"][0]["reason"]
    # Either explains via CF pattern or skill gap fit for data-analyst
    assert "Learners who took" in reason or "Develops" in reason


def test_als_zero_interactions_graceful_handling():
    m = Model()
    m.fit(CATALOGUE, [], source="zero-interactions")
    assert m.fitted is True
    assert m.item_factors is not None
    assert np.all(m.item_factors == 0.0)

    req = make_request(["py1", "sql1"])
    out = rank(m, req)
    assert len(out["items"]) == 2
