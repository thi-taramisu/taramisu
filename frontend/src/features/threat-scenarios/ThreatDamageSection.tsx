import { useTranslation } from 'react-i18next'
import { exampleProject } from '../../api/mocks/data/headlamp'
import type { ThreatScenario, ThreatScenarioRelations } from '../../api/models/threatScenario'
import { useItemDamageScenarios, useSetThreatDamageLink } from '../../api/queries/items'
import { CreateDamageScenarioDialog } from '../damage-scenarios/CreateDamageScenarioDialog'
import { RelationSection } from '../relations/RelationSection'
import { formatEntityId } from '../workspace/entities'

interface ThreatDamageSectionProps {
  projectId: string
  scenario: ThreatScenario
  linked: ThreatScenarioRelations['damageScenarios']
}

/** Damage scenarios of a threat scenario on its Relations tab; new ones can be created and linked in one go. */
export function ThreatDamageSection({ projectId, scenario, linked }: ThreatDamageSectionProps) {
  const { t } = useTranslation()
  // Links stay within the item that owns the threat scenario.
  const itemScenarios = useItemDamageScenarios(projectId, scenario.item_definition_id)
  const link = useSetThreatDamageLink(projectId, scenario.id)

  return (
    <RelationSection
      projectId={projectId}
      type="damage-scenarios"
      direction="up"
      title={t('ui:relationDamageTitle')}
      pluralLabel={t('ui:relationDamagePlural')}
      removeEffect={t('ui:removeLinkWithTargets')}
      elementLabel={t('entities.damage-scenarios')}
      rows={linked}
      candidates={itemScenarios.data?.filter((ds) => !linked.some((l) => l.id === ds.id)) ?? []}
      candidatesLoading={itemScenarios.isPending}
      candidatesError={itemScenarios.isLoadingError ? t('ui:loadItemDamageError') : undefined}
      pending={link.isPending}
      error={link.isError ? t('ui:saveRelationError') : undefined}
      onAdd={(id) => link.mutate({ id, linked: true })}
      onRemove={(id) => link.mutate({ id, linked: false })}
      renderCreateDialog={(dialog) => (
        <CreateDamageScenarioDialog
          {...dialog}
          projectId={projectId}
          projectName={exampleProject.name}
          lockedItemId={scenario.item_definition_id}
          onCreated={(created) => link.mutateAsync({ id: created.id, linked: true })}
          onCreatedError={(created) => t('ui:createdLinkError', { code: formatEntityId(created.code) })}
        />
      )}
    />
  )
}
