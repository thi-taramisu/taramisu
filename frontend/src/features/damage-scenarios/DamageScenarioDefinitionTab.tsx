import { useId, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { DamageScenario } from '../../api/models/damageScenario'
import { useDamageScenario, useUpdateDamageScenario } from '../../api/queries/items'

const TEXT_FIELDS = [
  {
    key: 'functionality_adverse_relation',
    label: 'Relation To Item Functionality',
    placeholder: 'Which function of the item fails or behaves wrongly, and how this leads to the adverse consequence',
  },
  { key: 'road_user_harm_description', label: 'Harm To Road User', placeholder: 'Harm to the road user, e.g. injury, financial loss or loss of privacy' },
] as const

type FormValues = Pick<DamageScenario, 'title'> & Record<(typeof TEXT_FIELDS)[number]['key'], string>

function toValues(scenario: DamageScenario): FormValues {
  return {
    title: scenario.title,
    functionality_adverse_relation: scenario.functionality_adverse_relation ?? '',
    road_user_harm_description: scenario.road_user_harm_description ?? '',
  }
}

/** Definition tab of a damage scenario ("DS Definition" wireframe): name and the fields of the data model. */
export function DamageScenarioDefinitionTab() {
  const { projectId = '', entityId = '' } = useParams()
  const { data: scenario } = useDamageScenario(projectId, entityId)
  if (!scenario) return null
  // Remount on damage scenario change so the form starts from the saved values.
  return <DefinitionForm key={scenario.id} projectId={projectId} scenario={scenario} />
}

function DefinitionForm({ projectId, scenario }: { projectId: string; scenario: DamageScenario }) {
  const id = useId()
  const [values, setValues] = useState(() => toValues(scenario))
  // Last saved state; kept here so a failed refetch cannot make the form dirty again.
  const [saved, setSaved] = useState(values)
  const [titleError, setTitleError] = useState<string>()
  const update = useUpdateDamageScenario(projectId, scenario.id)
  const dirty = (Object.keys(values) as (keyof FormValues)[]).some((key) =>
    // The title is saved trimmed, so surrounding spaces alone are no change.
    key === 'title' ? values.title.trim() !== saved.title : values[key] !== saved[key],
  )

  function change(key: keyof FormValues, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }))
    update.reset()
    if (key === 'title') setTitleError(undefined)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = values.title.trim()
    if (!title) {
      setTitleError('Name is required.')
      return
    }
    update.mutate(
      {
        title,
        functionality_adverse_relation: values.functionality_adverse_relation || null,
        road_user_harm_description: values.road_user_harm_description || null,
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
    <form onSubmit={handleSubmit} noValidate className="grid max-w-3xl gap-4">
      <p className="text-xs text-muted-foreground">Fields marked * are required.</p>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-title`}>Name *</Label>
        <Input
          id={`${id}-title`}
          value={values.title}
          required
          onChange={(event) => change('title', event.target.value)}
          aria-invalid={Boolean(titleError)}
          aria-describedby={titleError ? `${id}-title-error` : undefined}
        />
        {titleError && (
          <p id={`${id}-title-error`} role="alert" className="text-sm text-destructive">
            {titleError}
          </p>
        )}
      </div>
      {TEXT_FIELDS.map((field) => (
        <div key={field.key} className="grid gap-2">
          <Label htmlFor={`${id}-${field.key}`}>{field.label}</Label>
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
            The damage scenario could not be saved. Please try again.
          </p>
        )}
      </div>
    </form>
  )
}
