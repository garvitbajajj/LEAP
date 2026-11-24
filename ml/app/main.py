"""
LEAP recommendation service (FastAPI).

    uvicorn app.main:app --port 8000          # from the ml/ directory
    open http://localhost:8000/docs            # Swagger UI with apiKeyAuth
"""
import hmac
import logging
import time
from collections import Counter
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.security import APIKeyHeader

from . import config
from .model import MODEL, Model
from .recommender import rank
from .schemas import EmbedRequest, RecommendRequest, RecommendResponse

logging.basicConfig(level=logging.INFO, format='{"level":"%(levelname)s","time":"%(asctime)s","msg":"%(message)s"}')


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Warm start: fit from the LEAP API if it is up; otherwise the first request will."""
    try:
        MODEL.fit_from_api()
    except Exception as exc:  # noqa: BLE001
        logging.getLogger("leap.ml").warning("warm start skipped: %s", exc)
    yield


app = FastAPI(
    lifespan=lifespan,
    title="LEAP Recommendation Service",
    version=config.VERSION,
    description="Hybrid recommender (sentence-transformer embeddings with TF-IDF fallback + ALS matrix-factorisation CF + skill gap + popularity) with "
                "MMR diversity re-ranking and per-recommendation explanations. Contract C3.",
)

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False, description="Service key (apiKeyAuth)")


def require_api_key(key: str | None = Depends(api_key_header)) -> None:
    if not key or not hmac.compare_digest(key, config.ML_API_KEY):
        raise HTTPException(status_code=401, detail={"code": "UNAUTHENTICATED", "message": "Invalid or missing X-API-Key"})


# ---------------------------------------------------------------- metrics (Prometheus text format)
REQUESTS: Counter = Counter()
LATENCY_SUM: Counter = Counter()


@app.middleware("http")
async def track(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    route = request.url.path
    REQUESTS[(request.method, route, response.status_code)] += 1
    LATENCY_SUM[(request.method, route)] += time.perf_counter() - start
    return response


@app.exception_handler(HTTPException)
async def envelope(_: Request, exc: HTTPException):
    detail = exc.detail if isinstance(exc.detail, dict) else {"code": "ERROR", "message": str(exc.detail)}
    return JSONResponse(status_code=exc.status_code, content={"error": {**detail, "details": {}}})


@app.get("/health", tags=["Platform"])
def health():
    return {"status": "ok", "version": config.VERSION, "model": MODEL.describe()}


@app.get("/metrics", tags=["Platform"], response_class=PlainTextResponse)
def metrics():
    lines = ["# HELP ml_requests_total Requests by method, route and status",
             "# TYPE ml_requests_total counter"]
    lines += [f'ml_requests_total{{method="{m}",route="{r}",status="{s}"}} {n}' for (m, r, s), n in REQUESTS.items()]
    lines += ["# HELP ml_request_seconds_sum Cumulative request latency", "# TYPE ml_request_seconds_sum counter"]
    lines += [f'ml_request_seconds_sum{{method="{m}",route="{r}"}} {v:.6f}' for (m, r), v in LATENCY_SUM.items()]
    lines += ["# HELP ml_model_fitted Whether a model is loaded", "# TYPE ml_model_fitted gauge",
              f"ml_model_fitted {int(MODEL.fitted)}",
              "# HELP ml_als_latent_factors Number of latent dimensions in ALS factorisation",
              "# TYPE ml_als_latent_factors gauge",
              f"ml_als_latent_factors {config.ALS_FACTORS}"]
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------- C3
@app.post("/ml/v1/recommend", response_model=RecommendResponse, tags=["Recommendations"],
          dependencies=[Depends(require_api_key)])
def recommend(req: RecommendRequest):
    """Rank the candidates for one learner and explain every result (contract C3)."""
    MODEL.ensure_fitted([c.model_dump(by_alias=True) for c in req.candidateItems])
    return rank(MODEL, req)


@app.post("/ml/v1/retrain", tags=["Model"], dependencies=[Depends(require_api_key)])
def retrain():
    """Refit on the latest catalogue and interaction matrix from the LEAP API."""
    try:
        MODEL.fit_from_api()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail={"code": "RETRAIN_FAILED", "message": str(exc)}) from exc
    return MODEL.describe()


@app.post("/ml/v1/evaluate", tags=["Model"], dependencies=[Depends(require_api_key)])
def evaluate(
    primary_metric: str = "ndcg",
    primary_k: int = 10,
    min_improvement: float = 0.01,
    force_activate: bool = False,
):
    """
    Run offline evaluation harness and retraining gate.
    Evaluates candidate model against popularity and content-only baselines;
    activates the retrained model only if it beats the current active one.
    """
    from eval.gate import log_decision, should_activate
    from eval.harness import OfflineEvaluator
    from .model import Model, _get

    try:
        catalogue = _get(f"{config.LEAP_API_URL}/internal/catalogue")["items"]
        interactions = _get(f"{config.LEAP_API_URL}/internal/interactions")["rows"]
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=503,
            detail={"code": "FETCH_FAILED", "message": f"Could not fetch evaluation data from LEAP API: {exc}"},
        ) from exc

    if not catalogue:
        raise HTTPException(
            status_code=400,
            detail={"code": "EMPTY_CATALOGUE", "message": "Catalogue from LEAP API is empty"},
        )

    evaluator = OfflineEvaluator(catalogue=catalogue, interactions=interactions)
    candidate_model = Model()
    candidate_model.fit(catalogue, evaluator.train_interactions, source="eval-candidate")

    # Evaluate candidate and baselines
    results = evaluator.compare(candidate_model, k_values=[5, 10, 20])
    candidate_metrics = results.get("hybrid_model", {})

    # Evaluate current model if fitted
    if MODEL.fitted:
        current_metrics = evaluator.evaluate_model(MODEL, k_values=[5, 10, 20])
    else:
        current_metrics = results.get("baselines", {}).get("popularity", {})

    passed, reason = should_activate(
        current_metrics=current_metrics,
        candidate_metrics=candidate_metrics,
        primary_metric=primary_metric,
        primary_k=primary_k,
        min_improvement=min_improvement,
    )

    should_swap = passed or force_activate or (not MODEL.fitted)
    decision_reason = reason if not force_activate else f"Forced activation: {reason}"

    if should_swap:
        # Fit on full data for active serving
        full_candidate = Model()
        full_candidate.fit(catalogue, interactions, source="gated-retrain-active")
        MODEL.replace_with(full_candidate)

    gate_log = log_decision(
        decision=should_swap,
        reason=decision_reason,
        current_metrics=current_metrics,
        candidate_metrics=candidate_metrics,
        log_dir=config.REGISTRY_DIR,
    )

    return {
        "activated": should_swap,
        "reason": decision_reason,
        "activeModel": MODEL.describe(),
        "comparison": results,
        "gate": gate_log,
    }


@app.get("/ml/v1/models", tags=["Model"], dependencies=[Depends(require_api_key)])
def models():
    return {"active": MODEL.describe()}


@app.post("/ml/v1/embed", tags=["Model"], dependencies=[Depends(require_api_key)])
def embed(req: EmbedRequest):
    """Project text into the active content space (sentence-transformer dense vector or TF-IDF top terms)."""
    if not MODEL.fitted:
        raise HTTPException(status_code=409, detail={"code": "NOT_FITTED", "message": "Call /ml/v1/retrain first"})
    out = []
    if MODEL.content_encoder == "sentence-transformer":
        for text in req.texts:
            vec = MODEL.text_vector_1d(text)
            out.append({
                "encoder": MODEL.content_encoder,
                "model": MODEL.embedding_model,
                "dimensions": int(vec.shape[0]),
                "embedding": [round(float(x), 5) for x in vec],
            })
    else:
        terms = MODEL.vectorizer.get_feature_names_out()
        for text in req.texts:
            v = MODEL.text_vector(text)
            top = sorted(zip(v.indices, v.data), key=lambda x: -x[1])[:8]
            out.append({
                "encoder": MODEL.content_encoder,
                "dimensions": v.shape[1],
                "topTerms": [{"term": terms[i], "weight": round(float(w), 4)} for i, w in top],
            })
    return {"modelVersion": MODEL.version, "embeddings": out}
