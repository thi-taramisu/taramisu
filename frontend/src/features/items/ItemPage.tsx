import { Link, useParams } from 'react-router-dom'
import { EntityPage } from '../workspace/EntityPage'
import { DeleteItemDialog } from './DeleteItemDialog'
import { isNotFound } from './itemApi'
import { useItem, useItemAssets } from './queries'

/** Item page: header from the item API, delete action and the asset count on the Assets tab. */
export function ItemPage() {
  const { projectId = '', entityId = '' } = useParams()
  const item = useItem(projectId, entityId)
  const assets = useItemAssets(projectId, entityId)

  if (isNotFound(item.error)) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Item not found</h1>
        <p className="text-sm text-muted-foreground">The item does not exist or was deleted.</p>
        <Link to={`/projects/${projectId}`} className="text-sm hover:underline">
          Back to project
        </Link>
      </div>
    )
  }
  if (!item.data) {
    return item.isError ? (
      <p role="alert" className="text-sm text-destructive">The item could not be loaded.</p>
    ) : (
      <output className="text-sm text-muted-foreground">Loading item…</output>
    )
  }

  return (
    <EntityPage
      type="items"
      title={item.data.name}
      actions={
        <>
          {/* A failed refetch keeps the loaded item, so unsaved edits in the tabs survive. */}
          {item.isError && (
            <p role="alert" className="self-center text-sm text-destructive">
              The item could not be refreshed.
            </p>
          )}
          <DeleteItemDialog item={item.data} />
        </>
      }
      tabLabels={assets.data ? { assets: `Assets (${assets.data.length})` } : undefined}
    />
  )
}
