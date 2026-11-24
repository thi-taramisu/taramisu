import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { exampleProject } from '../../api/mocks/data/headlamp'
import type { ThreatScenario } from '../../api/models/threatScenario'
import { useItemAttackPaths, useSetThreatAttackPathLink, useThreatScenario, useThreatScenarioRelations } from '../../api/queries/items'
import { CreateAttackPathDialog } from '../attack-paths/CreateAttackPathDialog'
import { RelationSection } from '../relations/RelationSection'
import { RelationsQueryStatus } from '../relations/RelationsQueryStatus'
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
  const { t } = useTranslation()
  const relations = useThreatScenarioRelations(projectId, scenario.id)
  // Links stay within the item that owns the threat scenario.
  const itemPaths = useItemAttackPaths(projectId, scenario.item_definition_id)
  const pathLink = useSetThreatAttackPathLink(projectId, scenario.id)

  if (!relations.data) return <RelationsQueryStatus query={relations} />

  const { damageScenarios, attackPaths } = relations.data
  return (
    <div className="space-y-4">
      <RelationsQueryStatus query={relations} />
      <ThreatDamageSection projectId={projectId} scenario={scenario} linked={damageScenarios} />
      <RelationSection
        projectId={projectId}
        type="attack-paths"
        direction="down"
        title={t('ui:relationPathsTitle')}
        pluralLabel={t('ui:relationPathsPlural')}
        elementLabel={t('entities.attack-paths')}
        candidates={itemPaths.data?.filter((path) => !attackPaths.some((linked) => linked.id === path.id)) ?? []}
        candidatesLoading={itemPaths.isPending}
        candidatesError={itemPaths.isLoadingError ? t('ui:loadItemPathsError') : undefined}
        pending={pathLink.isPending}
        error={pathLink.isError ? t('ui:saveRelationError') : undefined}
        onAdd={(id) => pathLink.mutate({ id, linked: true })}
        onRemove={(id) => pathLink.mutate({ id, linked: false })}
        rows={attackPaths}
        // Opened on this threat scenario's page, the dialog starts linked to it.
        renderCreateDialog={(dialog) => (
          <CreateAttackPathDialog {...dialog} projectId={projectId} projectName={exampleProject.name} lockedItemId={scenario.item_definition_id} />
        )}
      />
      <p className="text-xs text-muted-foreground">
        {t('ui:threatRelationsHint')}
      </p>
    </div>
  )
}
