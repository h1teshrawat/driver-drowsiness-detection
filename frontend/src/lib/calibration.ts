/**
 * Personal calibration from a few seconds of "normal, eyes open" frames.
 *
 * Everyone's eyes have a different natural EAR (eye shape, glasses, camera
 * angle). Instead of one fixed threshold we measure the driver's own open-eye
 * baseline and put the threshold at 75 % of it. The same recording gives the
 * driver's neutral head pose, so a laptop camera that looks up at the face
 * doesn't count as "head down".
 */

export const CALIBRATION_SECONDS = 5
export const THRESHOLD_RATIO = 0.75
const MIN_SAMPLES = 25 // ~2 s of usable frames at 12 fps
const MIN_OPEN_EAR = 0.18 // below this the eyes were not really open
const THRESHOLD_MIN = 0.15
const THRESHOLD_MAX = 0.3
const OFFSET_LIMIT = 30

export interface CalibrationSample {
  ear: number
  pitch: number
  yaw: number
}

export interface CalibrationResult {
  baselineEar: number
  threshold: number
  pitchOffset: number
  yawOffset: number
  samples: number
}

export type CalibrationOutcome = { ok: true; result: CalibrationResult } | { ok: false; error: string }

/** Median: unlike the mean, a few blinks during recording barely move it. */
export function median(values: number[]): number {
  if (values.length === 0) return NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
const roundTo = (x: number, step: number) => Math.round(x / step) * step

export function computeCalibration(samples: CalibrationSample[]): CalibrationOutcome {
  if (samples.length < MIN_SAMPLES) {
    return {
      ok: false,
      error: `Only ${samples.length} usable frames were captured. Make sure your face is visible and well lit, then try again.`,
    }
  }
  const baselineEar = median(samples.map((s) => s.ear))
  if (baselineEar < MIN_OPEN_EAR) {
    return {
      ok: false,
      error: `Your eyes looked mostly closed (EAR ${baselineEar.toFixed(2)}). Keep them open normally and try again.`,
    }
  }
  return {
    ok: true,
    result: {
      baselineEar,
      threshold: Number(clamp(roundTo(baselineEar * THRESHOLD_RATIO, 0.005), THRESHOLD_MIN, THRESHOLD_MAX).toFixed(3)),
      pitchOffset: clamp(roundTo(median(samples.map((s) => s.pitch)), 0.5), -OFFSET_LIMIT, OFFSET_LIMIT),
      yawOffset: clamp(roundTo(median(samples.map((s) => s.yaw)), 0.5), -OFFSET_LIMIT, OFFSET_LIMIT),
      samples: samples.length,
    },
  }
}
