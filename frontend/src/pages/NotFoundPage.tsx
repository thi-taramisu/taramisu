import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <main className="mx-auto max-w-4xl space-y-2 p-6">
      <h1 className="text-xl font-semibold">{t('ui:pageNotFound')}</h1>
      <Link to="/projects" className="text-sm hover:underline">
        {t('navigation.backToProjects')}
      </Link>
    </main>
  )
}
