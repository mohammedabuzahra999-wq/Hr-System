import { CANDIDATE_AUDIO_MAX_BYTES, CANDIDATE_AUDIO_MAX_MS } from '@hr/shared'

export class MicrophoneError extends Error {}
/** Canonical bounded upload encoding; duration derives from PCM sample count on both sides. */
export function encodeCandidateWav(buffer: Pick<AudioBuffer, 'length' | 'sampleRate' | 'numberOfChannels' | 'getChannelData'>, maximumMs: number) {
  if (!Number.isFinite(buffer.sampleRate) || buffer.sampleRate < 8000 || buffer.sampleRate > 192000 || buffer.numberOfChannels < 1 || buffer.numberOfChannels > 2
    || !Number.isFinite(maximumMs) || maximumMs < 250 || maximumMs > CANDIDATE_AUDIO_MAX_MS || buffer.length / buffer.sampleRate > CANDIDATE_AUDIO_MAX_MS / 1000 + 1) throw new MicrophoneError('audioInvalid')
  const frames = Math.min(Math.floor(buffer.length * 16000 / buffer.sampleRate), Math.floor(maximumMs * 16))
  if (frames < 4000 || 44 + frames * 2 > CANDIDATE_AUDIO_MAX_BYTES) throw new MicrophoneError('audioTooShort')
  const bytes = new ArrayBuffer(44 + frames * 2), view = new DataView(bytes), text = (at: number, value: string) => [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)))
  text(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); text(8, 'WAVEfmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, frames * 2, true)
  const channels = Array.from({length: buffer.numberOfChannels}, (_, i) => buffer.getChannelData(i)), ratio = buffer.sampleRate / 16000
  for (let i = 0; i < frames; i++) {
    const start = i * ratio, end = (i + 1) * ratio
    let sample = 0
    for (let j = Math.floor(start); j < Math.ceil(end); j++) for (const channel of channels) sample += (channel[j] ?? 0) * (Math.min(end, j + 1) - Math.max(start, j)) / channels.length
    sample = Math.max(-1, Math.min(1, sample / ratio)); view.setInt16(44 + i * 2, Math.round(sample < 0 ? sample * 32768 : sample * 32767), true)
  }
  return new Blob([bytes], {type: 'audio/wav'})
}
export class CandidateMicrophone {
  private recorder: MediaRecorder
  private chunks: Blob[] = []
  private size = 0
  private timer?: ReturnType<typeof setTimeout>
  private stopped?: Promise<Blob>
  private ended = false
  private failure = false
  private visibility: () => void
  private stream: MediaStream
  private mime: string
  private interrupt: () => void
  constructor(stream: MediaStream, mime: string, interrupt: () => void) {
    this.stream = stream; this.mime = mime; this.interrupt = interrupt
    this.recorder = new MediaRecorder(stream, {mimeType: mime})
    this.visibility = () => {if (document.hidden && !this.ended) this.interrupt()}
    document.addEventListener('visibilitychange', this.visibility)
    for (const track of stream.getTracks()) track.addEventListener('ended', () => {if (!this.ended) this.interrupt()}, {once: true})
  }
  static async permission(signal: AbortSignal, interrupt: () => void) {
    if (signal.aborted) throw new MicrophoneError('microphoneInterrupted')
    if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined' || typeof AudioContext === 'undefined') throw new MicrophoneError('microphoneUnsupported')
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t))
    if (!mime) throw new MicrophoneError('microphoneUnsupported')
    const stream = await new Promise<MediaStream>((resolve, reject) => {
      let settled = false
      const fail = () => {if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener('abort', fail); reject(new MicrophoneError('microphoneInterrupted'))}
      const timer = setTimeout(fail, 20000); signal.addEventListener('abort', fail, {once: true})
      navigator.mediaDevices.getUserMedia({audio: {channelCount: 1, echoCancellation: true, noiseSuppression: true}, video: false}).then(value => {
        if (settled || signal.aborted) {value.getTracks().forEach(t => t.stop()); fail(); return}
        settled = true; clearTimeout(timer); signal.removeEventListener('abort', fail); resolve(value)
      }, error => {if (!settled) {settled = true; clearTimeout(timer); signal.removeEventListener('abort', fail); reject(new MicrophoneError(error instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(error.name) ? 'microphoneDenied' : 'microphoneUnavailable'))}})
    })
    stream.getAudioTracks().forEach(t => {t.enabled = false})
    try {return new CandidateMicrophone(stream, mime, interrupt)} catch {stream.getTracks().forEach(t => t.stop()); throw new MicrophoneError('microphoneUnsupported')}
  }
  start(maximumMs: number) {
    if (document.hidden) throw new MicrophoneError('microphoneInterrupted')
    this.recorder.addEventListener('dataavailable', e => {this.size += e.data.size; if (this.size > 8_000_000) {this.failure = true; this.interrupt()} else this.chunks.push(e.data)})
    this.recorder.addEventListener('error', () => {this.failure = true; this.interrupt()})
    this.stream.getAudioTracks().forEach(t => {t.enabled = true}); this.recorder.start(250); this.timer = setTimeout(this.interrupt, Math.min(maximumMs, CANDIDATE_AUDIO_MAX_MS))
  }
  stop(maximumMs: number): Promise<Blob> {
    if (this.stopped) return this.stopped
    this.ended = true; clearTimeout(this.timer); document.removeEventListener('visibilitychange', this.visibility)
    this.stopped = new Promise<Blob>((resolve, reject) => {
      let context: AudioContext | undefined
      let expired = false
      const timer = setTimeout(() => {expired=true;void context?.close();reject(new MicrophoneError('microphoneInterrupted'))},15000)
      this.recorder.addEventListener('stop', () => {
        if (expired) return
        if (this.failure || !this.chunks.length) {clearTimeout(timer);reject(new MicrophoneError('microphoneInterrupted')); return}
        const blob = new Blob(this.chunks, {type: this.mime}); this.chunks = []
        try {context = new AudioContext()} catch {clearTimeout(timer);reject(new MicrophoneError('microphoneUnsupported'));return}
        const decoder = context
        void blob.arrayBuffer().then(bytes => decoder.decodeAudioData(bytes)).then(buffer => {if(!expired)resolve(encodeCandidateWav(buffer,maximumMs))})
          .catch(error => reject(error instanceof MicrophoneError ? error : new MicrophoneError('audioInvalid'))).finally(() => {clearTimeout(timer);void decoder.close()})
      }, {once: true})
      try {this.recorder.stop()} catch {clearTimeout(timer); reject(new MicrophoneError('microphoneInterrupted'))}
      finally {this.stream.getTracks().forEach(track => track.stop())}
    })
    return this.stopped
  }
  release() {this.ended = true; clearTimeout(this.timer); document.removeEventListener('visibilitychange', this.visibility); this.stream.getTracks().forEach(t => t.stop()); if (this.recorder.state !== 'inactive') this.recorder.stop(); this.chunks = []}
}
