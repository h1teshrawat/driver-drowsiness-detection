"""Tests for the detector's state machine (blinks, drowsiness, yawns, head pose, pauses).

MediaPipe is not used here: we replace the per-frame measurements (EAR, MAR,
head pose) with scripted values and feed frames at 12 fps with fake timestamps.
"""

import numpy as np
import pytest

from app import metrics
from app.config import Settings
from app.detector import DrowsinessDetector

FPS = 12
FRAME_LANDMARKS = np.full((478, 2), 0.5)  # content is irrelevant once metrics are scripted

OPEN = dict(ear=0.31, mar=0.03, pitch=0.0, yaw=0.0)


class Driver:
    """Feeds scripted frames into a DrowsinessDetector."""

    def __init__(self, monkeypatch: pytest.MonkeyPatch, settings: Settings | None = None) -> None:
        self.detector = DrowsinessDetector(settings or Settings(), use_mediapipe=False)
        self.t = 0.0
        self.now = dict(OPEN)
        self.events: list[dict] = []
        monkeypatch.setattr(metrics, "average_ear", lambda px: self.now["ear"])
        monkeypatch.setattr(metrics, "compute_mar", lambda px: self.now["mar"])
        monkeypatch.setattr(
            metrics, "estimate_head_pose", lambda pts, w, h: metrics.HeadPose(self.now["pitch"], self.now["yaw"], 0.0)
        )

    def hold(self, seconds: float, face: bool = True, **values: float):
        """Keep the given measurements for `seconds`; returns the last result."""
        self.now = {**OPEN, **values}
        result = None
        for _ in range(round(seconds * FPS)):
            result = self.detector.analyze(FRAME_LANDMARKS if face else None, 640, 480, self.t)
            self.events += result.events
            self.t += 1 / FPS
        return result

    def event_types(self) -> list[str]:
        return [e["type"] for e in self.events]


def test_alert_driver_has_no_alerts(monkeypatch):
    d = Driver(monkeypatch)
    r = d.hold(5)
    assert r.status == "alert"
    assert d.events == []
    assert r.fatigue_score == 0.0


def test_short_closure_counts_as_blink_not_drowsiness(monkeypatch):
    d = Driver(monkeypatch)
    d.hold(1)
    d.hold(0.25, ear=0.10)  # blink
    r = d.hold(1)
    assert r.blinks == 1
    assert "drowsy" not in d.event_types()


def test_long_closure_raises_exactly_one_drowsy_event(monkeypatch):
    d = Driver(monkeypatch)
    d.hold(1)
    r = d.hold(3, ear=0.10)  # eyes shut 3 s (threshold 1.5 s)
    assert r.status == "drowsy"
    assert d.event_types().count("drowsy") == 1  # latched: one event per episode
    assert r.blinks == 0  # a long closure is not a blink
    assert d.hold(0.5).status == "alert"  # eyes reopen -> back to alert


def test_closure_just_under_threshold_is_not_drowsy(monkeypatch):
    d = Driver(monkeypatch)
    r = d.hold(1.2, ear=0.10)
    assert r.status != "drowsy"


def test_yawn_is_counted_once(monkeypatch):
    d = Driver(monkeypatch)
    r = d.hold(1.5, mar=0.8)
    assert r.status == "yawning"
    assert r.yawns == 1
    d.hold(1)
    assert d.event_types() == ["yawn"]


def test_talking_is_not_a_yawn(monkeypatch):
    d = Driver(monkeypatch)
    r = d.hold(3, mar=0.35)
    assert r.yawns == 0


def test_head_down_triggers_nod_and_distraction(monkeypatch):
    d = Driver(monkeypatch)
    r = d.hold(2.5, pitch=30)
    assert r.status == "distracted"
    assert r.nods == 1
    assert d.events[-1]["reason"] == "head_nod"


def test_looking_away_triggers_distraction(monkeypatch):
    d = Driver(monkeypatch)
    d.hold(2.5, yaw=45)
    assert d.events[-1]["type"] == "distracted"
    assert d.events[-1]["reason"] == "looking_away"


def test_calibrated_neutral_pose_is_respected(monkeypatch):
    """A camera that sees the driver at +10° pitch should not count +25° as a nod (only +15° relative)."""
    d = Driver(monkeypatch, Settings(head_pitch_offset_deg=10))
    r = d.hold(3, pitch=25)
    assert r.nods == 0
    assert r.status == "alert"


def test_no_face_keeps_counters(monkeypatch):
    d = Driver(monkeypatch)
    d.hold(1.5, mar=0.8)  # one yawn
    r = d.hold(1, face=False)
    assert r.status == "no_face"
    assert r.face_detected is False
    assert r.yawns == 1
    assert r.landmarks == {}


def test_pause_gap_resets_closed_eye_timer(monkeypatch):
    """Eyes closed 1 s, stream paused 5 s, closed 1 s again: never 1.5 s continuous -> no alarm."""
    d = Driver(monkeypatch)
    d.hold(1, ear=0.10)
    d.t += 5  # pause: no frames
    r = d.hold(1, ear=0.10)
    assert "drowsy" not in d.event_types()
    assert r.status != "drowsy"


def test_paused_time_is_not_counted_as_session_time(monkeypatch):
    d = Driver(monkeypatch)
    d.hold(2)
    d.t += 30
    r = d.hold(2)
    assert r.session_seconds == pytest.approx(4, abs=0.3)


def test_perclos_ignores_head_down_frames(monkeypatch):
    """Looking down makes eyes look closed; those frames must not inflate PERCLOS."""
    d = Driver(monkeypatch)
    d.hold(5)
    r = d.hold(5, ear=0.12, pitch=35)
    # head pose is smoothed, so only the first frame or two (still under 20°) can count
    assert r.perclos < 0.05


def test_settings_update_applies_to_next_frame(monkeypatch):
    d = Driver(monkeypatch)
    d.hold(1)
    d.detector.update_settings(Settings(ear_threshold=0.35))  # now 0.31 counts as closed
    r = d.hold(2)
    assert r.status == "drowsy"


def test_reset_clears_counters(monkeypatch):
    d = Driver(monkeypatch)
    d.hold(1.5, mar=0.8)
    d.detector.reset()
    r = d.hold(0.5)
    assert r.yawns == 0
    assert r.blinks == 0


def test_result_is_json_serialisable(monkeypatch):
    import json

    d = Driver(monkeypatch)
    r = d.hold(0.5)
    payload = json.loads(json.dumps(r.to_dict()))
    assert {"ear", "mar", "status", "perclos", "fatigue_score", "head_pose", "landmarks", "fatigue_breakdown"} <= payload.keys()
