"""Start the backend server.

    python run.py            # http://127.0.0.1:8000  (docs at /docs)
    python run.py --reload   # auto-restart when you edit code
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import uvicorn

BACKEND_DIR = Path(__file__).resolve().parent

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Driver Drowsiness Detection backend")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--reload", action="store_true", help="restart on code changes (development)")
    args = parser.parse_args()

    os.chdir(BACKEND_DIR)  # so "app.api" is importable from any working directory
    uvicorn.run(
        "app.api:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        reload_dirs=[str(BACKEND_DIR / "app")] if args.reload else None,  # don't watch .venv
    )
