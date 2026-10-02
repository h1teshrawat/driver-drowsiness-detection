// Shapes of the data exchanged with the FastAPI backend.
// Keep these in sync with backend/app/detector.py and backend/app/schemas.py.

export type DriverStatus = 'alert' | 'drowsy' | 'yawning' | 'distracted' | 'no_face'

export type Point = [number, number] // normalised 0..1 image coordinates

export interface HeadPose {
  pitch: number
  yaw: number
  roll: number
}

export interface Landmarks {
  left_eye?: Point[]
  right_eye?: Point[]
  outer_lips?: Point[]
  inner_lips?: Point[]
  face_oval?: Point[]
}

export type AlertType = 'drowsy' | 'yawn' | 'distracted'

export interface AlertEvent {
  type: AlertType
  timestamp: number // unix seconds
  ear: number
  mar: number
  pitch: number | null
  yaw: number | null
  duration?: number
  reason?: 'head_nod' | 'looking_away'
}

/** One WebSocket response = one processed frame. */
export interface DetectionResult {
  type: 'result'
  frame_id: number | null
  session_id: number | null
  status: DriverStatus
  face_detected: boolean
  ear: number
  mar: number
  blinks: number
  blinks_per_min: number
  yawns: number
  nods: number
  perclos: number // 0..1
  fatigue_score: number // 0..100
  head_pose: HeadPose
  landmarks: Landmarks
  events: AlertEvent[]
  session_seconds: number
  processing_ms: number
  /** Points (out of 100) each factor contributes to fatigue_score */
  fatigue_breakdown: { perclos: number; yawn: number; nod: number }
}

export interface Settings {
  ear_threshold: number
  drowsy_duration_s: number
  blink_max_duration_s: number
  mar_threshold: number
  yawn_duration_s: number
  head_pitch_threshold_deg: number
  head_yaw_threshold_deg: number
  head_pose_duration_s: number
  head_pitch_offset_deg: number
  head_yaw_offset_deg: number
  perclos_window_s: number
  alarm_volume: number
}

export interface SessionSummary {
  id: number
  started_at: number
  ended_at: number | null
  active_seconds: number
  blinks: number
  yawns: number
  nods: number
  max_fatigue: number
  avg_fatigue: number
  drowsy_alerts: number
  yawn_alerts: number
  distracted_alerts: number
}

export interface StoredEvent {
  id: number
  session_id: number
  timestamp: number
  type: AlertType
  ear: number | null
  mar: number | null
  pitch: number | null
  yaw: number | null
  duration: number | null
  details: Record<string, unknown>
}

export interface Sample {
  timestamp: number
  ear: number | null
  mar: number | null
  perclos: number | null
  fatigue_score: number | null
}

export interface SessionDetail extends SessionSummary {
  events: StoredEvent[]
  samples: Sample[]
}
