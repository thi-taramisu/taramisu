import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { ItemAsset } from '../../api/models/asset'

/** "Add Asset" button of the create dialog with the assets that can still be linked. */
export function AddAssetMenu({ assets, onAdd }: { assets: ItemAsset[]; onAdd: (asset: ItemAsset) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="justify-self-start border-dashed" disabled={assets.length === 0}>
          <Plus aria-hidden="true" />
          Add Asset
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {assets.map((asset) => (
          <DropdownMenuItem key={asset.id} onSelect={() => onAdd(asset)}>
            <span className="font-mono text-xs text-muted-foreground">{asset.code}</span> {asset.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
