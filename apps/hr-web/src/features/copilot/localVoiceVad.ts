/** Energy-based turn endpointing only. No recognition, intent or HR authority. */
export class LocalVoiceVad {
  private preRoll: Float32Array[] = []
  private chunks: Float32Array[] = []
  private buffered = 0
  private length = 0
  private onset = 0
  private speech = 0
  private quiet = 0
  private lastVoice = 0
  private active = false
  private noiseFloor = 0.001
  private peak = 0
  private readonly rate: number

  constructor(rate: number) {
    if (!Number.isFinite(rate) || rate < 8000 || rate > 192000) throw new Error('Unsupported microphone sample rate')
    this.rate = rate
  }

  reset() {
    this.preRoll = []; this.chunks = []; this.buffered = 0; this.length = 0
    this.onset = 0; this.speech = 0; this.quiet = 0; this.lastVoice = 0; this.active = false
    this.peak = 0
  }

  push(samples: Float32Array): { started: boolean; ended: boolean; samples: Float32Array | null; recordingMs: number } {
    const empty = { started: false, ended: false, samples: null, recordingMs: 0 }
    if (!samples.length) return empty
    let energy = 0
    for (const sample of samples) energy += sample * sample
    const rms = Math.sqrt(energy / samples.length)
    if (!Number.isFinite(rms)) return empty

    if (!this.active) {
      // Learn the room's idle level instead of requiring digital silence.
      // Do not learn speech into the noise floor. Keep calibration across turns.
      if (rms < Math.max(0.012, this.noiseFloor * 2)) {
        const blend = 1 - Math.exp(-samples.length / (this.rate * 0.3))
        this.noiseFloor += (rms - this.noiseFloor) * blend
      }
      this.preRoll.push(samples.slice()); this.buffered += samples.length
      const excess = this.buffered - Math.round(this.rate * 0.3)
      let trim = Math.max(0, excess)
      while (trim && this.preRoll.length) {
        const first = this.preRoll[0], count = Math.min(trim, first.length)
        if (count === first.length) this.preRoll.shift()
        else this.preRoll[0] = first.slice(count)
        this.buffered -= count; trim -= count
      }
      // Require sustained sound to reject clicks; retain its beginning in pre-roll.
      this.onset = rms >= Math.max(0.012, this.noiseFloor * 2) ? this.onset + samples.length : 0
      if (this.onset < this.rate * 0.12) return empty
      this.active = true; this.chunks = this.preRoll; this.length = this.buffered
      this.preRoll = []; this.buffered = 0; this.speech = this.onset
      this.lastVoice = this.length; this.quiet = 0
      this.peak = rms
      return { ...empty, started: true }
    }

    this.chunks.push(samples.slice()); this.length += samples.length
    const endThreshold = Math.max(0.007, this.noiseFloor * 1.5, this.peak * 0.25)
    if (rms >= endThreshold) {
      this.speech += samples.length; this.quiet = 0; this.lastVoice = this.length
      this.peak = Math.max(rms, this.peak * Math.exp(-samples.length / (this.rate * 5)))
    } else this.quiet += samples.length
    // A one-second pause ends a turn; 30 s remains the existing server limit.
    if (this.quiet < this.rate && this.length < this.rate * 30) return empty
    return this.finish()
  }

  /** Also used by the wall-clock cap if microphone frames arrive too slowly. */
  finish(): { started: boolean; ended: boolean; samples: Float32Array | null; recordingMs: number } {
    if (!this.active) return { started: false, ended: false, samples: null, recordingMs: 0 }
    const recordingMs = this.length / this.rate * 1000
    let audio: Float32Array | null = null
    if (this.speech >= this.rate * 0.24) {
      const size = Math.min(this.length, this.lastVoice + Math.round(this.rate * 0.25), Math.floor(this.rate * 30))
      audio = new Float32Array(size)
      let offset = 0
      for (const chunk of this.chunks) {
        const count = Math.min(chunk.length, size - offset)
        if (count <= 0) break
        audio.set(chunk.subarray(0, count), offset); offset += count
      }
    }
    this.reset()
    return { started: false, ended: true, samples: audio, recordingMs }
  }
}
