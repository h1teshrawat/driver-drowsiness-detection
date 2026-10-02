"""Unit tests for the pure maths in app/metrics.py (EAR, MAR, PERCLOS, rates, fatigue, head pose)."""

import cv2
import numpy as np
import pytest

from app import metrics as m

# A synthetic eye: p1..p6, width 30 px, two vertical gaps of 12 px
OPEN_EYE = np.array([[0, 0], [10, -6], [20, -6], [30, 0], [20, 6], [10, 6]], dtype=float)


# --------------------------------------------------------------------- EAR

def test_ear_of_open_eye_matches_formula():
    # (|p2-p6| + |p3-p5|) / (2 |p1-p4|) = (12 + 12) / (2 * 30) = 0.4
    assert m.eye_aspect_ratio(OPEN_EYE) == pytest.approx(0.4)


def test_ear_of_closed_eye_is_zero():
    closed = OPEN_EYE.copy()
    closed[:, 1] = 0  # lids meet
    assert m.eye_aspect_ratio(closed) == pytest.approx(0.0)


def test_ear_is_scale_invariant():
    """Moving closer to the camera (bigger eye in pixels) must not change EAR."""
    assert m.eye_aspect_ratio(OPEN_EYE * 3.7 + 100) == pytest.approx(m.eye_aspect_ratio(OPEN_EYE))


def test_ear_degenerate_eye_returns_zero_instead_of_dividing_by_zero():
    assert m.eye_aspect_ratio(np.zeros((6, 2))) == 0.0


def test_average_ear_uses_both_eyes():
    landmarks = np.zeros((478, 2))
    landmarks[m.RIGHT_EYE_EAR] = OPEN_EYE  # EAR 0.4
    half_closed = OPEN_EYE.copy()
    half_closed[:, 1] /= 2  # EAR 0.2
    landmarks[m.LEFT_EYE_EAR] = half_closed + 100
    assert m.average_ear(landmarks) == pytest.approx(0.3)


# --------------------------------------------------------------------- MAR

def _mouth(gap: float) -> np.ndarray:
    """Corners 40 px apart; three upper/lower lip pairs `gap` px apart (MAR_MAR order)."""
    corners = [[0, 0], [40, 0]]
    upper = [[10, -gap / 2], [20, -gap / 2], [30, -gap / 2]]
    lower = [[10, gap / 2], [20, gap / 2], [30, gap / 2]]
    return np.array(corners + upper + lower, dtype=float)


def test_mar_matches_formula():
    # mean vertical 20 / width 40 = 0.5
    assert m.mouth_aspect_ratio(_mouth(20)) == pytest.approx(0.5)


def test_mar_closed_mouth_is_zero_and_yawn_exceeds_default_threshold():
    assert m.mouth_aspect_ratio(_mouth(0)) == pytest.approx(0.0)
    assert m.mouth_aspect_ratio(_mouth(32)) > 0.6  # 32/40 = 0.8 -> yawn-sized


# ----------------------------------------------------------------- PERCLOS

def test_perclos_is_fraction_of_closed_frames():
    tracker = m.PerclosTracker(window_s=60)
    for i in range(10):
        tracker.add(i * 0.1, closed=i < 3)
    assert tracker.value() == pytest.approx(0.3)


def test_perclos_forgets_samples_older_than_window():
    tracker = m.PerclosTracker(window_s=10)
    tracker.add(0.0, closed=True)  # will expire
    for t in range(15, 20):
        tracker.add(float(t), closed=False)
    assert tracker.value() == 0.0


def test_perclos_empty_is_zero():
    assert m.PerclosTracker().value() == 0.0


# ------------------------------------------------------------- event rates

def test_event_rate_per_minute_over_full_window():
    rate = m.EventRateTracker(window_s=60)
    for t in (5, 20, 40):
        rate.add(t)
    assert rate.per_minute(now=59) == pytest.approx(3.0)


def test_event_rate_early_in_session_uses_elapsed_time():
    rate = m.EventRateTracker(window_s=60)
    rate.add(10)
    assert rate.per_minute(now=30, elapsed_s=30) == pytest.approx(2.0)  # 1 event in 30 s


def test_event_rate_drops_old_events():
    rate = m.EventRateTracker(window_s=60)
    rate.add(0)
    assert rate.per_minute(now=120) == 0.0


# ------------------------------------------------------------ fatigue score

def test_fatigue_is_zero_for_calm_driver():
    assert m.fatigue_score(perclos=0.04, yawns_per_min=0, nods_per_min=0) == 0.0


def test_fatigue_ignores_normal_blink_baseline():
    assert m.fatigue_score(perclos=m.PERCLOS_BASELINE, yawns_per_min=0, nods_per_min=0) == 0.0


def test_fatigue_worked_example():
    # PERCLOS 20 %: 0.60 * (0.15 / 0.25) = 0.36 -> 36 pts; 1 yawn/min: 0.25 / 3 -> 8.33 pts
    assert m.fatigue_score(0.20, 1, 0) == pytest.approx(44.3, abs=0.05)


def test_fatigue_is_capped_at_100():
    assert m.fatigue_score(0.9, 10, 10) == 100.0


def test_fatigue_components_sum_to_score():
    parts = m.fatigue_components(0.18, 1.5, 0.5)
    assert sum(parts.values()) == pytest.approx(m.fatigue_score(0.18, 1.5, 0.5), abs=0.05)
    assert set(parts) == {"perclos", "yawn", "nod"}


# --------------------------------------------------------------- head pose

def _project(pitch_deg: float, yaw_deg: float, w: int = 640, h: int = 480) -> np.ndarray:
    """Render the 3-D face model at a known orientation into 2-D image points."""
    rx = cv2.Rodrigues(np.array([np.radians(pitch_deg), 0.0, 0.0]))[0]
    ry = cv2.Rodrigues(np.array([0.0, np.radians(yaw_deg), 0.0]))[0]
    rvec = cv2.Rodrigues(rx @ ry)[0]
    camera = np.array([[w, 0, w / 2], [0, w, h / 2], [0, 0, 1]], dtype=float)
    pts, _ = cv2.projectPoints(m.HEAD_MODEL_POINTS, rvec, np.array([0, 0, 1500.0]), camera, np.zeros(4))
    return pts.reshape(-1, 2)


@pytest.mark.parametrize("pitch, yaw", [(0, 0), (20, 0), (-20, 0), (0, 30), (0, -30)])
def test_head_pose_recovers_known_angles(pitch, yaw):
    pose = m.estimate_head_pose(_project(pitch, yaw), 640, 480)
    assert pose is not None
    assert pose.pitch == pytest.approx(pitch, abs=1.0)
    assert pose.yaw == pytest.approx(yaw, abs=1.0)


def test_positive_pitch_means_head_down():
    """Rotating by +pitch moves the chin away from the camera, i.e. the head tips down."""
    rot = cv2.Rodrigues(np.array([np.radians(20), 0.0, 0.0]))[0]
    chin = m.HEAD_MODEL_POINTS[1]
    assert (rot @ chin)[2] > chin[2]
