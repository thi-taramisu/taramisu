import { useParams } from 'react-router-dom'
import { useThreatScenario, useThreatScenarioRelations } from '../../api/queries/items'
import { EntityDataPage } from '../workspace/EntityDataPage'

/** Threat scenario page: header from the threat scenario API, tabs as child routes. */
export function ThreatScenarioPage() {
  const { projectId = '', entityId = '' } = useParams()
  const scenario = useThreatScenario(projectId, entityId)
  const relations = useThreatScenarioRelations(projectId, entityId)

  return (
    <EntityDataPage
      type="threat-scenarios"
      projectId={projectId}
      entity={scenario}
      tabCounts={relations.data && { relations: relations.data.damageScenarios.length + relations.data.attackPaths.length }}
    />
  )
}
