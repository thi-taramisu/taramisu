import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { ThreatScenario } from '@/api/models/threatScenario'
import { useDeleteThreatScenario } from '@/api/queries/items'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { entityPath } from '../workspace/entities'

export function DeleteThreatScenarioDialog({ projectId, scenario }: { projectId: string; scenario: ThreatScenario }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const remove = useDeleteThreatScenario(projectId, scenario.item_definition_id, scenario.id)

  return (
    <AlertDialog open={open} onOpenChange={(next) => {
      if (remove.isPending) return
      remove.reset()
      setOpen(next)
    }}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">{t('ui:treatment.deleteScenario')}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('ui:treatment.deleteScenarioTitle', { name: scenario.title })}</AlertDialogTitle>
          <AlertDialogDescription>{t('ui:treatment.deleteScenarioWarning')}</AlertDialogDescription>
        </AlertDialogHeader>
        {remove.isError && <p role="alert" className="text-sm text-destructive">{t('ui:treatment.deleteScenarioError')}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>{t('ui:cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            onClick={(event) => {
              event.preventDefault()
              if (remove.isPending) return
              remove.mutate(undefined, {
                onSuccess: () => navigate(entityPath(projectId, 'items', scenario.item_definition_id)),
              })
            }}
          >{t('ui:treatment.delete')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
