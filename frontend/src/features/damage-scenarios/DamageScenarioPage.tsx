import { Link, useParams } from 'react-router-dom'
import { isNotFound } from '../../api/errors'
import { useDamageScenario, useDamageScenarioRelations } from '../../api/queries/items'
import { entityTitle } from '../workspace/entities'
import { EntityPage } from '../workspace/EntityPage'

/** Damage scenario page: header from the damage scenario API, tabs as child routes. */
export function DamageScenarioPage() {
  const { projectId = '', entityId = '' } = useParams()
  const scenario = useDamageScenario(projectId, entityId)
  const relations = useDamageScenarioRelations(projectId, entityId)

  if (isNotFound(scenario.error)) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Damage scenario not found</h1>
        <p className="text-sm text-muted-foreground">The damage scenario does not exist or was deleted.</p>
        <Link to={`/projects/${projectId}`} className="text-sm hover:underline">
          Back to project
        </Link>
      </div>
    )
  }
  if (!scenario.data) {
    return scenario.isError ? (
      <p role="alert" className="text-sm text-destructive">The damage scenario could not be loaded.</p>
    ) : (
      <output className="text-sm text-muted-foreground">Loading damage scenario…</output>
    )
  }

  return (
    <EntityPage
      type="damage-scenarios"
      title={entityTitle({ code: scenario.data.code, name: scenario.data.title })}
      tabCounts={relations.data && { relations: relations.data.assets.length + relations.data.threatScenarios.length }}
      actions={
        // A failed refetch keeps the loaded damage scenario, so unsaved edits in the tabs survive.
        scenario.isError && (
          <p role="alert" className="self-center text-sm text-destructive">
            The damage scenario could not be refreshed.
          </p>
        )
      }
    />
  )
}
