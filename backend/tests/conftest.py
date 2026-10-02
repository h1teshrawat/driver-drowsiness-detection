"""Shared test setup.

The environment variables are set at import time — before any test module
imports ``app.api`` — so the API under test uses a throw-away database and
settings file instead of your real ones.
"""

import os
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="ddd-tests-"))
os.environ["DDD_DB_PATH"] = str(_TMP / "test.db")
os.environ["DDD_SETTINGS_PATH"] = str(_TMP / "settings.json")
