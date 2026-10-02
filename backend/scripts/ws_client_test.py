"""Phase (b) test: stream your webcam to the running API over WebSocket.

This imitates what the browser will do in Phase (c):
  1. POST /api/sessions/start          -> session id
  2. connect ws://.../ws/detect?session_id=<id>
  3. send JPEG frames as base64, print the JSON results
  4. POST /api/sessions/<id>/stop       -> final summary

Start the server first (python run.py), then in a second terminal:
    python scripts/ws_client_test.py --seconds 20 --fps 12
"""

from __future__ import annotations

import argparse
import base64
import json
import sys
import time
import urllib.request

import cv2
from websockets.sync.client import connect


def http_post(url: str) -> dict:
    req = urllib.request.Request(url, method="POST", data=b"")
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--server", default="127.0.0.1:8000")
    parser.add_argument("--seconds", type=float, default=20.0, help="how long to stream")
    parser.add_argument("--fps", type=float, default=12.0, help="frames per second to send")
    parser.add_argument("--camera", type=int, default=0)
    parser.add_argument("--no-session", action="store_true", help="stream without logging to the DB")
    args = parser.parse_args()

    base = f"http://{args.server}"
    try:
        session_id = None if args.no_session else http_post(f"{base}/api/sessions/start")["id"]
    except OSError as exc:
        sys.exit(f"Cannot reach the server at {base} ({exc}). Did you start it with 'python run.py'?")

    cap = cv2.VideoCapture(args.camera, cv2.CAP_DSHOW if sys.platform == "win32" else cv2.CAP_ANY)
    if not cap.isOpened():
        sys.exit(f"Could not open camera {args.camera}")
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    ws_url = f"ws://{args.server}/ws/detect" + (f"?session_id={session_id}" if session_id else "")
    print(f"Session: {session_id}  |  streaming to {ws_url} for {args.seconds:.0f}s at ~{args.fps:.0f} fps")
    print("Try: blink, close your eyes 2 s, yawn, look away 2 s.\n")

    interval = 1.0 / args.fps
    frame_id = 0
    end_at = time.monotonic() + args.seconds
    latencies: list[float] = []

    with connect(ws_url, max_size=2**22) as ws:
        while time.monotonic() < end_at:
            tick = time.monotonic()
            ok, frame = cap.read()
            if not ok:
                break
            # JPEG quality 70 ~ 25-40 KB per 640x480 frame: small and still accurate
            ok, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            frame_id += 1
            sent = time.perf_counter()
            ws.send(json.dumps({"type": "frame", "id": frame_id, "image": base64.b64encode(jpeg).decode()}))
            res = json.loads(ws.recv())  # wait for the answer before sending the next frame
            latencies.append((time.perf_counter() - sent) * 1000)

            if res["type"] == "error":
                print("ERROR:", res["message"])
                continue
            pose = res["head_pose"]
            print(
                f"#{res['frame_id']:>4} {res['status']:<10} EAR {res['ear']:.3f}  MAR {res['mar']:.3f}  "
                f"blinks {res['blinks']:>3}  yawns {res['yawns']}  PERCLOS {res['perclos'] * 100:4.1f}%  "
                f"fatigue {res['fatigue_score']:5.1f}  pitch {pose['pitch']:+5.1f} yaw {pose['yaw']:+5.1f}  "
                f"[{res['processing_ms']:.0f} ms]"
            )
            for event in res["events"]:
                print(f"   >>> EVENT: {event['type'].upper()}  {event}")

            time.sleep(max(0.0, interval - (time.monotonic() - tick)))

    cap.release()
    if latencies:
        avg = sum(latencies) / len(latencies)
        print(f"\nFrames: {frame_id}   average round-trip: {avg:.0f} ms")

    if session_id:
        summary = http_post(f"{base}/api/sessions/{session_id}/stop")
        print("\nSession summary:")
        print(json.dumps(summary, indent=2))
        print(f"\nFull detail: {base}/api/sessions/{session_id}")


if __name__ == "__main__":
    main()
