import { useId, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { ElicitationMethod, ThreatScenario, ThreatScenarioRelations, ThreatTarget } from '../../api/models/threatScenario'
import { useSaveThreatDefinition, useThreatScenario, useThreatScenarioRelations } from '../../api/queries/items'
import { entityPath } from '../workspace/entities'
import { hasSameTargets } from './targetSelection'
import { ThreatTargetsField } from './ThreatTargetsField'

const ELICITATION_METHODS: { value: ElicitationMethod; label: string }[] = [
  { value: 'GROUP_DISCUSSION', label: 'Group Discussion' },
  { value: 'MALICIOUS_USE_CASE', label: 'Malicious Use Case' },
  { value: 'EVITA', label: 'EVITA' },
  { value: 'TVRA', label: 'TVRA' },
  { value: 'PASTA', label: 'PASTA' },
  { value: 'STRIDE', label: 'STRIDE' },
  { value: 'OTHER', label: 'Other' },
]

interface FormValues {
  title: string
  cause_of_compromise: string
  /** Empty while no method is chosen. */
  elicitation_method: ElicitationMethod | ''
  technical_notes: string
}

function toValues(scenario: ThreatScenario): FormValues {
  return {
    title: scenario.title,
    cause_of_compromise: scenario.cause_of_compromise ?? '',
    elicitation_method: scenario.elicitation_method ?? '',
    technical_notes: scenario.technical_notes ?? '',
  }
}

/** Definition tab of a threat scenario ("TS Definition" wireframe): the fields of the data model and the targets, saved together. */
export function ThreatScenarioDefinitionTab() {
  const { projectId = '', entityId = '' } = useParams()
  const { data: scenario } = useThreatScenario(projectId, entityId)
  const relations = useThreatScenarioRelations(projectId, entityId)
  if (!scenario) return null
  if (!relations.data) {
    return relations.isError ? (
      <p role="alert" className="text-sm text-destructive">The targets could not be loaded.</p>
    ) : (
      <output className="text-sm text-muted-foreground">Loading targets…</output>
    )
  }
  // Remount on threat scenario change so the form starts from the saved values.
  return <DefinitionForm key={scenario.id} projectId={projectId} scenario={scenario} relations={relations.data} />
}

function DefinitionForm({ projectId, scenario, relations }: { projectId: string; scenario: ThreatScenario; relations: ThreatScenarioRelations }) {
  const id = useId()
  const [values, setValues] = useState(() => toValues(scenario))
  // Last saved state; kept here so a failed refetch cannot make the form dirty again.
  const [saved, setSaved] = useState(values)
  const [targets, setTargets] = useState<ThreatTarget[]>(relations.targets)
  const [savedTargets, setSavedTargets] = useState(relations.targets)
  // The form can start from a cached list; targets that no linked damage scenario leads to anymore are gone.
  const causes = relations.damageScenarios.flatMap((ds) => ds.causes)
  const isCause = (target: ThreatTarget) => causes.some((cause) => cause.asset.id === target.assetId && cause.property === target.property)
  const currentTargets = targets.filter(isCause)
  const [titleError, setTitleError] = useState<string>()
  const save = useSaveThreatDefinition(projectId, scenario.id)
  const dirty =
    !hasSameTargets(currentTargets, savedTargets.filter(isCause)) ||
    (Object.keys(values) as (keyof FormValues)[]).some((key) =>
      // The title is saved trimmed, so surrounding spaces alone are no change.
      key === 'title' ? values.title.trim() !== saved.title : values[key] !== saved[key],
    )

  function change(next: Partial<FormValues>) {
    setValues((prev) => ({ ...prev, ...next }))
    save.reset()
    if ('title' in next) setTitleError(undefined)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = values.title.trim()
    if (!title) {
      setTitleError('Name is required.')
      return
    }
    save.mutate(
      {
        body: {
          title,
          cause_of_compromise: values.cause_of_compromise || null,
          elicitation_method: values.elicitation_method || null,
          technical_notes: values.technical_notes || null,
        },
        targets: currentTargets,
      },
      {
        onSuccess: (result) => {
          setValues(toValues(result.scenario))
          setSaved(toValues(result.scenario))
          setTargets(result.relations.targets)
          setSavedTargets(result.relations.targets)
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
        <Label htmlFor={`${id}-cause`}>Cause of Compromise</Label>
        <Input
          id={`${id}-cause`}
          value={values.cause_of_compromise}
          placeholder="How the property is compromised, e.g. spoofing, tampering or denial of service"
          onChange={(event) => change({ cause_of_compromise: event.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-elicitation`}>Elicitation</Label>
        <NativeSelect
          id={`${id}-elicitation`}
          value={values.elicitation_method}
          onChange={(event) => change({ elicitation_method: event.target.value as FormValues['elicitation_method'] })}
          className={cn('w-full', !values.elicitation_method && 'text-muted-foreground')}
        >
          <NativeSelectOption value="">Select…</NativeSelectOption>
          {ELICITATION_METHODS.map((method) => (
            <NativeSelectOption key={method.value} value={method.value}>
              {method.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-notes`}>Technical Notes</Label>
        <Textarea
          id={`${id}-notes`}
          value={values.technical_notes}
          placeholder="Interdependencies, attackers, tools and attack surfaces"
          onChange={(event) => change({ technical_notes: event.target.value })}
        />
      </div>
      <ThreatTargetsField
        damageScenarios={relations.damageScenarios}
        value={currentTargets}
        onChange={(next) => {
          setTargets(next)
          save.reset()
        }}
        relationsPath={`${entityPath(projectId, 'threat-scenarios', scenario.id)}/relations`}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!dirty || save.isPending}>
          Save
        </Button>
        <output aria-live="polite" className="text-sm text-muted-foreground">
          {save.isSuccess && !dirty && 'Saved.'}
        </output>
        {save.isError && (
          <p role="alert" className="text-sm text-destructive">
            The threat scenario could not be saved. Please try again.
          </p>
        )}
      </div>
    </form>
  )
}
