import type { Settings } from './types'

/** Mirrors backend/app/config.py defaults; used until /api/settings has loaded. */
export const DEFAULT_SETTINGS: Settings = {
  ear_threshold: 0.23,
  drowsy_duration_s: 1.5,
  blink_max_duration_s: 0.4,
  mar_threshold: 0.6,
  yawn_duration_s: 1.0,
  head_pitch_threshold_deg: 20,
  head_yaw_threshold_deg: 30,
  head_pose_duration_s: 2.0,
  head_pitch_offset_deg: 0,
  head_yaw_offset_deg: 0,
  perclos_window_s: 60,
  alarm_volume: 0.8,
}

/** Maximum points of each fatigue factor (weights × 100) — see backend metrics.py */
export const FATIGUE_MAX = { perclos: 60, yawn: 25, nod: 15 }
