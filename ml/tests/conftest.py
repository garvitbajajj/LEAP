import os
import sys

# Point at an unreachable API so the app's warm start never touches a real server.
os.environ["LEAP_API_URL"] = "http://127.0.0.1:9/api/v1"
os.environ["ML_API_KEY"] = "test-key"
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
