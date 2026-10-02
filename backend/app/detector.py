"""Stateful drowsiness detector.

``DrowsinessDetector`` turns a stream of video frames into per-frame metrics
and a status label. It keeps the time-based state needed for rules like
"eyes closed for 1.5 seconds", so create **one instance per video stream /
driving session** (the WebSocket server in Phase b does exactly that).

Pipeline for every frame::

    BGR frame --MediaPipe Face Mesh--> 478 landmarks (normalised 0..1)
              --metrics.py--> EAR, MAR, head pose
              --state machine--> blinks, yawns, nods, PERCLOS, fatigue, status
"""

from __future__ import annotations

import time
from dataclasses import asdict, dataclass, field
from typing import Any, Literal

import cv2
import numpy as np

from .config import Settings
from . import metrics as m

Status = Literal["alert", "drowsy", "yawning", "distracted", "no_face"]

HEAD_POSE_SMOOTHING = 0.4  # EMA factor: higher = more responsive, lower = smoother
NOD_RELEASE_RATIO = 0.7    # head must come back below 70 % of threshold before the next nod counts
MAX_FRAME_GAP_S = 1.0      # a longer gap between frames = paused/stalled stream: timers restart


@dataclass
class FrameResult:
    """Everything the UI needs to render one frame."""

    status: Status
    face_detected: bool
    ear: float
    mar: float
    blinks: int
    blinks_per_min: float
    yawns: int
    nods: int
    perclos: float
    fatigue_score: float
    head_pose: dict[str, float]
    landmarks: dict[str, list[list[float]]]
    events: list[dict[str, Any]] = field(default_factory=list)
    session_seconds: float = 0.0
    fatigue_breakdown: dict[str, float] = field(default_factory=dict)  # points per factor

    def to_dict(self) -> dict[str, Any]:
        """JSON-serialisable representation."""
        return asdict(self)


class DrowsinessDetector:
    """Detects drowsiness, yawning and distraction from a face video stream."""

    def __init__(self, settings: Settings | None = None, use_mediapipe: bool = True) -> None:
        """
        Args:
            settings: thresholds; defaults are used if omitted.
            use_mediapipe: set False in unit tests that call :meth:`analyze`
                directly with synthetic landmarks (avoids loading the model).
        """
        self.settings = settings or Settings()
        self._face_mesh = None
        if use_mediapipe:
            import mediapipe as mp  # imported lazily: it is slow to load

            self._face_mesh = mp.solutions.face_mesh.FaceMesh(
                static_image_mode=False,   # video mode: track between frames (faster, steadier)
                max_num_faces=1,
                refine_landmarks=True,     # better eye/lip landmarks (+ iris)
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5,
            )
        self.reset()

    # ------------------------------------------------------------------ setup

    def reset(self) -> None:
        """Clear all counters and timers (e.g. at the start of a new session)."""
        s = self.settings
        self._last_t: float | None = None
        self.active_seconds = 0.0  # monitoring time, excluding pauses

        self.blinks = 0
        self.yawns = 0
        self.nods = 0
        self.perclos = m.PerclosTracker(s.perclos_window_s)
        self.blink_rate = m.EventRateTracker(60.0)
        self.yawn_rate = m.EventRateTracker(s.perclos_window_s)
        self.nod_rate = m.EventRateTracker(s.perclos_window_s)

        # "since" timers: when did the condition start? None = not active
        self._eyes_closed_since: float | None = None
        self._mouth_open_since: float | None = None
        self._bad_pose_since: float | None = None

        # Latched alert flags, so each alert produces exactly ONE event
        self._drowsy_active = False
        self._yawn_active = False
        self._distracted_active = False
        self._nod_active = False

        self._pose: m.HeadPose | None = None  # smoothed head pose

    def update_settings(self, settings: Settings) -> None:
        """Apply new thresholds without losing session counters."""
        self.settings = settings
        self.perclos.window_s = settings.perclos_window_s
        self.yawn_rate.window_s = settings.perclos_window_s
        self.nod_rate.window_s = settings.perclos_window_s

    def close(self) -> None:
        """Release MediaPipe resources."""
        if self._face_mesh is not None:
            self._face_mesh.close()
            self._face_mesh = None

    def __enter__(self) -> "DrowsinessDetector":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    # -------------------------------------------------------------- per frame

    def process_frame(self, frame_bgr: np.ndarray, timestamp: float | None = None) -> FrameResult:
        """Run face mesh on a BGR image (as given by OpenCV) and analyse it."""
        if self._face_mesh is None:
            raise RuntimeError("Detector was created with use_mediapipe=False")
        t = time.monotonic() if timestamp is None else timestamp
        h, w = frame_bgr.shape[:2]

        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        rgb.flags.writeable = False  # lets MediaPipe avoid a copy
        result = self._face_mesh.process(rgb)

        if not result.multi_face_landmarks:
            return self.analyze(None, w, h, t)
        face = result.multi_face_landmarks[0].landmark
        norm = np.array([(p.x, p.y) for p in face], dtype=np.float64)
        return self.analyze(norm, w, h, t)

    def analyze(self, norm_landmarks: np.ndarray | None, width: int, height: int, t: float) -> FrameResult:
        """Core state machine, independent of MediaPipe (unit-testable).

        Args:
            norm_landmarks: (N, 2) landmarks in 0..1 image coordinates, or None
                when no face was found.
            width, height: frame size in pixels.
            t: timestamp in seconds (monotonic).
        """
        s = self.settings
        if self._last_t is not None:
            dt = t - self._last_t
            if dt > MAX_FRAME_GAP_S:
                self._clear_timers()  # stream was paused: don't count the gap as "eyes closed"
            elif dt > 0:
                self.active_seconds += dt
        self._last_t = t
        elapsed = self.active_seconds

        if norm_landmarks is None:
            return self._no_face_result(t, elapsed)

        # Convert to pixels: ratios must be computed in real pixel space,
        # otherwise a 640x480 frame would squash horizontal distances.
        px = norm_landmarks * np.array([width, height], dtype=np.float64)

        ear = m.average_ear(px)
        mar = m.compute_mar(px)
        pose = self._smooth_pose(m.estimate_head_pose(px[m.HEAD_POSE_LANDMARKS], width, height))

        events: list[dict[str, Any]] = []

        # Head orientation relative to the driver's calibrated neutral pose
        pitch_rel = pose.pitch - s.head_pitch_offset_deg if pose else 0.0
        yaw_rel = pose.yaw - s.head_yaw_offset_deg if pose else 0.0
        head_down = pitch_rel > s.head_pitch_threshold_deg
        bad_pose = head_down or abs(yaw_rel) > s.head_yaw_threshold_deg
        mouth_open = mar > s.mar_threshold

        # ---- Eyes: blinks vs. drowsiness ---------------------------------
        eyes_closed = ear < s.ear_threshold
        # PERCLOS only uses frames where EAR is trustworthy: looking down/away
        # or yawning makes the eyes *look* narrow to the camera. Those
        # situations are already scored by the nod and yawn factors, so
        # including them would count the same behaviour twice.
        if not bad_pose and not mouth_open:
            self.perclos.add(t, eyes_closed)
        if eyes_closed:
            if self._eyes_closed_since is None:
                self._eyes_closed_since = t
            closed_for = t - self._eyes_closed_since
            if closed_for >= s.drowsy_duration_s and not self._drowsy_active:
                self._drowsy_active = True
                events.append(self._event("drowsy", ear, mar, pose, duration=closed_for))
        else:
            if self._eyes_closed_since is not None:
                closed_for = t - self._eyes_closed_since
                if closed_for <= s.blink_max_duration_s:
                    self.blinks += 1
                    self.blink_rate.add(t)
            self._eyes_closed_since = None
            self._drowsy_active = False

        # ---- Mouth: yawns -------------------------------------------------
        if mouth_open:
            if self._mouth_open_since is None:
                self._mouth_open_since = t
            open_for = t - self._mouth_open_since
            if open_for >= s.yawn_duration_s and not self._yawn_active:
                self._yawn_active = True
                self.yawns += 1
                self.yawn_rate.add(t)
                events.append(self._event("yawn", ear, mar, pose, duration=open_for))
        else:
            self._mouth_open_since = None
            self._yawn_active = False

        # ---- Head pose: nods and looking away ----------------------------
        if pose is not None:
            # A nod = head drops below the pitch threshold (counted once per drop)
            if head_down and not self._nod_active:
                self._nod_active = True
                self.nods += 1
                self.nod_rate.add(t)
            elif pitch_rel < s.head_pitch_threshold_deg * NOD_RELEASE_RATIO:
                self._nod_active = False

            if bad_pose:
                if self._bad_pose_since is None:
                    self._bad_pose_since = t
                bad_for = t - self._bad_pose_since
                if bad_for >= s.head_pose_duration_s and not self._distracted_active:
                    self._distracted_active = True
                    reason = "head_nod" if head_down else "looking_away"
                    events.append(self._event("distracted", ear, mar, pose, duration=bad_for, reason=reason))
            else:
                self._bad_pose_since = None
                self._distracted_active = False

        # ---- Aggregate scores and status ---------------------------------
        perclos = self.perclos.value()
        fatigue, breakdown = self._fatigue(t, elapsed)

        status: Status = "alert"
        if self._drowsy_active:
            status = "drowsy"
        elif self._yawn_active:
            status = "yawning"
        elif self._distracted_active:
            status = "distracted"

        return FrameResult(
            status=status,
            face_detected=True,
            ear=round(ear, 4),
            mar=round(mar, 4),
            blinks=self.blinks,
            blinks_per_min=round(self.blink_rate.per_minute(t, elapsed), 1),
            yawns=self.yawns,
            nods=self.nods,
            perclos=round(perclos, 4),
            fatigue_score=fatigue,
            head_pose=self._pose_dict(pose),
            landmarks=self._contours(norm_landmarks),
            events=events,
            session_seconds=round(elapsed, 2),
            fatigue_breakdown=breakdown,
        )

    # ---------------------------------------------------------------- helpers

    def _no_face_result(self, t: float, elapsed: float) -> FrameResult:
        """Graceful handling when no face is visible: reset the duration timers
        (we can't know what the eyes/mouth are doing) but keep all counters."""
        self._clear_timers()
        fatigue, breakdown = self._fatigue(t, elapsed)
        return FrameResult(
            status="no_face",
            face_detected=False,
            ear=0.0,
            mar=0.0,
            blinks=self.blinks,
            blinks_per_min=round(self.blink_rate.per_minute(t, elapsed), 1),
            yawns=self.yawns,
            nods=self.nods,
            perclos=round(self.perclos.value(), 4),
            fatigue_score=fatigue,
            head_pose={"pitch": 0.0, "yaw": 0.0, "roll": 0.0},
            landmarks={},
            events=[],
            session_seconds=round(elapsed, 2),
            fatigue_breakdown=breakdown,
        )

    def _fatigue(self, t: float, elapsed: float) -> tuple[float, dict[str, float]]:
        """Fatigue score (and points per factor) with a warm-up period.

        Until one full window (default 60 s) has been observed, the unseen time
        is treated as "normal": PERCLOS is scaled by how full the window is, and
        yawn/nod rates are divided by the whole window instead of being
        extrapolated. Otherwise a single yawn or long blink in the first few
        seconds would push the score to 100.
        """
        window = self.settings.perclos_window_s
        fill = min(1.0, elapsed / window) if window > 0 else 1.0
        parts = m.fatigue_components(
            self.perclos.value() * fill,
            self.yawn_rate.per_minute(t),
            self.nod_rate.per_minute(t),
        )
        return round(sum(parts.values()), 1), {k: round(v, 1) for k, v in parts.items()}

    def _clear_timers(self) -> None:
        """Forget in-progress conditions (closed eyes, open mouth, bad pose)."""
        self._eyes_closed_since = None
        self._mouth_open_since = None
        self._bad_pose_since = None
        self._drowsy_active = self._yawn_active = self._distracted_active = False
        self._pose = None

    def _smooth_pose(self, pose: m.HeadPose | None) -> m.HeadPose | None:
        """Exponential moving average to remove solvePnP jitter."""
        if pose is None:
            return self._pose
        if self._pose is None:
            self._pose = pose
        else:
            a = HEAD_POSE_SMOOTHING
            self._pose = m.HeadPose(
                pitch=a * pose.pitch + (1 - a) * self._pose.pitch,
                yaw=a * pose.yaw + (1 - a) * self._pose.yaw,
                roll=a * pose.roll + (1 - a) * self._pose.roll,
            )
        return self._pose

    @staticmethod
    def _pose_dict(pose: m.HeadPose | None) -> dict[str, float]:
        if pose is None:
            return {"pitch": 0.0, "yaw": 0.0, "roll": 0.0}
        return {"pitch": round(pose.pitch, 1), "yaw": round(pose.yaw, 1), "roll": round(pose.roll, 1)}

    @staticmethod
    def _contours(norm: np.ndarray) -> dict[str, list[list[float]]]:
        """Normalised (0..1) contour points for the frontend overlay.
        Normalised coordinates let the browser scale them to any canvas size."""

        def pick(idx: list[int]) -> list[list[float]]:
            return np.round(norm[idx], 4).tolist()

        return {
            "left_eye": pick(m.LEFT_EYE_CONTOUR),
            "right_eye": pick(m.RIGHT_EYE_CONTOUR),
            "outer_lips": pick(m.OUTER_LIPS_CONTOUR),
            "inner_lips": pick(m.INNER_LIPS_CONTOUR),
            "face_oval": pick(m.FACE_OVAL_CONTOUR),
        }

    @staticmethod
    def _event(kind: str, ear: float, mar: float, pose: m.HeadPose | None, **extra: Any) -> dict[str, Any]:
        """Build an alert event record (stored in SQLite in Phase b)."""
        event: dict[str, Any] = {
            "type": kind,
            "timestamp": time.time(),  # wall-clock, for logging
            "ear": round(ear, 4),
            "mar": round(mar, 4),
            "pitch": round(pose.pitch, 1) if pose else None,
            "yaw": round(pose.yaw, 1) if pose else None,
        }
        for key, value in extra.items():
            event[key] = round(value, 2) if isinstance(value, float) else value
        return event
