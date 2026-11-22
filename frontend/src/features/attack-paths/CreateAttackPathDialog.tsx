import { useTranslation } from 'react-i18next'
import type { AttackPath } from '../../api/models/attackPath'
import { useCreateAttackPath } from '../../api/queries/items'
import { CreateLinkedElementDialog, type CreateLinkedElementDialogProps } from '../workspace/CreateLinkedElementDialog'

/**
 * "+ New → Attack Path" wireframe: name, owning item and the threat scenarios it realizes. On a threat
 * scenario's page it starts linked to that threat scenario; steps and the rating follow on its page.
 */
export function CreateAttackPathDialog(props: CreateLinkedElementDialogProps<AttackPath>) {
  const { t } = useTranslation()
  const createAttackPath = useCreateAttackPath(props.projectId)
  return (
    <CreateLinkedElementDialog
      {...props}
      config={{
        type: 'attack-paths',
        link: { type: 'threat-scenarios', label: t('entities.threat-scenarios') },
        texts: {
          title: t('ui:newAttackPath'),
          description: t('ui:attackPathContext', { name: props.projectName }),
          namePlaceholder: t('ui:attackPathNamePlaceholder'),
          hint: t('ui:attackPathTreeHint'),
          linksLoading: t('ui:threatScenariosLoading'),
          linkRequired: t('ui:threatScenarioRequired'),
          createError: t('ui:createAttackPathError'),
          notInTree: (count) => t('ui:threatScenariosNotInTree', { count }),
        },
        create: (itemId, title, linkIds) => createAttackPath.mutateAsync({ item_definition_id: itemId, title, threat_scenario_ids: linkIds }),
      }}
    />
  )
}
