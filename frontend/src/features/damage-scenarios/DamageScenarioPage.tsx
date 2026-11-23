import { useParams } from 'react-router-dom'
import { useDamageScenario, useDamageScenarioRelations } from '../../api/queries/items'
import { EntityDataPage } from '../workspace/EntityDataPage'

/** Damage scenario page: header from the damage scenario API, tabs as child routes. */
export function DamageScenarioPage() {
  const { projectId = '', entityId = '' } = useParams()
  const scenario = useDamageScenario(projectId, entityId)
  const relations = useDamageScenarioRelations(projectId, entityId)

  return (
    <EntityDataPage
      type="damage-scenarios"
      projectId={projectId}
      entity={scenario}
      tabCounts={relations.data && { relations: relations.data.assets.length + relations.data.threatScenarios.length }}
    />
  )
}
