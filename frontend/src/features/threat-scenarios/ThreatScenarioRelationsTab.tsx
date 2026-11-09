import { useParams } from 'react-router-dom'
import type { ThreatScenario } from '../../api/models/threatScenario'
import { useItemAttackPaths, useSetThreatAttackPathLink, useThreatScenario, useThreatScenarioRelations } from '../../api/queries/items'
import { LINK_SAVE_ERROR } from '../relations/messages'
import { RelationSection } from '../relations/RelationSection'
import { ThreatDamageSection } from './ThreatDamageSection'

/** Relations tab of a threat scenario ("TS Relations" wireframe): its damage scenarios and attack paths. */
export function ThreatScenarioRelationsTab() {
  const { projectId = '', entityId = '' } = useParams()
  const { data: scenario } = useThreatScenario(projectId, entityId)
  if (!scenario) return null
  // Remount on threat scenario change so errors of the previous one do not stay.
  return <Relations key={scenario.id} projectId={projectId} scenario={scenario} />
}

function Relations({ projectId, scenario }: { projectId: string; scenario: ThreatScenario }) {
  const relations = useThreatScenarioRelations(projectId, scenario.id)
  // Links stay within the item that owns the threat scenario.
  const itemPaths = useItemAttackPaths(projectId, scenario.item_definition_id)
  const pathLink = useSetThreatAttackPathLink(projectId, scenario.id)

  if (!relations.data) {
    return relations.isError ? (
      <p role="alert" className="text-sm text-destructive">The relations could not be loaded.</p>
    ) : (
      <output className="text-sm text-muted-foreground">Loading relations…</output>
    )
  }

  const { damageScenarios, attackPaths } = relations.data
  return (
    <div className="space-y-4">
      {relations.isError && (
        <p role="alert" className="text-sm text-destructive">The relations could not be refreshed.</p>
      )}
      <ThreatDamageSection projectId={projectId} scenario={scenario} linked={damageScenarios} />
      <RelationSection
        projectId={projectId}
        type="attack-paths"
        direction="down"
        title="Attack Paths"
        elementLabel="Attack Path"
        candidates={itemPaths.data?.filter((path) => !attackPaths.some((linked) => linked.id === path.id)) ?? []}
        candidatesLoading={itemPaths.isPending}
        candidatesError={itemPaths.isLoadingError ? 'The attack paths of this item could not be loaded.' : undefined}
        pending={pathLink.isPending}
        error={pathLink.isError ? LINK_SAVE_ERROR : undefined}
        onAdd={(attackPathId) => pathLink.mutate({ attackPathId, linked: true })}
        onRemove={(attackPathId) => pathLink.mutate({ attackPathId, linked: false })}
        rows={attackPaths}
      />
      <p className="text-xs text-muted-foreground">
        Removing a link does not delete the element. The targets are chosen on the Definition tab and end when no linked damage scenario leads to them anymore.
      </p>
    </div>
  )
}
