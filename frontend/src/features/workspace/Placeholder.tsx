import { useTranslation } from 'react-i18next'
/** Stand-in for a page or tab that is routed but not built yet. */
export function Placeholder({ title }: { title: string }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
      {t('ui:notImplemented', { title })}
    </div>
  )
}
