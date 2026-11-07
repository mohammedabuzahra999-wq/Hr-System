import { useState } from 'react'
import { Outlet, useMatches } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { CopilotLauncher } from '@/features/copilot/CopilotLauncher'
import { PersistentVoiceCopilot } from '@/features/copilot/PersistentVoiceCopilot'
import { SystemTour } from '@/features/guide/SystemTour'
import type { TKey } from '@/features/i18n/dictionary'
import { useAuth } from '@/features/auth/useAuth'
import { useI18n } from '@/features/i18n/useI18n'
import { usePresencePing } from '@/features/presence/usePresencePing'

interface RouteHandle {
  titleKey?: TKey
}

/** Shell for signed-in pages: sidebar + topbar + routed content. */
export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { t } = useI18n()
  const { user } = useAuth()

  // Every signed-in page, so presence does not depend on which screen is open.
  usePresencePing(Boolean(user))
  const matches = useMatches()
  const titleKey = [...matches]
    .reverse()
    .map((m) => (m.handle as RouteHandle | undefined)?.titleKey)
    .find(Boolean)
  const title = titleKey ? t(titleKey) : ''

  return (
    <div className="flex min-h-dvh">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      {/*
        In the layout rather than on a page, so it is present wherever somebody
        is — a question occurs to people while they are reading something, and
        an assistant they have to navigate to is one they will not use.
      */}
      <CopilotLauncher />
      <PersistentVoiceCopilot />

      {/*
        Offered once, on a first login, and never again after it is finished or
        dismissed. It navigates real screens, so it has to live above the router
        outlet rather than on any one page.
      */}
      <SystemTour />
    </div>
  )
}
