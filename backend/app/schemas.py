"""Pydantic models for REST request/response bodies.

FastAPI uses these to validate input, serialise output and generate the
interactive docs at ``/docs``.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, create_model

from .config import Settings

# Same fields as Settings, but all optional -> clients can send only what changed.
# (The merged result is validated against Settings, so range checks still apply.)
SettingsUpdate = create_model(  # type: ignore[call-overload]
    "SettingsUpdate",
    **{name: (Optional[field.annotation], None) for name, field in Settings.model_fields.items()},
)


class SessionSummary(BaseModel):
    """Totals for one driving session."""

    id: int
    started_at: float
    ended_at: Optional[float]
    active_seconds: float
    blinks: int
    yawns: int
    nods: int
    max_fatigue: float
    avg_fatigue: float
    drowsy_alerts: int
    yawn_alerts: int
    distracted_alerts: int


class EventOut(BaseModel):
    """One logged alert."""

    id: int
    session_id: int
    timestamp: float
    type: str
    ear: Optional[float]
    mar: Optional[float]
    pitch: Optional[float]
    yaw: Optional[float]
    duration: Optional[float]
    details: dict[str, Any]


class SampleOut(BaseModel):
    """Periodic metrics snapshot (for the fatigue-over-time chart)."""

    timestamp: float
    ear: Optional[float]
    mar: Optional[float]
    perclos: Optional[float]
    fatigue_score: Optional[float]


class SessionDetail(SessionSummary):
    """Summary plus the full event log and samples."""

    events: list[EventOut]
    samples: list[SampleOut]
