import { useCallback, useEffect, useRef, useState } from 'react'

/** The small browser API surface we need, including Chrome's prefixed version. */
type RecognitionEvent = Event & {
  resultIndex: number
  results: {
    length: number
    [index: number]: { isFinal: boolean; 0: { transcript: string } }
  }
}

type RecognitionErrorEvent = Event & { error?: string }

interface BrowserSpeechRecognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: RecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

export type DictationError = 'dictationUnsupported' | 'dictationMicrophoneDenied' | 'dictationFailed' | 'dictationLanguageMismatch'

function matchesSystemLanguage(text: string, lang: 'en' | 'ar') {
  const arabic = (text.match(/[\u0621-\u064a]/g) ?? []).length
  const latin = (text.match(/[a-z]/gi) ?? []).length
  return lang === 'ar' ? arabic >= 2 && arabic >= latin : latin >= 2 && latin >= arabic
}

/**
 * Speech-to-text only.
 *
 * It creates no WebRTC call, opens no assistant session and posts nothing to
 * the API. The recognised final text is handed to the chat input, where the
 * person can correct it and explicitly press Send.
 */
export function useVoiceDictation({
  lang,
  onTranscript,
}: {
  lang: 'en' | 'ar'
  onTranscript: (text: string) => void
}) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<DictationError | null>(null)
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const onTranscriptRef = useRef(onTranscript)
  const langRef = useRef(lang)

  useEffect(() => {
    onTranscriptRef.current = onTranscript
    langRef.current = lang
  }, [lang, onTranscript])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    if (recognitionRef.current) return

    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Recognition) {
      setError('dictationUnsupported')
      return
    }

    const recognition = new Recognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognition.lang = langRef.current === 'ar' ? 'ar-JO' : 'en-US'
    recognition.onresult = (event) => {
      let finalText = ''
      let interimText = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const text = result?.[0]?.transcript.trim()
        if (!text) continue
        if (result.isFinal) finalText += `${finalText ? ' ' : ''}${text}`
        else interimText += `${interimText ? ' ' : ''}${text}`
      }
      setInterim(interimText)
      if (finalText) {
        if (!matchesSystemLanguage(finalText, langRef.current)) {
          setInterim('')
          setError('dictationLanguageMismatch')
          return
        }
        setError(null)
        onTranscriptRef.current(finalText)
      }
    }
    recognition.onerror = (event) => {
      if (event.error === 'aborted' || event.error === 'no-speech') return
      setError(event.error === 'not-allowed' || event.error === 'service-not-allowed' ? 'dictationMicrophoneDenied' : 'dictationFailed')
    }
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null
      setListening(false)
      setInterim('')
    }

    recognitionRef.current = recognition
    setError(null)
    setInterim('')
    setListening(true)
    try {
      recognition.start()
    } catch {
      recognitionRef.current = null
      setListening(false)
      setError('dictationFailed')
    }
  }, [])

  useEffect(() => () => recognitionRef.current?.abort(), [])

  return { listening, interim, error, start, stop }
}
