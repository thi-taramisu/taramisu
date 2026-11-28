import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CiaProperties, RiskBadge } from '../items/RiskBadge'
import { exampleProject } from '../../api/mocks/data/headlamp'
import { useItemAssets } from '../../api/queries/items'
import { useProjectAccess } from '../../api/queries/projects'
import { entityPath, formatEntityId } from '../workspace/entities'
import { CreateAssetDialog } from './CreateAssetDialog'

/** Assets tab of an item (interactive wireframe): table of the item's assets and "Add Asset". */
export function ItemAssetsTab() {
  const { t } = useTranslation()
  const { projectId = '', entityId = '' } = useParams()
  const { data: assets, isError } = useItemAssets(projectId, entityId)
  const { canEdit } = useProjectAccess(projectId)
  // A new key per opening, so the dialog starts empty.
  const [dialog, setDialog] = useState({ open: false, key: 0 })
  const [addButton, setAddButton] = useState<HTMLButtonElement | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">{t('ui:assetsDescription')}</p>
        {canEdit && (
          <>
            <Button ref={setAddButton} onClick={() => setDialog(({ key }) => ({ open: true, key: key + 1 }))}>
              <Plus aria-hidden="true" />
              {t('ui:addAsset')}
            </Button>
            <CreateAssetDialog
              key={dialog.key}
              projectId={projectId}
              projectName={exampleProject.name}
              lockedItemId={entityId}
              open={dialog.open}
              onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
              returnFocusTo={addButton}
            />
          </>
        )}
      </div>
      {isError && (
        <p role="alert" className="text-sm text-destructive">
          {t('ui:loadAssetsError')}
        </p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('ui:id')}</TableHead>
            <TableHead>{t('entities.assets')}</TableHead>
            <TableHead>{t('ui:componentInterface')}</TableHead>
            <TableHead>{t('ui:properties')}</TableHead>
            <TableHead>{t('ui:damage')}</TableHead>
            <TableHead>{t('ui:threats')}</TableHead>
            <TableHead>{t('ui:maxRelated')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assets?.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground">
                {t('ui:noAssets')}
              </TableCell>
            </TableRow>
          )}
          {assets?.map((asset) => (
            <TableRow key={asset.id}>
              <TableCell className="font-mono text-xs text-muted-foreground">{formatEntityId(asset.code)}</TableCell>
              <TableCell className="font-medium">
                <Link to={entityPath(projectId, 'assets', asset.id)} className="hover:underline">
                  {asset.name}
                </Link>
              </TableCell>
              <TableCell>{asset.component}</TableCell>
              <TableCell>
                <CiaProperties properties={asset.properties} />
              </TableCell>
              <TableCell>{asset.damageScenarios}</TableCell>
              <TableCell>{asset.threatScenarios}</TableCell>
              <TableCell>{asset.maxRisk !== null && <RiskBadge value={asset.maxRisk} prefix="" />}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
