"""FastAPI application: WebSocket detection stream + REST endpoints.

WebSocket protocol (``/ws/detect?session_id=<id>``)
---------------------------------------------------
Client -> server (JSON text messages)::

    {"type": "frame", "image": "<base64 JPEG, optional data: prefix>", "id": 17}
    {"type": "reset"}      # zero the counters
    {"type": "ping"}

A plain base64 string (not JSON) is also accepted as a frame.

Server -> client::

    {"type": "result", "frame_id": 17, "status": "alert", "ear": 0.29, "mar": 0.05, ...}
    {"type": "error", "message": "..."}
    {"type": "pong"}

``session_id`` is optional. Without it the stream is not logged (used for
calibration and the settings preview). With it, alerts and periodic samples
are written to SQLite, and the detector's counters survive a reconnect.
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import json
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from . import db
from .config import Settings, load_settings, save_settings
from .detector import DrowsinessDetector, FrameResult
from .schemas import SessionDetail, SessionSummary, SettingsUpdate

SAMPLE_INTERVAL_S = 2.0  # how often a metrics snapshot is stored for history charts


@dataclass
class SessionRuntime:
    """In-memory state of one live session (detector + running statistics)."""

    detector: DrowsinessDetector
    session_id: int | None = None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)  # one frame at a time
    last_sample_t: float = 0.0
    fatigue_sum: float = 0.0
    fatigue_n: int = 0
    max_fatigue: float = 0.0

    def record(self, result: FrameResult) -> None:
        """Update running fatigue statistics."""
        if result.face_detected:
            self.fatigue_sum += result.fatigue_score
            self.fatigue_n += 1
            self.max_fatigue = max(self.max_fatigue, result.fatigue_score)

    def persist_stats(self) -> None:
        """Write running totals to the sessions table."""
        if self.session_id is None:
            return
        d = self.detector
        db.update_session_stats(
            self.session_id,
            active_seconds=round(d.active_seconds, 1),
            blinks=d.blinks,
            yawns=d.yawns,
            nods=d.nods,
            max_fatigue=self.max_fatigue,
            avg_fatigue=round(self.fatigue_sum / self.fatigue_n, 1) if self.fatigue_n else 0.0,
        )


class AppState:
    """Process-wide state shared by all requests."""

    def __init__(self) -> None:
        self.settings: Settings = load_settings()
        self.sessions: dict[int, SessionRuntime] = {}


state = AppState()


async def new_detector() -> DrowsinessDetector:
    """Create a detector off the event loop (loading the model takes ~0.2 s)."""
    return await asyncio.to_thread(DrowsinessDetector, state.settings)


async def close_runtime(runtime: SessionRuntime) -> None:
    """Persist stats and free the detector's resources."""
    async with runtime.lock:
        await asyncio.to_thread(runtime.persist_stats)
        runtime.detector.close()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    db.init_db()
    yield
    # Server shutting down: close every live session cleanly
    for session_id, runtime in list(state.sessions.items()):
        await close_runtime(runtime)
        db.end_session(session_id)
    state.sessions.clear()


app = FastAPI(
    title="Driver Drowsiness Detection API",
    version="1.0.0",
    description="Real-time drowsiness, yawn and distraction detection over WebSocket.",
    lifespan=lifespan,
)

# The Vite dev server runs on a different port, so the browser needs CORS permission
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ------------------------------------------------------------------ helpers

def decode_frame(data: str) -> np.ndarray | None:
    """base64 (optionally ``data:image/jpeg;base64,...``) -> BGR image, or None."""
    if data.startswith("data:"):
        data = data.split(",", 1)[-1]
    try:
        raw = base64.b64decode(data, validate=False)
    except (binascii.Error, ValueError):
        return None
    if not raw:
        return None
    return cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)


def parse_message(text: str) -> dict[str, Any]:
    """Accept either a JSON message or a bare base64 frame."""
    try:
        msg = json.loads(text)
        if isinstance(msg, dict):
            return msg
    except json.JSONDecodeError:
        pass
    return {"type": "frame", "image": text}


def require_summary(session_id: int) -> dict[str, Any]:
    summary = db.get_session_summary(session_id)
    if summary is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    return summary


# ---------------------------------------------------------------- WebSocket

@app.websocket("/ws/detect")
async def ws_detect(websocket: WebSocket, session_id: int | None = None) -> None:
    """Receive frames, return per-frame detection results."""
    await websocket.accept()

    if session_id is not None:
        runtime = state.sessions.get(session_id)
        if runtime is None:
            summary = db.get_session_summary(session_id)
            if summary is None or summary["ended_at"] is not None:
                await websocket.send_json({"type": "error", "message": f"Session {session_id} is not active"})
                await websocket.close(code=4404)
                return
            # Active in the DB but not in memory (e.g. server restarted): resume it
            runtime = SessionRuntime(detector=await new_detector(), session_id=session_id)
            state.sessions[session_id] = runtime
    else:
        runtime = SessionRuntime(detector=await new_detector())  # temporary, unlogged

    try:
        while True:
            msg = parse_message(await websocket.receive_text())
            kind = msg.get("type", "frame")

            if kind == "ping":
                await websocket.send_json({"type": "pong"})
                continue
            if kind == "reset":
                async with runtime.lock:
                    runtime.detector.reset()
                await websocket.send_json({"type": "reset_ok"})
                continue
            if kind != "frame":
                await websocket.send_json({"type": "error", "message": f"Unknown message type '{kind}'"})
                continue

            frame = decode_frame(str(msg.get("image", "")))
            if frame is None:
                await websocket.send_json({"type": "error", "message": "Could not decode image", "frame_id": msg.get("id")})
                continue

            response = await process(runtime, frame)
            response["frame_id"] = msg.get("id")
            await websocket.send_json(response)
    except WebSocketDisconnect:
        pass
    finally:
        if runtime.session_id is None:
            runtime.detector.close()
        elif runtime.session_id in state.sessions:
            # Keep the session's detector alive so a reconnect continues the counts
            await asyncio.to_thread(runtime.persist_stats)


async def process(runtime: SessionRuntime, frame: np.ndarray) -> dict[str, Any]:
    """Run detection on one frame and log to SQLite if this is a live session."""
    async with runtime.lock:
        detector = runtime.detector
        if detector.settings is not state.settings:  # settings changed via REST
            detector.update_settings(state.settings)

        started = time.perf_counter()
        # MediaPipe is CPU-bound: run it in a worker thread so the server stays responsive
        result = await asyncio.to_thread(detector.process_frame, frame)
        processing_ms = (time.perf_counter() - started) * 1000
        runtime.record(result)

        if runtime.session_id is not None:
            await asyncio.to_thread(log_result, runtime, result)

    payload = result.to_dict()
    payload.update(type="result", processing_ms=round(processing_ms, 1), session_id=runtime.session_id)
    return payload


def log_result(runtime: SessionRuntime, result: FrameResult) -> None:
    """Store alert events immediately and a metrics sample every few seconds."""
    assert runtime.session_id is not None
    for event in result.events:
        db.add_event(runtime.session_id, event)

    now = time.monotonic()
    if result.face_detected and now - runtime.last_sample_t >= SAMPLE_INTERVAL_S:
        runtime.last_sample_t = now
        db.add_sample(
            runtime.session_id,
            ear=result.ear,
            mar=result.mar,
            perclos=result.perclos,
            fatigue_score=result.fatigue_score,
        )
        runtime.persist_stats()


# --------------------------------------------------------------------- REST

@app.get("/api/health")
def health() -> dict[str, Any]:
    """Simple liveness check (the frontend's connection indicator uses it)."""
    return {"status": "ok", "active_sessions": list(state.sessions)}


@app.get("/api/settings", response_model=Settings)
def get_settings() -> Settings:
    return state.settings


@app.put("/api/settings", response_model=Settings)
def put_settings(update: SettingsUpdate) -> Settings:  # type: ignore[valid-type]
    """Update any subset of settings. Takes effect on the next frame of every stream."""
    merged = state.settings.model_dump() | update.model_dump(exclude_none=True)  # type: ignore[attr-defined]
    try:
        new_settings = Settings(**merged)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=json.loads(exc.json())) from exc
    save_settings(new_settings)
    state.settings = new_settings
    return new_settings


@app.post("/api/settings/reset", response_model=Settings)
def reset_settings() -> Settings:
    """Restore default thresholds."""
    state.settings = Settings()
    save_settings(state.settings)
    return state.settings


@app.post("/api/sessions/start", response_model=SessionSummary)
async def start_session() -> dict[str, Any]:
    """Create a session. Connect to ``/ws/detect?session_id=<id>`` to stream frames."""
    summary = db.create_session()
    state.sessions[summary["id"]] = SessionRuntime(detector=await new_detector(), session_id=summary["id"])
    return summary


@app.post("/api/sessions/{session_id}/stop", response_model=SessionSummary)
async def stop_session(session_id: int) -> dict[str, Any]:
    """End a session, save final totals and release its detector."""
    require_summary(session_id)
    runtime = state.sessions.pop(session_id, None)
    if runtime is not None:
        await close_runtime(runtime)
    db.end_session(session_id)
    return require_summary(session_id)


@app.get("/api/sessions", response_model=list[SessionSummary])
def list_sessions(limit: int = 100) -> list[dict[str, Any]]:
    """Past and active sessions, newest first."""
    return db.list_sessions(limit)


@app.get("/api/sessions/{session_id}", response_model=SessionDetail)
def get_session(session_id: int) -> dict[str, Any]:
    """One session with its full event log and fatigue samples."""
    detail = db.get_session_detail(session_id)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    return detail


@app.delete("/api/sessions/{session_id}", status_code=204, response_class=Response)
def delete_session(session_id: int) -> Response:
    """Delete a finished session from history."""
    if session_id in state.sessions:
        raise HTTPException(status_code=409, detail="Stop the session before deleting it")
    if not db.delete_session(session_id):
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    return Response(status_code=204)
