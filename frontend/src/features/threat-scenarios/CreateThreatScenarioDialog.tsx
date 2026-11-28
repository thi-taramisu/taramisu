import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isExampleProject } from '../../api/mocks/data/headlamp'
import type { ThreatScenario } from '../../api/models/threatScenario'
import { useCreateThreatScenario, useProjectTree } from '../../api/queries/items'
import { CreateElementDialog } from '../workspace/CreateElementDialog'
import { CreateLinkedElementDialog, type CreateLinkedElementDialogProps } from '../workspace/CreateLinkedElementDialog'
import { entityPath } from '../workspace/entities'
import { ItemSelectField } from '../workspace/ItemSelectField'
import { usePageContext } from '../workspace/usePageContext'

/**
 * "+ New → Threat Scenario" wireframe: name, owning item and the damage scenarios it leads to. On a damage
 * scenario's page it starts linked to that damage scenario; targets and the other fields follow on its page.
 */
export function CreateThreatScenarioDialog(props: CreateLinkedElementDialogProps<ThreatScenario>) {
  return isExampleProject(props.projectId)
    ? <CreateExampleThreatScenarioDialog {...props} />
    : <CreateItemThreatScenarioDialog {...props} />
}

function CreateExampleThreatScenarioDialog(props: CreateLinkedElementDialogProps<ThreatScenario>) {
  const { t } = useTranslation()
  const createThreatScenario = useCreateThreatScenario(props.projectId)
  return (
    <CreateLinkedElementDialog
      {...props}
      config={{
        type: 'threat-scenarios',
        link: { type: 'damage-scenarios', label: t('entities.damage-scenarios') },
        texts: {
          title: t('ui:newThreatScenario'),
          description: t('ui:threatContext', { name: props.projectName }),
          namePlaceholder: t('ui:threatNamePlaceholder'),
          hint: t('ui:threatTreeHint'),
          linksLoading: t('ui:damageScenariosLoading'),
          linkRequired: t('ui:damageScenarioRequired'),
          createError: t('ui:createThreatError'),
          noItem: t('ui:damageScenariosNoItem'),
          linksLoadError: t('ui:damageScenariosLoadError'),
          notInTree: (count) => t('ui:damageScenariosNotInTree', { count }),
        },
        create: (itemId, title, linkIds) => createThreatScenario.mutateAsync({ item_definition_id: itemId, title, damage_scenario_ids: linkIds }),
      }}
    />
  )
}

function CreateItemThreatScenarioDialog({
  projectId, projectName, open, onOpenChange, returnFocusTo, initialName, lockedItemId,
}: CreateLinkedElementDialogProps<ThreatScenario>) {
  const { t } = useTranslation()
  const tree = useProjectTree(projectId)
  const items = tree.data ?? []
  const context = usePageContext(items)
  const [chosenItemId, setChosenItemId] = useState<string>()
  const itemId = lockedItemId ?? chosenItemId ?? context.itemId
  const create = useCreateThreatScenario(projectId)
  return (
    <CreateElementDialog
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      initialName={initialName}
      title={t('ui:newThreatScenario')}
      description={t('ui:threatContext', { name: projectName })}
      namePlaceholder={t('ui:threatNamePlaceholder')}
      hint={t('ui:treatment.scenarioTreeHint')}
      errorMessage={t('ui:createThreatError')}
      onCreate={async (title) => {
        if (!items.some((item) => item.id === itemId)) return
        const created = await create.mutateAsync({ item_definition_id: itemId, title, damage_scenario_ids: [] })
        return { name: created.title, path: entityPath(projectId, 'threat-scenarios', created.id) }
      }}
    >
      {items.length > 0
        ? <ItemSelectField items={items} value={itemId} locked={!!lockedItemId} onChange={setChosenItemId} />
        : <p className="text-sm text-muted-foreground">{t('ui:damageScenariosNoItem')}</p>}
    </CreateElementDialog>
  )
}
