import { Link } from 'react-router-dom'
import { useI18n } from '@/features/i18n/useI18n'

export function NotFoundPage() {
  const { t } = useI18n()

  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <p className="text-5xl font-bold text-brand">404</p>
        <h1 className="mt-3 text-xl font-semibold">{t('notFound.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('notFound.body')}</p>
        <Link to="/" className="mt-6 inline-block text-sm font-semibold text-brand underline underline-offset-4">
          {t('notFound.link')}
        </Link>
      </div>
    </div>
  )
}
