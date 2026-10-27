import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { entityPath } from '../workspace/entities'
import { AddAssetDialog } from './AddAssetDialog'
import { type Asset, headlampAssets } from './headlampAssets'

/** Assets tab of an item: table with C / I / A and an "Add asset" dialog (shadcn/ui example). */
export function ItemAssetsTab() {
  const { projectId = '' } = useParams()
  const [assets, setAssets] = useState<Asset[]>(headlampAssets)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AddAssetDialog onAdd={(asset) => setAssets((prev) => [...prev, { ...asset, id: crypto.randomUUID() }])} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Asset</TableHead>
            <TableHead>Component</TableHead>
            <TableHead>Properties</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assets.map((asset) => (
            <TableRow key={asset.id}>
              <TableCell className="font-medium">
                <Link to={entityPath(projectId, 'assets', asset.id)} className="hover:underline">
                  {asset.name}
                </Link>
              </TableCell>
              <TableCell>{asset.component}</TableCell>
              <TableCell className="space-x-1">
                {asset.properties.map((p) => (
                  <Badge key={p} variant="secondary">
                    {p}
                  </Badge>
                ))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
