import { useParams } from 'react-router-dom'
import { useDamageScenario, useDamageScenarioRelations } from '../../api/queries/items'
import { useProjectAccess } from '../../api/queries/projects'
import { DeleteDamageScenarioDialog } from './DeleteDamageScenarioDialog'
import { EntityDataPage } from '../workspace/EntityDataPage'

/** Damage scenario page: header from the damage scenario API, tabs as child routes. */
export function DamageScenarioPage() {
  const { projectId = '', entityId = '' } = useParams()
  const scenario = useDamageScenario(projectId, entityId)
  const { canEdit } = useProjectAccess(projectId)
  const relations = useDamageScenarioRelations(projectId, entityId)

  return (
    <EntityDataPage
      type="damage-scenarios"
      projectId={projectId}
      entity={scenario}
      actions={canEdit && scenario.data && <DeleteDamageScenarioDialog projectId={projectId} scenario={scenario.data} />}
      tabCounts={relations.data && { relations: relations.data.assets.length + relations.data.threatScenarios.length }}
    />
  )
}
