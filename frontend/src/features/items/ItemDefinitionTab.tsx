import { useId, useState, type FormEvent } from 'react'
import { Upload } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ItemDefinitionDiagram } from '../item-definition/ItemDefinitionDiagram'
import { ITEM_NAME_MAX_LENGTH, type ItemDefinition } from './itemApi'
import { useItem, useUpdateItem } from './queries'

// The React Flow diagram only exists for the headlamp example so far.
const EXAMPLE_DIAGRAM_ITEM = 'i-01'

const TEXT_FIELDS = [
  { key: 'boundary', label: 'Boundary', placeholder: 'What belongs to the item, what is outside, and the interfaces that cross the boundary' },
  { key: 'functions', label: 'Functions', placeholder: 'Functions of the item at vehicle level' },
  { key: 'operational_environment', label: 'Operational Environment', placeholder: 'Connectivity, update paths, workshop access' },
] as const

type FormValues = Pick<ItemDefinition, 'name'> & Record<(typeof TEXT_FIELDS)[number]['key'], string>

function toValues(item: ItemDefinition): FormValues {
  return {
    name: item.name,
    boundary: item.boundary ?? '',
    functions: item.functions ?? '',
    operational_environment: item.operational_environment ?? '',
  }
}

/** Definition tab of an item (interactive wireframe): name, boundary, functions, environment, files. */
export function ItemDefinitionTab() {
  const { projectId = '', entityId = '' } = useParams()
  const { data: item } = useItem(projectId, entityId)
  if (!item) return null
  // Remount on item change so the form starts from the saved values.
  return <DefinitionForm key={item.id} item={item} />
}

function DefinitionForm({ item }: { item: ItemDefinition }) {
  const id = useId()
  const [values, setValues] = useState(() => toValues(item))
  // Last saved state; kept here so a failed refetch of the item cannot make the form dirty again.
  const [saved, setSaved] = useState(values)
  const [nameError, setNameError] = useState<string>()
  const update = useUpdateItem(item.tara_project_id, item.id)
  const dirty = (Object.keys(values) as (keyof FormValues)[]).some((key) =>
    // The name is saved trimmed, so surrounding spaces alone are no change.
    key === 'name' ? values.name.trim() !== saved.name : values[key] !== saved[key],
  )

  function change(key: keyof FormValues, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }))
    update.reset()
    if (key === 'name') setNameError(undefined)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = values.name.trim()
    if (!name) {
      setNameError('Name is required.')
      return
    }
    update.mutate(
      {
        name,
        boundary: values.boundary || null,
        functions: values.functions || null,
        operational_environment: values.operational_environment || null,
      },
      {
        onSuccess: (updated) => {
          setValues(toValues(updated))
          setSaved(toValues(updated))
        },
      },
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <form onSubmit={handleSubmit} noValidate className="grid gap-4">
        <p className="text-xs text-muted-foreground">Fields marked * are needed before the item definition is complete.</p>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-name`}>Name *</Label>
          <Input
            id={`${id}-name`}
            value={values.name}
            required
            maxLength={ITEM_NAME_MAX_LENGTH}
            onChange={(event) => change('name', event.target.value)}
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? `${id}-name-error` : undefined}
          />
          {nameError && (
            <p id={`${id}-name-error`} role="alert" className="text-sm text-destructive">
              {nameError}
            </p>
          )}
        </div>
        {TEXT_FIELDS.map((field) => (
          <div key={field.key} className="grid gap-2">
            <Label htmlFor={`${id}-${field.key}`}>{field.label} *</Label>
            <Textarea
              id={`${id}-${field.key}`}
              value={values[field.key]}
              placeholder={field.placeholder}
              onChange={(event) => change(field.key, event.target.value)}
            />
          </div>
        ))}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!dirty || update.isPending}>
            Save
          </Button>
          <output aria-live="polite" className="text-sm text-muted-foreground">
            {update.isSuccess && !dirty && 'Saved.'}
          </output>
          {update.isError && (
            <p role="alert" className="text-sm text-destructive">
              The item could not be saved. Please try again.
            </p>
          )}
        </div>
      </form>

      <section aria-labelledby={`${id}-files`} className="overflow-hidden rounded-lg border">
        <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-2">
          <h2 id={`${id}-files`} className="text-sm font-medium">
            Supporting files
          </h2>
          <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground">0</span>
          <span className="text-xs text-muted-foreground">sketches, architecture, interface lists · optional, never a substitute for the written definition</span>
        </div>
        <div className="p-4">
          <div className="flex w-56 flex-col items-center gap-1 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            <Upload aria-hidden="true" className="size-4" />
            <span>Drop files here or browse</span>
            <span className="text-xs">File upload follows with the attachment API (#79)</span>
          </div>
        </div>
      </section>

      {item.id === EXAMPLE_DIAGRAM_ITEM && (
        <section aria-label="Item diagram" className="h-[480px] overflow-hidden rounded-lg border">
          <ItemDefinitionDiagram />
        </section>
      )}
    </div>
  )
}
