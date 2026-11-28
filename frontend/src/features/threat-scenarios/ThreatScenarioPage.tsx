import { useParams } from 'react-router-dom'
import { isExampleProject } from '../../api/mocks/data/headlamp'
import { useThreatScenario, useThreatScenarioRelations } from '../../api/queries/items'
import { useProjectAccess } from '../../api/queries/projects'
import { EntityDataPage } from '../workspace/EntityDataPage'
import { DeleteThreatScenarioDialog } from './DeleteThreatScenarioDialog'

/** Threat scenario page: header from the threat scenario API, tabs as child routes. */
export function ThreatScenarioPage() {
  const { projectId = '', entityId = '' } = useParams()
  const scenario = useThreatScenario(projectId, entityId)
  const example = isExampleProject(projectId)
  const relations = useThreatScenarioRelations(projectId, entityId, { enabled: example })
  const { canEdit } = useProjectAccess(projectId)

  return (
    <EntityDataPage
      type="threat-scenarios"
      projectId={projectId}
      entity={scenario}
      tabCounts={relations.data && { relations: relations.data.damageScenarios.length + relations.data.attackPaths.length }}
      actions={!example && canEdit && scenario.data && <DeleteThreatScenarioDialog projectId={projectId} scenario={scenario.data} />}
    />
  )
}
