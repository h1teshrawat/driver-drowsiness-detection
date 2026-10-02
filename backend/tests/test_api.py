"""API tests: REST endpoints and the WebSocket protocol, against a temporary database."""

import base64
import json

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import api, db
from app.config import Settings


@pytest.fixture()
def client():
    api.state.settings = Settings()  # start each test from defaults
    with TestClient(api.app) as c:
        yield c


def _jpeg_b64() -> str:
    """A blank grey frame (no face) encoded the way the browser sends it."""
    frame = np.full((480, 640, 3), 90, dtype=np.uint8)
    return "data:image/jpeg;base64," + base64.b64encode(cv2.imencode(".jpg", frame)[1]).decode()


# ------------------------------------------------------------------ settings

def test_health(client):
    assert client.get("/api/health").json()["status"] == "ok"


def test_get_settings_returns_defaults(client):
    body = client.get("/api/settings").json()
    assert body["ear_threshold"] == 0.23
    assert body["mar_threshold"] == 0.6


def test_partial_update_keeps_other_fields(client):
    body = client.put("/api/settings", json={"ear_threshold": 0.25}).json()
    assert body["ear_threshold"] == 0.25
    assert body["mar_threshold"] == 0.6


def test_out_of_range_setting_is_rejected(client):
    assert client.put("/api/settings", json={"ear_threshold": 5}).status_code == 422
    assert client.get("/api/settings").json()["ear_threshold"] == 0.23  # unchanged


def test_reset_settings(client):
    client.put("/api/settings", json={"mar_threshold": 0.9})
    assert client.post("/api/settings/reset").json()["mar_threshold"] == 0.6


# ------------------------------------------------------------------ sessions

def test_session_lifecycle_with_websocket(client):
    session = client.post("/api/sessions/start").json()
    sid = session["id"]
    assert session["ended_at"] is None

    with client.websocket_connect(f"/ws/detect?session_id={sid}") as ws:
        ws.send_text(json.dumps({"type": "ping"}))
        assert ws.receive_json() == {"type": "pong"}

        ws.send_text(json.dumps({"type": "frame", "id": 7, "image": _jpeg_b64()}))
        result = ws.receive_json()
        assert result["type"] == "result"
        assert result["frame_id"] == 7
        assert result["status"] == "no_face"
        assert result["session_id"] == sid

    summary = client.post(f"/api/sessions/{sid}/stop").json()
    assert summary["ended_at"] is not None

    detail = client.get(f"/api/sessions/{sid}").json()
    assert detail["id"] == sid
    assert detail["events"] == [] and detail["samples"] == []
    assert any(s["id"] == sid for s in client.get("/api/sessions").json())


def test_events_are_stored_and_counted(client):
    sid = client.post("/api/sessions/start").json()["id"]
    db.add_event(sid, {"type": "drowsy", "timestamp": 1.0, "ear": 0.1, "mar": 0.1, "duration": 1.6})
    db.add_event(sid, {"type": "distracted", "timestamp": 2.0, "ear": 0.3, "mar": 0.0, "reason": "looking_away"})
    client.post(f"/api/sessions/{sid}/stop")

    detail = client.get(f"/api/sessions/{sid}").json()
    assert detail["drowsy_alerts"] == 1 and detail["distracted_alerts"] == 1
    assert detail["events"][1]["details"] == {"reason": "looking_away"}


def test_bad_image_returns_error_message(client):
    with client.websocket_connect("/ws/detect") as ws:
        ws.send_text(json.dumps({"type": "frame", "id": 1, "image": "not-an-image"}))
        msg = ws.receive_json()
        assert msg["type"] == "error"


def test_unknown_session_websocket_is_refused(client):
    with client.websocket_connect("/ws/detect?session_id=99999") as ws:
        assert ws.receive_json()["type"] == "error"


def test_missing_session_is_404(client):
    assert client.get("/api/sessions/99999").status_code == 404
    assert client.post("/api/sessions/99999/stop").status_code == 404


def test_active_session_cannot_be_deleted_until_stopped(client):
    sid = client.post("/api/sessions/start").json()["id"]
    assert client.delete(f"/api/sessions/{sid}").status_code == 409
    client.post(f"/api/sessions/{sid}/stop")
    assert client.delete(f"/api/sessions/{sid}").status_code == 204
    assert client.get(f"/api/sessions/{sid}").status_code == 404
