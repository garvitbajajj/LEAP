import os

ML_API_KEY = os.getenv("ML_API_KEY", "leap-dev-ml-key")
LEAP_API_URL = os.getenv("LEAP_API_URL", "http://127.0.0.1:4000/api/v1").rstrip("/")
LEAP_API_KEY = os.getenv("LEAP_API_KEY", ML_API_KEY)
REGISTRY_DIR = os.getenv("REGISTRY_DIR", os.path.join(os.path.dirname(__file__), "..", "registry"))
VERSION = "1.0.0"
