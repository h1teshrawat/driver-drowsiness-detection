"""SQLite persistence for driving sessions, alert events and fatigue samples.

Schema::

    sessions  1 ──< events    (one row per alert: drowsy / yawn / distracted)
              1 ──< samples   (metrics snapshot every few seconds, for charts)

We use Python's built-in ``sqlite3`` and open a short-lived connection per
call. That is simple, thread-safe, and fast enough for a few writes per second.
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from .config import BACKEND_DIR

DEFAULT_DB_PATH = BACKEND_DIR / "data" / "drowsiness.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at      REAL    NOT NULL,          -- unix timestamp (seconds)
    ended_at        REAL,                      -- NULL while the session is active
    active_seconds  REAL    NOT NULL DEFAULT 0, -- monitoring time excluding pauses
    blinks          INTEGER NOT NULL DEFAULT 0,
    yawns           INTEGER NOT NULL DEFAULT 0,
    nods            INTEGER NOT NULL DEFAULT 0,
    max_fatigue     REAL    NOT NULL DEFAULT 0,
    avg_fatigue     REAL    NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    timestamp   REAL    NOT NULL,
    type        TEXT    NOT NULL,              -- 'drowsy' | 'yawn' | 'distracted'
    ear         REAL,
    mar         REAL,
    pitch       REAL,
    yaw         REAL,
    duration    REAL,                          -- how long the condition lasted when it fired
    details     TEXT                           -- JSON for anything extra (e.g. distraction reason)
);

CREATE TABLE IF NOT EXISTS samples (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id     INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    timestamp      REAL    NOT NULL,
    ear            REAL,
    mar            REAL,
    perclos        REAL,
    fatigue_score  REAL
);

CREATE INDEX IF NOT EXISTS idx_events_session  ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_samples_session ON samples(session_id);
"""

_EVENT_COLUMNS = {"type", "timestamp", "ear", "mar", "pitch", "yaw", "duration"}


def db_path() -> Path:
    """Database location. Override with the ``DDD_DB_PATH`` env var (used by tests)."""
    return Path(os.environ.get("DDD_DB_PATH", DEFAULT_DB_PATH))


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    """Open a connection, commit on success, always close."""
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row  # rows behave like dicts
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    """Create tables if they don't exist yet."""
    with connect() as conn:
        conn.executescript(SCHEMA)


# ----------------------------------------------------------------- sessions

def create_session() -> dict[str, Any]:
    """Insert a new active session and return it."""
    with connect() as conn:
        cur = conn.execute("INSERT INTO sessions (started_at) VALUES (?)", (time.time(),))
        session_id = cur.lastrowid
    return get_session_summary(session_id)  # type: ignore[return-value]


def update_session_stats(
    session_id: int,
    *,
    active_seconds: float,
    blinks: int,
    yawns: int,
    nods: int,
    max_fatigue: float,
    avg_fatigue: float,
) -> None:
    """Overwrite the running totals of a session."""
    with connect() as conn:
        conn.execute(
            """UPDATE sessions
               SET active_seconds = ?, blinks = ?, yawns = ?, nods = ?, max_fatigue = ?, avg_fatigue = ?
               WHERE id = ?""",
            (active_seconds, blinks, yawns, nods, max_fatigue, avg_fatigue, session_id),
        )


def end_session(session_id: int) -> None:
    """Mark a session as finished (idempotent)."""
    with connect() as conn:
        conn.execute(
            "UPDATE sessions SET ended_at = ? WHERE id = ? AND ended_at IS NULL",
            (time.time(), session_id),
        )


def delete_session(session_id: int) -> bool:
    """Delete a session and (via cascade) its events and samples."""
    with connect() as conn:
        cur = conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        return cur.rowcount > 0


_SUMMARY_SQL = """
SELECT s.*,
       (SELECT COUNT(*) FROM events e WHERE e.session_id = s.id AND e.type = 'drowsy')     AS drowsy_alerts,
       (SELECT COUNT(*) FROM events e WHERE e.session_id = s.id AND e.type = 'yawn')       AS yawn_alerts,
       (SELECT COUNT(*) FROM events e WHERE e.session_id = s.id AND e.type = 'distracted') AS distracted_alerts
FROM sessions s
"""


def get_session_summary(session_id: int) -> dict[str, Any] | None:
    """One session's totals and alert counts, or None if it doesn't exist."""
    with connect() as conn:
        row = conn.execute(_SUMMARY_SQL + " WHERE s.id = ?", (session_id,)).fetchone()
    return dict(row) if row else None


def list_sessions(limit: int = 100) -> list[dict[str, Any]]:
    """Most recent sessions first."""
    with connect() as conn:
        rows = conn.execute(_SUMMARY_SQL + " ORDER BY s.started_at DESC LIMIT ?", (limit,)).fetchall()
    return [dict(r) for r in rows]


def get_session_detail(session_id: int) -> dict[str, Any] | None:
    """Summary plus all events and samples of one session."""
    summary = get_session_summary(session_id)
    if summary is None:
        return None
    with connect() as conn:
        events = conn.execute(
            "SELECT * FROM events WHERE session_id = ? ORDER BY timestamp", (session_id,)
        ).fetchall()
        samples = conn.execute(
            "SELECT timestamp, ear, mar, perclos, fatigue_score FROM samples WHERE session_id = ? ORDER BY timestamp",
            (session_id,),
        ).fetchall()
    summary["events"] = [_event_row(r) for r in events]
    summary["samples"] = [dict(r) for r in samples]
    return summary


def _event_row(row: sqlite3.Row) -> dict[str, Any]:
    event = dict(row)
    event["details"] = json.loads(event["details"]) if event["details"] else {}
    return event


# ----------------------------------------------------- events and samples

def add_event(session_id: int, event: dict[str, Any]) -> None:
    """Store one alert event (as produced by ``DrowsinessDetector``)."""
    details = {k: v for k, v in event.items() if k not in _EVENT_COLUMNS}
    with connect() as conn:
        conn.execute(
            """INSERT INTO events (session_id, timestamp, type, ear, mar, pitch, yaw, duration, details)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                session_id,
                event.get("timestamp", time.time()),
                event["type"],
                event.get("ear"),
                event.get("mar"),
                event.get("pitch"),
                event.get("yaw"),
                event.get("duration"),
                json.dumps(details) if details else None,
            ),
        )


def add_sample(session_id: int, *, ear: float, mar: float, perclos: float, fatigue_score: float) -> None:
    """Store one periodic metrics snapshot (feeds the history chart)."""
    with connect() as conn:
        conn.execute(
            "INSERT INTO samples (session_id, timestamp, ear, mar, perclos, fatigue_score) VALUES (?, ?, ?, ?, ?, ?)",
            (session_id, time.time(), ear, mar, perclos, fatigue_score),
        )
