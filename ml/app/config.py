import os

ML_API_KEY = os.getenv("ML_API_KEY", "leap-dev-ml-key")
LEAP_API_URL = os.getenv("LEAP_API_URL", "http://127.0.0.1:4000/api/v1").rstrip("/")
LEAP_API_KEY = os.getenv("LEAP_API_KEY", ML_API_KEY)
REGISTRY_DIR = os.getenv("REGISTRY_DIR", os.path.join(os.path.dirname(__file__), "..", "registry"))
VERSION = "1.0.0"

# --- Content encoder (sentence-transformer | tfidf | auto) ---
CONTENT_ENCODER = os.getenv("CONTENT_ENCODER", "auto")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")

# --- ALS matrix factorisation collaborative filtering hyperparameters ---
ALS_FACTORS = int(os.getenv("ALS_FACTORS", "16"))
ALS_REGULARIZATION = float(os.getenv("ALS_REGULARIZATION", "0.05"))
ALS_ITERATIONS = int(os.getenv("ALS_ITERATIONS", "15"))
ALS_ALPHA = float(os.getenv("ALS_ALPHA", "40.0"))

