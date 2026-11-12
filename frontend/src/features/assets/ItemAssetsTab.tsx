import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CiaProperties, RiskBadge } from '../items/RiskBadge'
import { exampleProject } from '../../api/mocks/data/headlamp'
import { useItemAssets } from '../../api/queries/items'
import { entityPath } from '../workspace/entities'
import { CreateAssetDialog } from './CreateAssetDialog'

/** Assets tab of an item (interactive wireframe): table of the item's assets and "Add Asset". */
export function ItemAssetsTab() {
  const { projectId = '', entityId = '' } = useParams()
  const { data: assets, isError } = useItemAssets(projectId, entityId)
  // A new key per opening, so the dialog starts empty.
  const [dialog, setDialog] = useState({ open: false, key: 0 })
  const [addButton, setAddButton] = useState<HTMLButtonElement | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">Assets belong to this item. Their links are edited on each asset's Relations tab.</p>
        <Button ref={setAddButton} onClick={() => setDialog(({ key }) => ({ open: true, key: key + 1 }))}>
          <Plus aria-hidden="true" />
          Add Asset
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
      </div>
      {isError && (
        <p role="alert" className="text-sm text-destructive">
          The assets could not be loaded.
        </p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Asset</TableHead>
            <TableHead>Component / interface</TableHead>
            <TableHead>Properties</TableHead>
            <TableHead>Damage</TableHead>
            <TableHead>Threats</TableHead>
            <TableHead>Max related</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assets?.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground">
                No assets yet.
              </TableCell>
            </TableRow>
          )}
          {assets?.map((asset) => (
            <TableRow key={asset.id}>
              <TableCell className="font-mono text-xs text-muted-foreground">{asset.code}</TableCell>
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
