import { useTranslation } from 'react-i18next'
import { Archive } from 'lucide-react'
import { useProjectAccess } from '../../api/queries/projects'

/** Notice below the project header while the project is archived. */
export function ArchivedProjectBanner({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const { archived } = useProjectAccess(projectId)
  if (!archived) return null

  return (
    <div className="flex items-center gap-2 border-b bg-muted px-4 py-2 text-sm">
      <Archive aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <p>{t('ui:thisProjectIsArchivedAndReadonly')}</p>
    </div>
  )
}
