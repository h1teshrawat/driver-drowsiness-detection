"""Phase (a) test: run the detector on your webcam in a plain OpenCV window.

Usage (from the backend folder, with the venv active):
    python scripts/webcam_test.py            # default camera
    python scripts/webcam_test.py --camera 1 # another camera

Keys:  q / Esc = quit,  r = reset counters
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import cv2
import numpy as np

# Allow "from app import ..." when running this file directly
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import load_settings  # noqa: E402
from app.detector import DrowsinessDetector, FrameResult  # noqa: E402

# BGR colours per status
COLOURS = {
    "alert": (80, 220, 100),
    "yawning": (0, 190, 255),
    "distracted": (255, 170, 60),
    "drowsy": (60, 60, 255),
    "no_face": (160, 160, 160),
}


def draw_contours(frame: np.ndarray, result: FrameResult) -> None:
    """Draw eye / mouth / face contours in the status colour."""
    h, w = frame.shape[:2]
    colour = COLOURS[result.status]
    for name, pts in result.landmarks.items():
        if not pts:
            continue
        poly = (np.array(pts) * [w, h]).astype(np.int32)
        thickness = 1 if name == "face_oval" else 2
        cv2.polylines(frame, [poly], isClosed=True, color=colour, thickness=thickness, lineType=cv2.LINE_AA)


def draw_panel(frame: np.ndarray, result: FrameResult, fps: float, ear_thr: float, mar_thr: float) -> None:
    """Draw the metrics text panel (after mirroring, so text reads correctly)."""
    colour = COLOURS[result.status]
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (260, 250), (20, 20, 20), -1)
    cv2.addWeighted(overlay, 0.6, frame, 0.4, 0, frame)

    pose = result.head_pose
    lines = [
        f"STATUS : {result.status.upper()}",
        f"EAR    : {result.ear:.3f}  (thr {ear_thr:.2f})",
        f"MAR    : {result.mar:.3f}  (thr {mar_thr:.2f})",
        f"Blinks : {result.blinks}  ({result.blinks_per_min:.0f}/min)",
        f"Yawns  : {result.yawns}",
        f"Nods   : {result.nods}",
        f"PERCLOS: {result.perclos * 100:.1f}%",
        f"Fatigue: {result.fatigue_score:.0f}/100",
        f"Pitch {pose['pitch']:+.0f}  Yaw {pose['yaw']:+.0f}",
        f"FPS    : {fps:.1f}",
    ]
    for i, text in enumerate(lines):
        cv2.putText(frame, text, (10, 22 + i * 23), cv2.FONT_HERSHEY_SIMPLEX, 0.55,
                    colour if i == 0 else (235, 235, 235), 1, cv2.LINE_AA)

    if result.status == "drowsy":
        h, w = frame.shape[:2]
        if int(time.time() * 4) % 2 == 0:  # flash
            cv2.rectangle(frame, (0, 0), (w - 1, h - 1), COLOURS["drowsy"], 14)
        cv2.putText(frame, "DROWSY - WAKE UP!", (w // 2 - 190, h - 30),
                    cv2.FONT_HERSHEY_DUPLEX, 1.1, COLOURS["drowsy"], 2, cv2.LINE_AA)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--camera", type=int, default=0, help="camera index (default 0)")
    args = parser.parse_args()

    settings = load_settings()
    # CAP_DSHOW opens much faster on Windows than the default backend
    backend = cv2.CAP_DSHOW if sys.platform == "win32" else cv2.CAP_ANY
    cap = cv2.VideoCapture(args.camera, backend)
    if not cap.isOpened():
        sys.exit(f"Could not open camera {args.camera}. Is another app (Zoom/Teams/browser) using it?")
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    print("Loading MediaPipe Face Mesh... (q = quit, r = reset)")
    fps, last = 0.0, time.perf_counter()

    with DrowsinessDetector(settings) as detector:
        while True:
            ok, frame = cap.read()
            if not ok:
                print("Camera frame grab failed, stopping.")
                break

            result = detector.process_frame(frame)
            for event in result.events:
                print(f"[EVENT] {event}")

            draw_contours(frame, result)
            frame = cv2.flip(frame, 1)  # mirror for a natural "selfie" view
            now = time.perf_counter()
            fps = 0.9 * fps + 0.1 * (1.0 / max(now - last, 1e-6))
            last = now
            draw_panel(frame, result, fps, settings.ear_threshold, settings.mar_threshold)

            cv2.imshow("Drowsiness Detector - Phase A test", frame)
            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):
                break
            if key == ord("r"):
                detector.reset()
                print("Counters reset.")

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
