import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraState = 'idle' | 'starting' | 'live' | 'error'

const CAPTURE_MAX_WIDTH = 640 // frames sent to the backend are downscaled to this
const JPEG_QUALITY = 0.7 // ~25-40 KB per frame

/**
 * Webcam access via getUserMedia + frame capture as base64 JPEG.
 *
 * Attach `videoRef` to a <video> element that is always rendered.
 */
export function useWebcam() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [state, setState] = useState<CameraState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setState('idle')
  }, [])

  /** Ask for camera permission and start the preview. Resolves true on success. */
  const start = useCallback(async (): Promise<boolean> => {
    if (streamRef.current) return true
    setState('starting')
    setError(null)
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('This browser does not support camera access (use Chrome or Edge on localhost).')
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) throw new Error('Video element not mounted')
      video.srcObject = stream
      await video.play()
      setSize({ width: video.videoWidth || 640, height: video.videoHeight || 480 })
      setState('live')
      return true
    } catch (err) {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      setError(describeCameraError(err))
      setState('error')
      return false
    }
  }, [])

  /** Grab the current video frame as a JPEG data URL (null if not ready). */
  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current
    if (!video || !streamRef.current || video.readyState < 2 || !video.videoWidth) return null
    const scale = Math.min(1, CAPTURE_MAX_WIDTH / video.videoWidth)
    const w = Math.round(video.videoWidth * scale)
    const h = Math.round(video.videoHeight * scale)
    const canvas = (canvasRef.current ??= document.createElement('canvas'))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, w, h) // NOT mirrored: the backend sees the real image
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  }, [])

  // Release the camera when the component using this hook unmounts
  useEffect(() => stop, [stop])

  return { videoRef, state, error, size, start, stop, captureFrame }
}

function describeCameraError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : ''
  switch (name) {
    case 'NotAllowedError':
      return 'Camera permission was denied. Click the camera icon in the address bar to allow it, then try again.'
    case 'NotFoundError':
      return 'No camera was found on this device.'
    case 'NotReadableError':
      return 'The camera is being used by another application (Zoom, Teams, the Phase A test window...). Close it and retry.'
    case 'OverconstrainedError':
      return 'The camera does not support the requested resolution.'
    default:
      return err instanceof Error ? err.message : 'Could not start the camera.'
  }
}
