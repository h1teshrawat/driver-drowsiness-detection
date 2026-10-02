/**
 * Alarm sounds generated with the Web Audio API — no audio files needed.
 *
 *   OscillatorNode (square wave, alternating 960 / 720 Hz = siren)
 *        -> GainNode (fade in/out)
 *        -> master GainNode (user volume)
 *        -> DynamicsCompressor (keeps it loud without clipping)
 *        -> speakers
 *
 * Browsers only allow audio after a user gesture, so call `unlock()` from a
 * click handler (we do it on "Start session").
 */
class AlarmSound {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private siren: { osc: OscillatorNode; gain: GainNode; timer: number } | null = null
  private volume = 0.8

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.volume
      const compressor = this.ctx.createDynamicsCompressor()
      this.master.connect(compressor)
      compressor.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  /** Create/resume the audio context. Must be called from a user gesture. */
  unlock(): void {
    this.ensureContext()
  }

  /** 0..1 */
  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume))
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05)
  }

  get isPlaying(): boolean {
    return this.siren !== null
  }

  /** Start the continuous two-tone siren (no-op if already playing). */
  startSiren(): void {
    if (this.siren) return
    const ctx = this.ensureContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = 960
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.03)
    osc.connect(gain)
    gain.connect(this.master!)
    osc.start()

    let high = true
    const timer = window.setInterval(() => {
      high = !high
      osc.frequency.setValueAtTime(high ? 960 : 720, ctx.currentTime)
    }, 230)
    this.siren = { osc, gain, timer }
  }

  stopSiren(): void {
    if (!this.siren || !this.ctx) return
    const { osc, gain, timer } = this.siren
    window.clearInterval(timer)
    gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03) // short fade avoids a click
    osc.stop(this.ctx.currentTime + 0.25)
    this.siren = null
  }

  /** Short two-note chime for non-critical events (yawn, distraction). */
  chime(kind: 'warning' | 'info' = 'warning'): void {
    const ctx = this.ensureContext()
    const notes = kind === 'warning' ? [660, 880] : [880, 1320]
    notes.forEach((freq, i) => {
      const start = ctx.currentTime + i * 0.14
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.35, start + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18)
      osc.connect(gain)
      gain.connect(this.master!)
      osc.start(start)
      osc.stop(start + 0.2)
    })
  }
}

/** One shared instance for the whole app. */
export const alarm = new AlarmSound()
