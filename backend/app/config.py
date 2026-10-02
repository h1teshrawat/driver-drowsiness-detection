"""Application settings (detection thresholds) with JSON persistence.

All tunable numbers live in one Pydantic model so that:
  * the detector reads them in one place,
  * the REST API (Phase b) can validate updates automatically,
  * values survive a server restart (saved to ``settings.json``).
"""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel, Field

BACKEND_DIR = Path(__file__).resolve().parent.parent
SETTINGS_FILE = BACKEND_DIR / "settings.json"


class Settings(BaseModel):
    """Detection thresholds and sensitivity parameters."""

    # Eyes
    ear_threshold: float = Field(0.23, ge=0.05, le=0.45, description="EAR below this = eyes closed")
    drowsy_duration_s: float = Field(1.5, ge=0.3, le=10.0, description="Eyes closed this long = drowsy")
    blink_max_duration_s: float = Field(0.4, ge=0.1, le=1.0, description="Closures shorter than this = blink")

    # Mouth
    mar_threshold: float = Field(0.6, ge=0.2, le=1.5, description="MAR above this = mouth wide open")
    yawn_duration_s: float = Field(1.0, ge=0.3, le=5.0, description="Mouth open this long = yawn")

    # Head pose (degrees). Positive pitch = head tilted down (nodding).
    head_pitch_threshold_deg: float = Field(20.0, ge=5.0, le=60.0)
    head_yaw_threshold_deg: float = Field(30.0, ge=5.0, le=80.0)
    head_pose_duration_s: float = Field(2.0, ge=0.5, le=10.0, description="Bad pose this long = distracted")
    head_pitch_offset_deg: float = Field(0.0, ge=-45.0, le=45.0, description="Neutral pitch (set by calibration)")
    head_yaw_offset_deg: float = Field(0.0, ge=-45.0, le=45.0, description="Neutral yaw (set by calibration)")

    # Rolling windows
    perclos_window_s: float = Field(60.0, ge=10.0, le=300.0)

    # Frontend-only preference, stored here so it persists with everything else
    alarm_volume: float = Field(0.8, ge=0.0, le=1.0)


def load_settings(path: Path = SETTINGS_FILE) -> Settings:
    """Load settings from disk, falling back to defaults if missing or invalid."""
    if path.exists():
        try:
            return Settings(**json.loads(path.read_text(encoding="utf-8")))
        except (ValueError, TypeError):
            pass  # corrupt file -> defaults
    return Settings()


def save_settings(settings: Settings, path: Path = SETTINGS_FILE) -> None:
    """Persist settings as pretty-printed JSON."""
    path.write_text(settings.model_dump_json(indent=2), encoding="utf-8")
