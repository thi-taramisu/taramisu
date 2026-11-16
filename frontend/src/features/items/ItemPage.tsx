import { Link, useParams } from 'react-router-dom'
import { EntityPage } from '../workspace/EntityPage'
import { DeleteItemDialog } from './DeleteItemDialog'
import { isNotFound } from '../../api/errors'
import { useItem, useItemAssets } from '../../api/queries/items'
import { useTranslation } from 'react-i18next'

/** Item page: header from the item API, delete action and the asset count on the Assets tab. */
export function ItemPage() {
  const { t } = useTranslation()
  const { projectId = '', entityId = '' } = useParams()
  const item = useItem(projectId, entityId)
  const assets = useItemAssets(projectId, entityId)

  if (isNotFound(item.error)) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{t('ui:itemNotFound')}</h1>
        <p className="text-sm text-muted-foreground">{t('ui:itemMissing')}</p>
        <Link to={`/projects/${projectId}`} className="text-sm hover:underline">
          {t('navigation.backToProject')}
        </Link>
      </div>
    )
  }
  if (!item.data) {
    return item.isError ? (
      <p role="alert" className="text-sm text-destructive">{t('ui:loadItemError')}</p>
    ) : (
      <output className="text-sm text-muted-foreground">{t('ui:loadingItem')}</output>
    )
  }

  return (
    <EntityPage
      type="items"
      name={item.data.name}
      actions={
        <>
          {/* A failed refetch keeps the loaded item, so unsaved edits in the tabs survive. */}
          {item.isError && (
            <p role="alert" className="self-center text-sm text-destructive">
              {t('ui:refreshItemError')}
            </p>
          )}
          <DeleteItemDialog item={item.data} />
        </>
      }
      tabLabels={assets.data ? { assets: t('navigation.assetsWithCount', { count: assets.data.length }) } : undefined}
    />
  )
}
