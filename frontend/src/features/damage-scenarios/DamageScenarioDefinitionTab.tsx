import { useTranslation } from 'react-i18next'
import { useId, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { DamageScenario } from '../../api/models/damageScenario'
import { useDamageScenario, useUpdateDamageScenario } from '../../api/queries/items'
import { useProjectAccess } from '../../api/queries/projects'

const TEXT_FIELDS = [
  {
    key: 'functionality_adverse_relation',
    label: 'ui:functionalityRelation',
    placeholder: 'ui:functionalityPlaceholder',
  },
  { key: 'road_user_harm_description', label: 'ui:roadUserHarm', placeholder: 'ui:roadUserHarmPlaceholder' },
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
  const { t } = useTranslation()
  const id = useId()
  const [values, setValues] = useState(() => toValues(scenario))
  // Last saved state; kept here so a failed refetch cannot make the form dirty again.
  const [saved, setSaved] = useState(values)
  const [titleError, setTitleError] = useState<string>()
  const update = useUpdateDamageScenario(projectId, scenario.id)
  const { canEdit } = useProjectAccess(projectId)
  const dirty = (Object.keys(values) as (keyof FormValues)[]).some((key) =>
    // The title is saved trimmed, so surrounding spaces alone are no change.
    key === 'title' ? values.title.trim() !== saved.title : values[key] !== saved[key],
  )

  function change(key: keyof FormValues, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }))
    // Keeps Save disabled while a request runs; resetting would also drop its success callback.
    if (!update.isPending) update.reset()
    if (key === 'title') setTitleError(undefined)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = values.title.trim()
    if (!title) {
      setTitleError('ui:nameRequired')
      return
    }
    update.mutate(
      {
        title,
        functionality_adverse_relation: values.functionality_adverse_relation || null,
        road_user_harm_description: values.road_user_harm_description || null,
      },
      {
        // Takes over the saved values only where nothing was edited while saving.
        onSuccess: (updated) => {
          setValues((current) => (current === values ? toValues(updated) : current))
          setSaved(toValues(updated))
        },
      },
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid max-w-3xl gap-4">
      {/* Read-only projects show the fields disabled and no Save. */}
      <fieldset disabled={!canEdit} className="contents">
        <p className="text-xs text-muted-foreground">{t('ui:requiredFields')}</p>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-title`}>{t('ui:requiredName')}</Label>
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
              {t(titleError)}
            </p>
          )}
        </div>
        {TEXT_FIELDS.map((field) => (
          <div key={field.key} className="grid gap-2">
            <Label htmlFor={`${id}-${field.key}`}>{t(field.label)}</Label>
            <Textarea
              id={`${id}-${field.key}`}
              value={values[field.key]}
              placeholder={t(field.placeholder)}
              onChange={(event) => change(field.key, event.target.value)}
            />
          </div>
        ))}
      </fieldset>
      {canEdit && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!dirty || update.isPending}>{t('ui:save')}</Button>
          <output aria-live="polite" className="text-sm text-muted-foreground">
            {update.isSuccess && !dirty && t('ui:saved')}
          </output>
          {update.isError && (
            <p role="alert" className="text-sm text-destructive">{t('ui:saveDamageError')}</p>
          )}
        </div>
      )}
    </form>
  )
}
