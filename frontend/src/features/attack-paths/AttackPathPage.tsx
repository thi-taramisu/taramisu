import { useParams } from 'react-router-dom'
import { useAttackPath, useAttackPathRelations } from '../../api/queries/items'
import { EntityDataPage } from '../workspace/EntityDataPage'

/** Attack path page: header from the attack path API, tabs as child routes. */
export function AttackPathPage() {
  const { projectId = '', entityId = '' } = useParams()
  const attackPath = useAttackPath(projectId, entityId)
  const relations = useAttackPathRelations(projectId, entityId)

  return (
    <EntityDataPage
      type="attack-paths"
      projectId={projectId}
      entity={attackPath}
      tabCounts={relations.data && { relations: relations.data.threatScenarios.length }}
    />
  )
}
