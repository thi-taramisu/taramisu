import { useId, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { cn } from '@/lib/utils'
import type { AnalysisApproach, AttackPath, AttackStep } from '../../api/models/attackPath'
import { useAttackPath, useUpdateAttackPath } from '../../api/queries/items'
import { AttackStepsField, type StepDraft } from './AttackStepsField'

const APPROACHES: { value: AnalysisApproach; label: string }[] = [
  { value: 'TOP_DOWN', label: 'Top-Down' },
  { value: 'BOTTOM_UP', label: 'Bottom-Up' },
]

interface FormValues {
  title: string
  /** Empty while no approach is chosen. */
  analysis_approach: AnalysisApproach | ''
  is_partial_early_stage: boolean
}

function toValues(path: AttackPath): FormValues {
  return { title: path.title, analysis_approach: path.analysis_approach ?? '', is_partial_early_stage: path.is_partial_early_stage }
}

function toDrafts(steps: AttackStep[] | null): StepDraft[] {
  return (steps ?? []).map((step, index) => ({ key: index + 1, description: step.description }))
}

/** Steps without text are not saved. */
function toSteps(drafts: StepDraft[]): AttackStep[] {
  return drafts.map((draft) => ({ description: draft.description.trim() })).filter((step) => step.description)
}

/** Definition tab of an attack path ("AP Definition" wireframe): the fields of the data model and the ordered steps. */
export function AttackPathDefinitionTab() {
  const { projectId = '', entityId = '' } = useParams()
  const { data: path } = useAttackPath(projectId, entityId)
  if (!path) return null
  // Remount on attack path change so the form starts from the saved values.
  return <DefinitionForm key={path.id} projectId={projectId} path={path} />
}

function DefinitionForm({ projectId, path }: { projectId: string; path: AttackPath }) {
  const id = useId()
  const [values, setValues] = useState(() => toValues(path))
  const [steps, setSteps] = useState(() => toDrafts(path.attack_steps_and_weaknesses))
  // Last saved state; kept here so a failed refetch cannot make the form dirty again.
  const [saved, setSaved] = useState(path)
  const [titleError, setTitleError] = useState<string>()
  const update = useUpdateAttackPath(projectId, path.id)
  const dirty =
    values.title.trim() !== saved.title ||
    (values.analysis_approach || null) !== saved.analysis_approach ||
    values.is_partial_early_stage !== saved.is_partial_early_stage ||
    JSON.stringify(toSteps(steps)) !== JSON.stringify(saved.attack_steps_and_weaknesses ?? [])

  function change(next: Partial<FormValues>) {
    setValues((prev) => ({ ...prev, ...next }))
    update.reset()
    if ('title' in next) setTitleError(undefined)
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
        analysis_approach: values.analysis_approach || null,
        is_partial_early_stage: values.is_partial_early_stage,
        attack_steps_and_weaknesses: toSteps(steps),
      },
      {
        onSuccess: (updated) => {
          setValues(toValues(updated))
          setSteps(toDrafts(updated.attack_steps_and_weaknesses))
          setSaved(updated)
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
          onChange={(event) => change({ title: event.target.value })}
          aria-invalid={Boolean(titleError)}
          aria-describedby={titleError ? `${id}-title-error` : undefined}
        />
        {titleError && (
          <p id={`${id}-title-error`} role="alert" className="text-sm text-destructive">
            {titleError}
          </p>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-approach`}>Analysis Approach</Label>
        <NativeSelect
          id={`${id}-approach`}
          value={values.analysis_approach}
          onChange={(event) => change({ analysis_approach: event.target.value as FormValues['analysis_approach'] })}
          className={cn('w-full', !values.analysis_approach && 'text-muted-foreground')}
        >
          <NativeSelectOption value="">Select…</NativeSelectOption>
          {APPROACHES.map((approach) => (
            <NativeSelectOption key={approach.value} value={approach.value}>
              {approach.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <hr className="border-border" />
      <AttackStepsField
        actions={
          <Label className="font-normal">
            <Checkbox checked={values.is_partial_early_stage} onCheckedChange={(checked) => change({ is_partial_early_stage: checked === true })} />
            Partial Attack Path
          </Label>
        }
        steps={steps}
        onChange={(next) => {
          setSteps(next)
          update.reset()
        }}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!dirty || update.isPending}>
          Save
        </Button>
        <output aria-live="polite" className="text-sm text-muted-foreground">
          {update.isSuccess && !dirty && 'Saved.'}
        </output>
        {update.isError && (
          <p role="alert" className="text-sm text-destructive">
            The attack path could not be saved. Please try again.
          </p>
        )}
      </div>
    </form>
  )
}
