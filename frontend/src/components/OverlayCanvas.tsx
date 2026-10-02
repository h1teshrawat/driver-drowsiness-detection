import { useEffect, useRef } from 'react'
import { STATUS_META } from '../lib/status'
import type { DriverStatus, Landmarks, Point } from '../lib/types'

interface Props {
  landmarks: Landmarks | undefined
  status: DriverStatus
}

/**
 * Transparent canvas stacked on the <video>. Landmarks arrive normalised
 * (0..1), so we just multiply by the canvas size — that works for any display size.
 * The parent mirrors video + canvas together, so we draw in un-mirrored coordinates.
 */
export default function OverlayCanvas({ landmarks, status }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const latest = useRef({ landmarks, status })
  latest.current = { landmarks, status }

  // Match the canvas bitmap to its on-screen size (sharp lines on HiDPI screens)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(([entry]) => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(entry.contentRect.width * dpr)
      canvas.height = Math.round(entry.contentRect.height * dpr)
      draw(canvas, latest.current.landmarks, latest.current.status)
    })
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (canvasRef.current) draw(canvasRef.current, landmarks, status)
  }, [landmarks, status])

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
}

function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')
  return `${hex}${a}`
}

function draw(canvas: HTMLCanvasElement, lm: Landmarks | undefined, status: DriverStatus) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const w = canvas.width / dpr
  const h = canvas.height / dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  if (!lm?.face_oval?.length) return

  const color = STATUS_META[status].color
  const tracePath = (pts: Point[]) => {
    ctx.beginPath()
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * w, y * h) : ctx.lineTo(x * w, y * h)))
    ctx.closePath()
  }

  // Face outline: faint dashed line
  ctx.save()
  ctx.setLineDash([3, 6])
  ctx.lineWidth = 1
  ctx.strokeStyle = withAlpha(color, 0.45)
  tracePath(lm.face_oval)
  ctx.stroke()
  ctx.restore()

  // Eyes and lips: glowing contours
  ctx.save()
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  ctx.strokeStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = 12
  for (const key of ['left_eye', 'right_eye', 'outer_lips', 'inner_lips'] as const) {
    const pts = lm[key]
    if (!pts?.length) continue
    tracePath(pts)
    if (key.endsWith('eye')) {
      ctx.fillStyle = withAlpha(color, 0.14)
      ctx.fill()
    }
    ctx.stroke()
  }
  ctx.restore()

  // HUD corner brackets around the face
  const xs = lm.face_oval.map((p) => p[0] * w)
  const ys = lm.face_oval.map((p) => p[1] * h)
  let [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const pad = (x1 - x0) * 0.08
  x0 -= pad
  x1 += pad
  y0 -= pad
  y1 += pad
  const len = Math.min(x1 - x0, y1 - y0) * 0.16

  ctx.save()
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  ctx.strokeStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = 8
  ctx.beginPath()
  // top-left, top-right, bottom-right, bottom-left
  ctx.moveTo(x0, y0 + len); ctx.lineTo(x0, y0); ctx.lineTo(x0 + len, y0)
  ctx.moveTo(x1 - len, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + len)
  ctx.moveTo(x1, y1 - len); ctx.lineTo(x1, y1); ctx.lineTo(x1 - len, y1)
  ctx.moveTo(x0 + len, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - len)
  ctx.stroke()
  ctx.restore()
}
