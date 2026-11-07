/** Server-only speech operations. They carry no candidate or playback authority. */
export const SPEECH_TIMEOUT_MS = 15_000
export const SPEECH_CONCURRENCY = 2
export const SPEECH_INPUT_MAX_BYTES = 8_000_000
export const SPEECH_OUTPUT_MAX_BYTES = 2_000_000
export const SPEECH_TEXT_MAX_LENGTH = 4_096
export type SpeechProviderName = 'disabled' | 'openai'
export type SpeechFailure = 'speechInputInvalid' | 'speechProviderDisabled' | 'speechProviderCancelled' | 'speechProviderTimeout'
  | 'speechProviderCapacity' | 'speechProviderUnauthorized' | 'speechProviderRateLimited' | 'speechProviderRejected' | 'speechProviderUnavailable' | 'speechProviderMalformed'
export class SpeechProviderError extends Error {
  constructor(readonly code: SpeechFailure, readonly retryable = false) {super(code); this.name = 'SpeechProviderError'}
}
export type SpeechTranscript = Readonly<{text: string; uncertain: boolean}>
export type SpeechAudio = Readonly<{bytes: Uint8Array; mimeType: 'audio/wav'}>
export interface SpeechToTextProvider {
  transcribe(request: Readonly<{audio: Uint8Array; language?: 'en' | 'ar'}>, signal: AbortSignal): Promise<SpeechTranscript>
}
export interface TextToSpeechProvider {
  synthesize(request: Readonly<{text: string}>, signal: AbortSignal): Promise<SpeechAudio>
}
export type SpeechOperationStatus = 'disabled' | 'configured' | 'last-call-succeeded' | 'unhealthy' | 'closed'
export interface InterviewSpeechProviders extends SpeechToTextProvider, TextToSpeechProvider {
  readiness(): {stt: {provider: SpeechProviderName; status: SpeechOperationStatus}; tts: {provider: SpeechProviderName; status: SpeechOperationStatus}; liveValidated: false; transportReady: false}
  readonly physicalCalls: number
  close(): void
}
