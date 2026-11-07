import { createContext, useContext } from 'react'

/**
 * Three states, not two.
 *
 * `system` is the default and stamps nothing on the root, so the CSS media query
 * decides. An explicit `light` or `dark` stamps `data-theme`, which beats the
 * media query in both directions — including choosing light on a dark OS.
 */
export type ThemeChoice = 'system' | 'light' | 'dark'

export interface ThemeContextValue {
  /** What the reader picked. */
  choice: ThemeChoice
  /** What is actually on screen once `system` is resolved. */
  resolved: 'light' | 'dark'
  setChoice: (next: ThemeChoice) => void
  /** Flips between light and dark, landing on an explicit choice either way. */
  toggle: () => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used inside ThemeProvider')
  return value
}
