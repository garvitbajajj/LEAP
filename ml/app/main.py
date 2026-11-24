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
from .model import MODEL
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
    description="Hybrid recommender (content + collaborative + skill gap + popularity) with "
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
              f"ml_model_fitted {int(MODEL.fitted)}"]
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


@app.get("/ml/v1/models", tags=["Model"], dependencies=[Depends(require_api_key)])
def models():
    return {"active": MODEL.describe()}


@app.post("/ml/v1/embed", tags=["Model"], dependencies=[Depends(require_api_key)])
def embed(req: EmbedRequest):
    """Project text into the fitted TF-IDF space; returns the strongest terms per text."""
    if not MODEL.fitted:
        raise HTTPException(status_code=409, detail={"code": "NOT_FITTED", "message": "Call /ml/v1/retrain first"})
    terms = MODEL.vectorizer.get_feature_names_out()
    out = []
    for text in req.texts:
        v = MODEL.text_vector(text)
        top = sorted(zip(v.indices, v.data), key=lambda x: -x[1])[:8]
        out.append({"dimensions": v.shape[1], "topTerms": [{"term": terms[i], "weight": round(float(w), 4)} for i, w in top]})
    return {"modelVersion": MODEL.version, "embeddings": out}
