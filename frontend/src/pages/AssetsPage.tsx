import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AddAssetDialog } from '../features/assets/AddAssetDialog'
import { type Asset, headlampAssets } from '../features/assets/headlampAssets'

/** Example page built from shadcn/ui components (card, table, badge, dialog, form). */
export function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>(headlampAssets)

  return (
    <main className="mx-auto max-w-4xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1>Assets: Headlamp system (example)</h1>
          </CardTitle>
          <CardDescription>Assets with their cybersecurity properties (C / I / A).</CardDescription>
          <CardAction>
            <AddAssetDialog
              onAdd={(asset) => setAssets((prev) => [...prev, { ...asset, id: crypto.randomUUID() }])}
            />
          </CardAction>
        </CardHeader>
        <CardContent>
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
                  <TableCell className="font-medium">{asset.name}</TableCell>
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
        </CardContent>
      </Card>
    </main>
  )
}
