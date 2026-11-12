import { useParams } from 'react-router-dom'
import { useAsset, useAssetRelations } from '../../api/queries/items'
import { EntityDataPage } from '../workspace/EntityDataPage'

/** Asset page: header from the asset API, tabs as child routes. */
export function AssetPage() {
  const { projectId = '', entityId = '' } = useParams()
  const asset = useAsset(projectId, entityId)
  const relations = useAssetRelations(projectId, entityId)

  return (
    <EntityDataPage
      type="assets"
      projectId={projectId}
      entity={asset}
      tabCounts={relations.data && { relations: relations.data.damageScenarios.length + relations.data.threatScenarios.length }}
    />
  )
}
