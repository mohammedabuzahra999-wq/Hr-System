import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ThemeContext, type ThemeChoice, type ThemeContextValue } from './useTheme'

const STORAGE_KEY = 'hr-app:theme'

/**
 * The reader's choice, remembered across sessions.
 *
 * `localStorage` rather than `sessionStorage`, unlike the language: someone who
 * prefers a dark interface prefers it tomorrow too, and being asked again every
 * morning is the kind of small friction that makes software feel unfinished.
 */
function readStoredChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    /* storage unavailable (private window, blocked site data) — follow the OS */
  }
  return 'system'
}

const prefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(readStoredChoice)
  const [systemDark, setSystemDark] = useState(prefersDark)

  // Following the OS means following it while the app is open, not only at boot.
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const resolved: 'light' | 'dark' = choice === 'system' ? (systemDark ? 'dark' : 'light') : choice

  useEffect(() => {
    const root = document.documentElement
    // `system` removes the attribute entirely so the media query governs again.
    if (choice === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', choice)
  }, [choice])

  const setChoice = useCallback((next: ThemeChoice) => {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* storage unavailable — the choice lasts until reload */
    }
    setChoiceState(next)
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({
      choice,
      resolved,
      setChoice,
      // Toggling from `system` commits to the opposite of what is on screen,
      // which is what someone pressing the button is asking for.
      toggle: () => setChoice(resolved === 'dark' ? 'light' : 'dark'),
    }),
    [choice, resolved, setChoice],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
