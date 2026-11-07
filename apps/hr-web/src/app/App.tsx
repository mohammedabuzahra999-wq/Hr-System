import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { I18nProvider } from '@/features/i18n/I18nProvider'
import { ThemeProvider } from '@/features/theme/ThemeProvider'
import { router } from './router'

export function App() {
  const candidateOnly = /^\/interview\/(join|session)\/?$/.test(window.location.pathname)
  const content = (
      <I18nProvider>
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </I18nProvider>
  )
  // Candidate sessions never initialize employee authentication or employee SSE.
  return candidateOnly ? content : <AuthProvider>{content}</AuthProvider>
}
