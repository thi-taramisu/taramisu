import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { exampleProject } from '../../api/mocks/data/headlamp'
import type { AttackPath } from '../../api/models/attackPath'
import { useAttackPath, useAttackPathRelations, useItemThreatScenarios, useSetAttackPathThreatLink } from '../../api/queries/items'
import { RelationSection } from '../relations/RelationSection'
import { RelationsQueryStatus } from '../relations/RelationsQueryStatus'
import { CreateThreatScenarioDialog } from '../threat-scenarios/CreateThreatScenarioDialog'
import { formatEntityId } from '../workspace/entities'

/** Relations tab of an attack path ("AP Relations" wireframe): the threat scenarios it realizes. */
export function AttackPathRelationsTab() {
  const { projectId = '', entityId = '' } = useParams()
  const { data: path } = useAttackPath(projectId, entityId)
  if (!path) return null
  // Remount on attack path change so errors of the previous one do not stay.
  return <Relations key={path.id} projectId={projectId} path={path} />
}

function Relations({ projectId, path }: { projectId: string; path: AttackPath }) {
  const { t } = useTranslation()
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
        title={t('ui:relationThreatsTitle')}
        pluralLabel={t('ui:relationThreatsPlural')}
        elementLabel={t('entities.threat-scenarios')}
        candidates={itemThreats.data?.filter((threat) => !threatScenarios.some((linked) => linked.id === threat.id)) ?? []}
        candidatesLoading={itemThreats.isPending}
        candidatesError={itemThreats.isLoadingError ? t('ui:loadItemThreatsError') : undefined}
        pending={link.isPending}
        error={link.isError ? t('ui:saveRelationError') : undefined}
        onAdd={(id) => link.mutate({ id, linked: true })}
        onRemove={(id) => link.mutate({ id, linked: false })}
        rows={threatScenarios}
        renderCreateDialog={(dialog) => (
          <CreateThreatScenarioDialog
            {...dialog}
            projectId={projectId}
            projectName={exampleProject.name}
            lockedItemId={path.item_definition_id}
            onCreated={(created) => link.mutateAsync({ id: created.id, linked: true })}
            onCreatedError={(created) => t('ui:createdLinkError', { code: formatEntityId(created.code) })}
          />
        )}
      />
      <p className="text-xs text-muted-foreground">{t('ui:removingALinkDoesNotDeleteTheElement')}</p>
    </div>
  )
}
