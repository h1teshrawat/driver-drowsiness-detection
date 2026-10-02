"""Pure math for drowsiness detection.

Nothing in this module touches the camera or MediaPipe, so all of it can be
unit-tested with hand-made NumPy arrays.

Landmark indices refer to MediaPipe Face Mesh (468 points, +10 iris points
when ``refine_landmarks=True``). "Right"/"left" are from the *driver's* point
of view, so the driver's right eye appears on the LEFT of an un-mirrored image.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass

import cv2
import numpy as np

# ---------------------------------------------------------------------------
# Landmark indices
# ---------------------------------------------------------------------------

# Six points per eye, in the classic EAR order p1..p6:
#   p1 = outer/inner corner, p2,p3 = upper lid, p4 = other corner, p5,p6 = lower lid
RIGHT_EYE_EAR = [33, 160, 158, 133, 153, 144]
LEFT_EYE_EAR = [362, 385, 387, 263, 373, 380]

# Inner-lip points for MAR: two corners, then 3 upper / 3 lower points (paired)
MOUTH_CORNERS = [78, 308]
MOUTH_UPPER = [81, 13, 311]
MOUTH_LOWER = [178, 14, 402]
MOUTH_MAR = MOUTH_CORNERS + MOUTH_UPPER + MOUTH_LOWER

# Closed contours used only for drawing the overlay
RIGHT_EYE_CONTOUR = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
LEFT_EYE_CONTOUR = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]
OUTER_LIPS_CONTOUR = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185]
INNER_LIPS_CONTOUR = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191]
FACE_OVAL_CONTOUR = [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377,
    152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
]

# Six landmarks used for head-pose estimation, matched to HEAD_MODEL_POINTS below:
# nose tip, chin, image-left eye outer corner, image-right eye outer corner,
# image-left mouth corner, image-right mouth corner
HEAD_POSE_LANDMARKS = [1, 152, 33, 263, 61, 291]

# Generic 3-D face model (arbitrary units ~ mm) in a *camera-aligned* frame:
# x -> right in the image, y -> down, z -> away from the camera.
# Using the same axes as the camera means a face looking straight at the
# lens gives a rotation of ~0, so pitch/yaw come out centred on zero.
HEAD_MODEL_POINTS = np.array(
    [
        (0.0, 0.0, 0.0),          # nose tip (closest to camera)
        (0.0, 330.0, 65.0),       # chin
        (-225.0, -170.0, 135.0),  # image-left eye outer corner
        (225.0, -170.0, 135.0),   # image-right eye outer corner
        (-150.0, 150.0, 125.0),   # image-left mouth corner
        (150.0, 150.0, 125.0),    # image-right mouth corner
    ],
    dtype=np.float64,
)


# ---------------------------------------------------------------------------
# Aspect ratios
# ---------------------------------------------------------------------------

def _dist(a: np.ndarray, b: np.ndarray) -> float:
    """Euclidean distance between two 2-D points."""
    return float(np.linalg.norm(np.asarray(a, dtype=np.float64) - np.asarray(b, dtype=np.float64)))


def eye_aspect_ratio(eye: np.ndarray) -> float:
    """Eye Aspect Ratio (Soukupová & Čech, 2016).

    EAR = (|p2 - p6| + |p3 - p5|) / (2 * |p1 - p4|)

    Args:
        eye: array of shape (6, 2) with points p1..p6 in **pixel** coordinates.

    Returns:
        EAR value. Roughly 0.25-0.35 for an open eye, < 0.15 when closed.
        Returns 0.0 for a degenerate eye (zero width).
    """
    p1, p2, p3, p4, p5, p6 = eye
    width = _dist(p1, p4)
    if width < 1e-6:
        return 0.0
    return (_dist(p2, p6) + _dist(p3, p5)) / (2.0 * width)


def mouth_aspect_ratio(mouth: np.ndarray) -> float:
    """Mouth Aspect Ratio from the inner lips.

    MAR = mean(|upper_i - lower_i| for i in 1..3) / |left_corner - right_corner|

    Args:
        mouth: array of shape (8, 2) ordered as
            [left_corner, right_corner, up1, up2, up3, low1, low2, low3]
            (i.e. the order of ``MOUTH_MAR``), in pixel coordinates.

    Returns:
        MAR value. ~0 for a closed mouth, ~0.2-0.4 while talking, > 0.6 yawning.
    """
    left, right = mouth[0], mouth[1]
    width = _dist(left, right)
    if width < 1e-6:
        return 0.0
    vertical = np.mean([_dist(mouth[2 + i], mouth[5 + i]) for i in range(3)])
    return float(vertical / width)


def average_ear(landmarks_px: np.ndarray) -> float:
    """Mean EAR of both eyes from a full (N, 2) pixel landmark array."""
    right = eye_aspect_ratio(landmarks_px[RIGHT_EYE_EAR])
    left = eye_aspect_ratio(landmarks_px[LEFT_EYE_EAR])
    return (right + left) / 2.0


def compute_mar(landmarks_px: np.ndarray) -> float:
    """MAR from a full (N, 2) pixel landmark array."""
    return mouth_aspect_ratio(landmarks_px[MOUTH_MAR])


# ---------------------------------------------------------------------------
# Head pose
# ---------------------------------------------------------------------------

@dataclass
class HeadPose:
    """Head orientation in degrees. Positive pitch = looking down, yaw sign = left/right."""

    pitch: float
    yaw: float
    roll: float


def estimate_head_pose(image_points: np.ndarray, frame_width: int, frame_height: int) -> HeadPose | None:
    """Estimate head pose with ``cv2.solvePnP``.

    solvePnP finds the rotation + translation that best projects the 3-D
    ``HEAD_MODEL_POINTS`` onto the observed 2-D ``image_points``. We assume a
    simple pinhole camera (focal length ~ image width, no lens distortion),
    which is accurate enough for detecting large head movements.

    Args:
        image_points: (6, 2) pixel coordinates for ``HEAD_POSE_LANDMARKS``.
        frame_width: image width in pixels.
        frame_height: image height in pixels.

    Returns:
        HeadPose, or None if solvePnP fails.
    """
    focal = float(frame_width)
    camera_matrix = np.array(
        [[focal, 0.0, frame_width / 2.0], [0.0, focal, frame_height / 2.0], [0.0, 0.0, 1.0]],
        dtype=np.float64,
    )
    dist_coeffs = np.zeros((4, 1))
    ok, rvec, _tvec = cv2.solvePnP(
        HEAD_MODEL_POINTS,
        np.asarray(image_points, dtype=np.float64),
        camera_matrix,
        dist_coeffs,
        flags=cv2.SOLVEPNP_ITERATIVE,
    )
    if not ok:
        return None
    rotation, _ = cv2.Rodrigues(rvec)
    # RQDecomp3x3 returns Euler angles (degrees) about the x, y, z axes
    angles, *_ = cv2.RQDecomp3x3(rotation)
    pitch, yaw, roll = (float(a) for a in angles)
    return HeadPose(pitch=_wrap_angle(pitch), yaw=_wrap_angle(yaw), roll=_wrap_angle(roll))


def _wrap_angle(deg: float) -> float:
    """Wrap an angle into [-180, 180)."""
    return (deg + 180.0) % 360.0 - 180.0


# ---------------------------------------------------------------------------
# Rolling-window trackers
# ---------------------------------------------------------------------------

class PerclosTracker:
    """PERCLOS = fraction of time the eyes were closed within a sliding window.

    Each processed frame adds one ``(timestamp, closed)`` sample; samples older
    than ``window_s`` are discarded. Using timestamps (not a fixed number of
    frames) keeps the metric correct even if the frame rate changes.
    """

    def __init__(self, window_s: float = 60.0) -> None:
        self.window_s = window_s
        self._samples: deque[tuple[float, bool]] = deque()
        self._closed_count = 0

    def add(self, timestamp: float, closed: bool) -> None:
        """Record one frame."""
        self._samples.append((timestamp, closed))
        self._closed_count += int(closed)
        self._prune(timestamp)

    def value(self) -> float:
        """Current PERCLOS in [0, 1] (0 if no samples yet)."""
        if not self._samples:
            return 0.0
        return self._closed_count / len(self._samples)

    def reset(self) -> None:
        self._samples.clear()
        self._closed_count = 0

    def _prune(self, now: float) -> None:
        while self._samples and now - self._samples[0][0] > self.window_s:
            _, was_closed = self._samples.popleft()
            self._closed_count -= int(was_closed)


class EventRateTracker:
    """Counts discrete events (blinks, yawns, nods) inside a sliding window."""

    def __init__(self, window_s: float = 60.0) -> None:
        self.window_s = window_s
        self._times: deque[float] = deque()

    def add(self, timestamp: float) -> None:
        self._times.append(timestamp)

    def per_minute(self, now: float, elapsed_s: float | None = None) -> float:
        """Events per minute over the window.

        Args:
            now: current timestamp.
            elapsed_s: time since monitoring began. Early in a session the
                window is not yet full, so we divide by the real elapsed time
                instead (avoids under-reporting the rate in the first minute).
        """
        while self._times and now - self._times[0] > self.window_s:
            self._times.popleft()
        span = self.window_s if elapsed_s is None else min(self.window_s, max(elapsed_s, 10.0))
        return len(self._times) * 60.0 / span

    def reset(self) -> None:
        self._times.clear()


# ---------------------------------------------------------------------------
# Fatigue score
# ---------------------------------------------------------------------------

# PERCLOS of an alert driver is not zero: normal blinking alone closes the
# eyes ~3-5 % of the time. Only closure above this baseline counts as fatigue.
PERCLOS_BASELINE = 0.05
# Values at which each factor is considered "maximal" (contributes 100 %)
PERCLOS_MAX = 0.30      # literature: PERCLOS > 0.15 already indicates drowsiness
YAWN_RATE_MAX = 3.0     # yawns per minute
NOD_RATE_MAX = 3.0      # head nods per minute

FATIGUE_WEIGHTS = {"perclos": 0.60, "yawn": 0.25, "nod": 0.15}


def fatigue_components(perclos: float, yawns_per_min: float, nods_per_min: float) -> dict[str, float]:
    """Points (out of 100) contributed by each factor of the Fatigue Score.

    perclos = 100 * 0.60 * clamp((PERCLOS - 0.05) / (0.30 - 0.05))
    yawn    = 100 * 0.25 * min(yawns_per_min / 3, 1)
    nod     = 100 * 0.15 * min(nods_per_min / 3, 1)

    PERCLOS gets the biggest weight because it is the most validated
    single predictor of drowsiness in driving research.
    """
    p = min(max(perclos - PERCLOS_BASELINE, 0.0) / (PERCLOS_MAX - PERCLOS_BASELINE), 1.0)
    y = min(max(yawns_per_min, 0.0) / YAWN_RATE_MAX, 1.0)
    n = min(max(nods_per_min, 0.0) / NOD_RATE_MAX, 1.0)
    return {
        "perclos": 100.0 * FATIGUE_WEIGHTS["perclos"] * p,
        "yawn": 100.0 * FATIGUE_WEIGHTS["yawn"] * y,
        "nod": 100.0 * FATIGUE_WEIGHTS["nod"] * n,
    }


def fatigue_score(perclos: float, yawns_per_min: float, nods_per_min: float) -> float:
    """Combine indicators into a single 0-100 Fatigue Score (sum of the components)."""
    return round(sum(fatigue_components(perclos, yawns_per_min, nods_per_min).values()), 1)
