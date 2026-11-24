"""
Hybrid ranking, diversity re-ranking and explanations. Pure: everything it needs
arrives in the request or the fitted model, so it is deterministic and testable.

    relevance = W_cf * cf + W_content * content + W_gap * skillGap
              + W_prereq * completedPrerequisite + W_pop * popularity

Each signal is scaled to [0, 1] across the candidate set before blending, so the
weights mean what they say. A learner with too little history gets cold-start weights
that lean on their declared goal and on popularity instead of collaborative signal.
"""
from __future__ import annotations

import math

import numpy as np

from .model import Model

WEIGHTS = {
    "hybrid": {"cf_similarity": 0.30, "content_similarity": 0.20, "skill_gap_fit": 0.25,
               "completed_prerequisite": 0.10, "popularity": 0.15},
    "cold_start": {"cf_similarity": 0.0, "content_similarity": 0.30, "skill_gap_fit": 0.35,
                   "completed_prerequisite": 0.10, "popularity": 0.25},
}
COLD_START_MIN_HISTORY = 3
MMR_LAMBDA = 0.75
TOPIC_CAP = 0.4
MASTERED = 0.85
TARGET_DIFFICULTY = {"beginner": 2, "intermediate": 3, "advanced": 4}
SKILL_LABELS = {"sql": "SQL", "html-css": "HTML and CSS", "web-apis": "web APIs", "git": "Git"}


def skill_label(skill: str) -> str:
    return SKILL_LABELS.get(skill, skill.replace("-", " "))


def goal_label(goal: str) -> str:
    return " ".join(w.upper() if w in {"ml", "ai"} else w.capitalize() for w in goal.split("-"))


def _minmax(x: np.ndarray) -> np.ndarray:
    span = x.max() - x.min() if len(x) else 0
    return (x - x.min()) / span if span > 1e-12 else np.zeros_like(x)


def rank(model: Model, req) -> dict:
    cands = [c.model_dump(by_alias=True) for c in req.candidateItems]
    if not cands:
        return {"modelVersion": model.version or "unfitted", "strategy": "cold_start", "items": []}

    profile = req.profile
    goal_skills = set(profile.goalSkills)
    mastery = {m.skill: m.score for m in profile.mastery}
    completed = set(req.completedItemIds)
    history = [(h.itemId, h.weight) for h in req.history if h.weight > 0]
    strategy = "hybrid" if len(history) >= COLD_START_MIN_HISTORY else "cold_start"
    weights = WEIGHTS[strategy]

    cand_vecs = [model.vector(c) for c in cands]

    # ---- content: learner vector = engagement-weighted history + declared goal and skills
    goal_text = " ".join(skill_label(s) for s in [*profile.goalSkills, *(k.skill for k in profile.knownSkills)])
    learner = model.text_vector(goal_text).toarray()[0] if goal_text.strip() else 0
    for item_id, w in history:
        if item_id in model.index:
            learner = learner + w * model.content[model.index[item_id]].toarray()[0]
    learner = np.asarray(learner, dtype=float)
    norm = np.linalg.norm(learner) if learner.ndim else 0
    content = np.array([float(v.toarray()[0] @ learner / norm) if norm else 0.0 for v in cand_vecs])

    # ---- collaborative: engagement-weighted item-item similarity to the learner's history
    hist_idx = [(model.index[i], w) for i, w in history if i in model.index]
    total_w = sum(w for _, w in hist_idx) or 1.0
    cf = np.array([
        sum(w * model.cf_sim[h, model.index[c["_id"]]] for h, w in hist_idx) / total_w
        if c["_id"] in model.index and hist_idx else 0.0
        for c in cands
    ])

    # ---- skill gap: goal skills the learner has not mastered, at a sensible difficulty
    target = TARGET_DIFFICULTY.get(profile.difficultyLevel, 2)
    gap = []
    for c in cands:
        needed = [s for s in c["skills"] if s in goal_skills]
        if not needed:
            gap.append(0.0)
            continue
        unmastered = sum(1 - min(mastery.get(s, 0.0), MASTERED) / MASTERED for s in needed) / len(needed)
        fit = 1 - min(abs(c["difficulty"] - target), 4) / 4
        gap.append(unmastered * (0.6 + 0.4 * fit))
    gap = np.array(gap)

    prereq = np.array([1.0 if any(p in completed for p in c["prerequisites"]) else 0.0 for c in cands])
    popularity = np.array([float(c.get("popularity") or 0.0) for c in cands])

    signals = {
        "cf_similarity": _minmax(cf),
        "content_similarity": _minmax(content),
        "skill_gap_fit": gap,
        "completed_prerequisite": prereq,
        "popularity": popularity,
    }
    contributions = {k: weights[k] * v for k, v in signals.items()}
    relevance = sum(contributions.values())

    order = _mmr(cands, cand_vecs, relevance, req.limit)
    items = []
    for pos, k in enumerate(order, start=1):
        factors = sorted(
            ({"factor": f, "contribution": round(float(contributions[f][k]), 4)} for f in contributions),
            key=lambda x: -x["contribution"],
        )
        top = [f for f in factors if f["contribution"] > 0][:3]
        items.append({
            "itemId": cands[k]["_id"],
            "score": round(float(relevance[k]), 4),
            "rank": pos,
            "factors": top,
            "reason": _explain(model, cands[k], top, history, completed, profile),
        })
    return {"modelVersion": model.version, "strategy": strategy, "items": items}


def _mmr(cands: list[dict], vecs: list, relevance: np.ndarray, limit: int) -> list[int]:
    """Maximal Marginal Relevance with a cap on how many picks share a primary skill."""
    sims = np.array([[float((a @ b.T).toarray()[0, 0]) for b in vecs] for a in vecs])
    cap = max(1, math.ceil(limit * TOPIC_CAP))
    remaining = sorted(range(len(cands)), key=lambda k: (-relevance[k], cands[k]["_id"]))
    chosen: list[int] = []
    per_topic: dict[str, int] = {}
    while remaining and len(chosen) < limit:
        best, best_score = None, -math.inf
        for k in remaining:
            if per_topic.get(cands[k]["skills"][0], 0) >= cap:
                continue
            redundancy = max((sims[k, j] for j in chosen), default=0.0)
            score = MMR_LAMBDA * relevance[k] - (1 - MMR_LAMBDA) * redundancy
            if score > best_score:
                best, best_score = k, score
        if best is None:  # every remaining item is over its topic cap
            break
        chosen.append(best)
        remaining.remove(best)
        topic = cands[best]["skills"][0]
        per_topic[topic] = per_topic.get(topic, 0) + 1
    return chosen


def _title(model: Model, item_id: str) -> str | None:
    return model.items.get(item_id, {}).get("title")


def _explain(model: Model, cand: dict, top: list[dict], history, completed: set, profile) -> str:
    """One natural sentence from the strongest factor, plus the goal when it also applies."""
    goal = goal_label(profile.goals[0]) if profile.goals else None
    gap_skill = next((s for s in cand["skills"] if s in set(profile.goalSkills)), None)
    # A completed prerequisite is the most concrete, verifiable reason, so it leads
    # whenever it is among the top factors; otherwise the strongest factor leads.
    names = [f["factor"] for f in top]
    lead = "completed_prerequisite" if "completed_prerequisite" in names else (names[0] if names else "popularity")

    def most_similar(matrix_row_fn):
        scored = [(matrix_row_fn(i), i) for i, _ in history if i in model.index]
        return _title(model, max(scored)[1]) if scored else None

    clause = None
    if lead == "completed_prerequisite":
        pre = next((p for p in cand["prerequisites"] if p in completed), None)
        if pre and _title(model, pre):
            clause = f"Builds on {_title(model, pre)}, which you completed"
    elif lead == "cf_similarity" and cand["_id"] in model.index:
        k = model.index[cand["_id"]]
        name = most_similar(lambda i: model.cf_sim[model.index[i], k])
        if name:
            clause = f"Learners who took {name} often take this next"
    elif lead == "content_similarity":
        v = model.vector(cand)
        name = most_similar(lambda i: float((model.content[model.index[i]] @ v.T).toarray()[0, 0]))
        if name:
            clause = f"Similar to {name}, which you studied"

    if lead == "skill_gap_fit" and gap_skill and goal:
        return f"Develops {skill_label(gap_skill)} for your {goal} goal"
    if clause is None:
        clause = (f"Develops {skill_label(gap_skill)} for your {goal} goal" if gap_skill and goal
                  else "Popular with learners on the same path")
        return clause
    if gap_skill and goal and any(f["factor"] == "skill_gap_fit" for f in top):
        return f"{clause}, and develops {skill_label(gap_skill)} for your {goal} goal"
    return clause
