import { CopilotPanel } from '@/features/copilot/CopilotPanel'
import { useAuth } from '@/features/auth/useAuth'
import { useI18n } from '@/features/i18n/useI18n'
import { homePathFor } from '@/lib/roles'
import { useNavigate } from 'react-router-dom'

/**
 * The assistant, with the whole screen.
 *
 * The assistant has been a panel hanging off a button — fine for interrupting
 * what you were doing, wrong for the first thing you meet. A panel says "carry
 * on, I am here if you need me"; a page says "tell me what you need". Making
 * it the landing screen is a claim that asking is the normal way in, and a
 * 26rem box in the corner does not carry that claim.
 *
 * It is not a different assistant. The same panel component does the work, so
 * there is one place where a question is asked, one place a proposal is
 * confirmed, and no second implementation to drift. What changes here is the
 * room around it.
 */
export function AssistantPage() {
  const { t, loc, dir } = useI18n()
  const { user } = useAuth()
  const navigate = useNavigate()

  /*
    The name comes from the dictionary like everything else. It was a literal
    here and in four other files, which made renaming it a hunt rather than an
    edit.
  */
  const assistant = t('assistant.name')

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-10rem)] w-full max-w-xl flex-col items-center justify-center gap-8 px-4">
      <div className="text-center">
        <span className="copilot-robot mx-auto grid size-16 place-items-center" aria-hidden="true">
          <span className="copilot-robot-ear copilot-robot-ear-start" />
          <span className="copilot-robot-ear copilot-robot-ear-end" />
          <span className="copilot-robot-antenna" />
          <span className="copilot-robot-red-accent" />
          <span className="copilot-robot-shell">
            <span className="copilot-robot-face">
              <span className="copilot-robot-eye copilot-robot-eye-start" />
              <span className="copilot-robot-eye copilot-robot-eye-end" />
              <span className="copilot-robot-smile" />
            </span>
            <span className="copilot-robot-chin" />
          </span>
        </span>

        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-ink">
          {t('assistant.greeting', {
            name: loc(user?.fullName ?? { en: '', ar: '' }).split(' ')[0] ?? '',
            assistant,
          })}
        </h1>
        <p className="mt-2 text-sm text-muted">{t('assistant.tagline')}</p>
      </div>

      {/* The box, and nothing around it. */}
      <div className="w-full" dir={dir}>
        <CopilotPanel floating onClose={() => undefined} fullPage />
      </div>

      {/*
        A way past it. Somebody who came to do something on a screen should not
        have to phrase that as a request — an assistant you cannot walk around
        is a toll gate, whatever it is good at.
      */}
      <button
        type="button"
        onClick={() => navigate(homePathFor(user?.role ?? 'employee'))}
        className="text-xs text-muted underline-offset-4 transition hover:text-brand hover:underline"
      >
        {t('assistant.skip', { assistant })}
      </button>
    </div>
  )
}
