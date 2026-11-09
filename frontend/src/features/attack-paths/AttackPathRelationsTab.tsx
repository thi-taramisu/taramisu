import { useParams } from 'react-router-dom'
import type { AttackPath } from '../../api/models/attackPath'
import { useAttackPath, useAttackPathRelations, useItemThreatScenarios, useSetAttackPathThreatLink } from '../../api/queries/items'
import { LINK_SAVE_ERROR } from '../relations/messages'
import { RelationSection } from '../relations/RelationSection'
import { RelationsQueryStatus } from '../relations/RelationsQueryStatus'

/** Relations tab of an attack path ("AP Relations" wireframe): the threat scenarios it realizes. */
export function AttackPathRelationsTab() {
  const { projectId = '', entityId = '' } = useParams()
  const { data: path } = useAttackPath(projectId, entityId)
  if (!path) return null
  // Remount on attack path change so errors of the previous one do not stay.
  return <Relations key={path.id} projectId={projectId} path={path} />
}

function Relations({ projectId, path }: { projectId: string; path: AttackPath }) {
  const relations = useAttackPathRelations(projectId, path.id)
  // Links stay within the item that owns the attack path.
  const itemThreats = useItemThreatScenarios(projectId, path.item_definition_id)
  const link = useSetAttackPathThreatLink(projectId, path.id)

  if (!relations.data) return <RelationsQueryStatus query={relations} />

  const { threatScenarios } = relations.data
  return (
    <div className="space-y-4">
      <RelationsQueryStatus query={relations} />
      <RelationSection
        projectId={projectId}
        type="threat-scenarios"
        direction="up"
        title="Threat Scenarios"
        elementLabel="Threat Scenario"
        candidates={itemThreats.data?.filter((threat) => !threatScenarios.some((linked) => linked.id === threat.id)) ?? []}
        candidatesLoading={itemThreats.isPending}
        candidatesError={itemThreats.isLoadingError ? 'The threat scenarios of this item could not be loaded.' : undefined}
        pending={link.isPending}
        error={link.isError ? LINK_SAVE_ERROR : undefined}
        onAdd={(id) => link.mutate({ id, linked: true })}
        onRemove={(id) => link.mutate({ id, linked: false })}
        rows={threatScenarios}
      />
      <p className="text-xs text-muted-foreground">Removing a link does not delete the element.</p>
    </div>
  )
}
