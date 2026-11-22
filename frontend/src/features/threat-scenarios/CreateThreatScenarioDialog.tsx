import { useTranslation } from 'react-i18next'
import type { ThreatScenario } from '../../api/models/threatScenario'
import { useCreateThreatScenario } from '../../api/queries/items'
import { CreateLinkedElementDialog, type CreateLinkedElementDialogProps } from '../workspace/CreateLinkedElementDialog'

/**
 * "+ New → Threat Scenario" wireframe: name, owning item and the damage scenarios it leads to. On a damage
 * scenario's page it starts linked to that damage scenario; targets and the other fields follow on its page.
 */
export function CreateThreatScenarioDialog(props: CreateLinkedElementDialogProps<ThreatScenario>) {
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
        },
        create: (itemId, title, linkIds) => createThreatScenario.mutateAsync({ item_definition_id: itemId, title, damage_scenario_ids: linkIds }),
      }}
    />
  )
}
