import { useTranslation } from 'react-i18next'
import { type FormEvent, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { NewAsset } from '../../api/models/asset'
import { CIA_PROPERTIES } from './ciaProperties'

/** Dialog to add an asset to the current item. */
export function AddAssetDialog({ onAdd }: { onAdd: (asset: NewAsset) => Promise<unknown> }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setState('saving')
    try {
      await onAdd({
        name: String(form.get('name')),
        component: String(form.get('component')),
        properties: CIA_PROPERTIES.map((p) => p.value).filter((value) => form.has(value)),
      })
      setState('idle')
      setOpen(false)
    } catch {
      // Stay open so the input is not lost.
      setState('error')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (state === 'saving') return
        setState('idle')
        setOpen(next)
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden="true" />
          {t('ui:addAsset')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t('ui:addAsset')}</DialogTitle>
            <DialogDescription>Saved in the mock data until the asset API exists.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="asset-name">{t('ui:name')}</Label>
            <Input id="asset-name" name="name" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="asset-component">{t('ui:component')}</Label>
            <Input id="asset-component" name="component" required />
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">{t('ui:cybersecurityProperties')}</legend>
            {CIA_PROPERTIES.map((p) => (
              <Label key={p.value} className="font-normal">
                <input type="checkbox" name={p.value} />
                {t(p.label)}
              </Label>
            ))}
          </fieldset>
          {state === 'error' && (
            <p role="alert" className="text-sm text-destructive">
              {t('ui:addAssetError')}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={state === 'saving'}>
              {t('ui:save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
