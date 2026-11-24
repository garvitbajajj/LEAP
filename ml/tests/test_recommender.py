import pytest
from fastapi.testclient import TestClient

from app.model import Model
from app.recommender import WEIGHTS, rank
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
# Learners who finish py1 tend to go on to py2 and pd - the CF signal under test.
INTERACTIONS = [
    {"userId": f"u{u}", "itemId": i, "weight": 3}
    for u in range(6) for i in ("py1", "py2", "pd")
] + [{"userId": "w1", "itemId": "web", "weight": 3}, {"userId": "w1", "itemId": "sql1", "weight": 1}]


@pytest.fixture()
def model():
    m = Model()
    m.fit(CATALOGUE, INTERACTIONS, source="test")
    return m


def request(candidates, history=(), completed=(), goals=("data-analyst",),
            goal_skills=("python-basics", "sql", "data-wrangling"), limit=10):
    return RecommendRequest(
        userId="me",
        profile={"userId": "me", "goals": list(goals), "goalSkills": list(goal_skills),
                 "mastery": [], "difficultyLevel": "beginner"},
        candidateItems=[c for c in CATALOGUE if c["_id"] in candidates],
        history=[{"itemId": i, "weight": w} for i, w in history],
        completedItemIds=list(completed),
        limit=limit,
    )


def test_learner_with_little_history_gets_cold_start(model):
    out = rank(model, request(["py1", "sql1", "web"]))
    assert out["strategy"] == "cold_start"
    assert all(f["factor"] != "cf_similarity" for i in out["items"] for f in i["factors"])


def test_learner_with_history_gets_hybrid_and_cf_signal(model):
    hist = [("py1", 3), ("sql1", 1), ("web", 1)]
    out = rank(model, request(["py2", "sql2", "pd"], history=hist, completed=["py1", "sql1"]))
    assert out["strategy"] == "hybrid"
    assert out["items"][0]["itemId"] == "py2"  # co-taken with py1 and on-goal


def test_goal_relevant_items_outrank_off_goal_items(model):
    out = rank(model, request(["sql1", "web"]))
    assert [i["itemId"] for i in out["items"]] == ["sql1", "web"]


def test_completed_prerequisite_leads_the_explanation(model):
    out = rank(model, request(["py2"], history=[("py1", 3)], completed=["py1"]))
    assert out["items"][0]["reason"].startswith("Builds on Python Intro, which you completed")


def test_brand_new_item_is_still_recommendable(model):
    new = {"_id": "new1", "title": "Advanced SQL Window Functions", "description": "sql analytics",
           "skills": ["sql"], "prerequisites": [], "difficulty": 2, "popularity": 0.0}
    req = request(["sql1"])
    req.candidateItems.append(type(req.candidateItems[0])(**new))
    ids = [i["itemId"] for i in rank(model, req)["items"]]
    assert "new1" in ids


def test_topic_cap_limits_one_skill_dominating(model):
    out = rank(model, request(["py1", "py2", "sql1", "sql2", "pd", "web"], limit=5))
    primaries = [next(c for c in CATALOGUE if c["_id"] == i["itemId"])["skills"][0] for i in out["items"]]
    assert max(primaries.count(s) for s in set(primaries)) <= 2  # ceil(5 * 0.4)


def test_ranking_is_deterministic(model):
    req = request(["py1", "py2", "sql1", "pd", "web"], history=[("py1", 3), ("sql1", 2), ("web", 1)])
    assert rank(model, req) == rank(model, req)


def test_scores_and_ranks_are_well_formed(model):
    out = rank(model, request(["py1", "sql1", "web"]))
    assert [i["rank"] for i in out["items"]] == [1, 2, 3]
    assert all(0 <= i["score"] <= 1 for i in out["items"])
    assert all(len(i["factors"]) <= 3 and i["reason"] for i in out["items"])


def test_empty_candidate_pool_returns_no_items(model):
    assert rank(model, request([]))["items"] == []


def test_weights_sum_to_one():
    for w in WEIGHTS.values():
        assert sum(w.values()) == pytest.approx(1.0)


# ---------------------------------------------------------------- HTTP layer
@pytest.fixture()
def client():
    from app.main import app
    return TestClient(app)


def test_health_is_public(client):
    assert client.get("/health").json()["status"] == "ok"


def test_recommend_requires_api_key(client):
    assert client.post("/ml/v1/recommend", json={}).status_code == 401
    assert client.post("/ml/v1/recommend", json={}, headers={"X-API-Key": "wrong"}).status_code == 401


def test_recommend_honours_the_c3_contract(client):
    body = request(["py1", "sql1", "web"]).model_dump(by_alias=True)
    res = client.post("/ml/v1/recommend", json=body, headers={"X-API-Key": "test-key"})
    assert res.status_code == 200
    data = res.json()
    assert set(data) == {"modelVersion", "strategy", "items"}
    assert set(data["items"][0]) == {"itemId", "score", "rank", "factors", "reason"}


def test_metrics_are_prometheus_text(client):
    client.get("/health")
    assert "ml_requests_total" in client.get("/metrics").text
