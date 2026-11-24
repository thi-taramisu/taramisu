import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
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
import type { DamageScenario } from '../../api/models/damageScenario'
import { useDeleteDamageScenario } from '../../api/queries/items'

export function DeleteDamageScenarioDialog({ projectId, scenario }: { projectId: string; scenario: DamageScenario }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const remove = useDeleteDamageScenario(projectId, scenario.id)
  const navigate = useNavigate()
  return (
    <AlertDialog
      open={open}
      onOpenChange={(value) => {
        if (remove.isPending) return
        remove.reset()
        setOpen(value)
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          {t('ui:deleteDamageScenario')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('ui:deleteDamageScenarioTitle', { name: scenario.title })}</AlertDialogTitle>
          <AlertDialogDescription>{t('ui:deleteDamageScenarioWarning')}</AlertDialogDescription>
        </AlertDialogHeader>
        {remove.isError && <p role="alert">{t('ui:deleteDamageScenarioError')}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>{t('ui:cancel')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={remove.isPending}
            variant="destructive"
            onClick={(event) => {
              event.preventDefault()
              remove.mutate(undefined, {
                onSuccess: () => navigate(`/projects/${projectId}/items/${scenario.item_definition_id}`),
              })
            }}
          >
            {t('ui:deleteDamageScenario')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
