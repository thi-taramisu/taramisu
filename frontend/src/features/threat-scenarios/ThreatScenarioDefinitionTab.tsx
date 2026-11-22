import { useTranslation } from 'react-i18next'
import { useId, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { ElicitationMethod, ThreatScenario, ThreatScenarioRelations, ThreatTarget } from '../../api/models/threatScenario'
import { useSetThreatTargets, useThreatScenario, useThreatScenarioRelations, useUpdateThreatScenario } from '../../api/queries/items'
import { useProjectAccess } from '../../api/queries/projects'
import { entityPath } from '../workspace/entities'
import { hasSameTargets } from './targetSelection'
import { ThreatTargetsField } from './ThreatTargetsField'

const ELICITATION_METHODS: ElicitationMethod[] = [
  'GROUP_DISCUSSION', 'MALICIOUS_USE_CASE', 'EVITA', 'TVRA', 'PASTA', 'STRIDE', 'OTHER',
]

interface FormValues {
  title: string
  cause_of_compromise: string
  /** Empty while no method is chosen. */
  elicitation_method: ElicitationMethod | ''
  technical_notes: string
}

/** "fields-failed" and "targets-failed" name the request that failed; the fields are saved first. */
type SaveStatus = 'idle' | 'pending' | 'saved' | 'fields-failed' | 'targets-failed'

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
  const { t } = useTranslation()
  const { projectId = '', entityId = '' } = useParams()
  const { data: scenario } = useThreatScenario(projectId, entityId)
  const relations = useThreatScenarioRelations(projectId, entityId)
  if (!scenario) return null
  if (!relations.data) {
    return relations.isError ? (
      <p role="alert" className="text-sm text-destructive">{t('ui:loadTargetsError')}</p>
    ) : (
      <output className="text-sm text-muted-foreground">{t('ui:loadingTargets')}</output>
    )
  }
  // Remount on threat scenario change so the form starts from the saved values.
  return <DefinitionForm key={scenario.id} projectId={projectId} scenario={scenario} relations={relations.data} />
}

function DefinitionForm({ projectId, scenario, relations }: { projectId: string; scenario: ThreatScenario; relations: ThreatScenarioRelations }) {
  const { t } = useTranslation()
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
  const updateScenario = useUpdateThreatScenario(projectId, scenario.id)
  const saveTargets = useSetThreatTargets(projectId, scenario.id)
  const { canEdit } = useProjectAccess(projectId)
  const [status, setStatus] = useState<SaveStatus>('idle')
  // Set once the fields are saved, so a failure of the targets after them does not say nothing was saved.
  const [fieldsSaved, setFieldsSaved] = useState(false)
  const targetsDirty = !hasSameTargets(currentTargets, savedTargets.filter(isCause))
  const fieldsDirty = (Object.keys(values) as (keyof FormValues)[]).some((key) =>
    // The title is saved trimmed, so surrounding spaces alone are no change.
    key === 'title' ? values.title.trim() !== saved.title : values[key] !== saved[key],
  )
  const dirty = fieldsDirty || targetsDirty

  // The form can start from cached targets; the refetch replaces them unless the user has changed the targets.
  const [syncedTargets, setSyncedTargets] = useState(relations.targets)
  if (relations.targets !== syncedTargets) {
    setSyncedTargets(relations.targets)
    setSavedTargets(relations.targets)
    if (!targetsDirty) setTargets(relations.targets)
  }

  // Keeps Save disabled while a request runs.
  function keepPending() {
    setStatus((prev) => (prev === 'pending' ? prev : 'idle'))
  }

  function change(next: Partial<FormValues>) {
    setValues((prev) => ({ ...prev, ...next }))
    keepPending()
    if ('title' in next) setTitleError(undefined)
  }

  // Sends only the changed parts, so an edit of the fields cannot fail on the targets and the other way round.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = values.title.trim()
    if (!title) {
      setTitleError('ui:nameRequired')
      return
    }
    setStatus('pending')
    setFieldsSaved(false)
    if (fieldsDirty) {
      try {
        const result = await updateScenario.mutateAsync({
          title,
          cause_of_compromise: values.cause_of_compromise || null,
          elicitation_method: values.elicitation_method || null,
          technical_notes: values.technical_notes || null,
        })
        // Takes over the saved values only where nothing was edited while saving.
        setValues((current) => (current === values ? toValues(result) : current))
        setSaved(toValues(result))
        setFieldsSaved(true)
      } catch {
        setStatus('fields-failed')
        return
      }
    }
    if (targetsDirty) {
      try {
        const result = await saveTargets.mutateAsync(currentTargets)
        setTargets((current) => (current === targets ? result.targets : current))
        setSavedTargets(result.targets)
      } catch {
        setStatus('targets-failed')
        return
      }
    }
    setStatus('saved')
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid max-w-3xl gap-4">
      {/* Read-only projects show the fields and targets disabled and no Save. */}
      <fieldset disabled={!canEdit} className="contents">
        <p className="text-xs text-muted-foreground">{t('ui:requiredFields')}</p>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-title`}>{t('ui:requiredName')}</Label>
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
              {t(titleError)}
            </p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-cause`}>{t('ui:compromiseCause')}</Label>
          <Input
            id={`${id}-cause`}
            value={values.cause_of_compromise}
            placeholder={t('ui:compromisePlaceholder')}
            onChange={(event) => change({ cause_of_compromise: event.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-elicitation`}>{t('ui:elicitation')}</Label>
          <NativeSelect
            id={`${id}-elicitation`}
            value={values.elicitation_method}
            onChange={(event) => change({ elicitation_method: event.target.value as FormValues['elicitation_method'] })}
            className={cn('w-full', !values.elicitation_method && 'text-muted-foreground')}
          >
            <NativeSelectOption value="">{t('ui:select')}</NativeSelectOption>
            {ELICITATION_METHODS.map((method) => (
              <NativeSelectOption key={method} value={method}>
                {t(`ui:elicitationMethods.${method}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-notes`}>{t('ui:technicalNotes')}</Label>
          <Textarea
            id={`${id}-notes`}
            value={values.technical_notes}
            placeholder={t('ui:technicalNotesPlaceholder')}
            onChange={(event) => change({ technical_notes: event.target.value })}
          />
        </div>
        <ThreatTargetsField
          damageScenarios={relations.damageScenarios}
          value={currentTargets}
          onChange={(next) => {
            setTargets(next)
            keepPending()
          }}
          relationsPath={`${entityPath(projectId, 'threat-scenarios', scenario.id)}/relations`}
        />
      </fieldset>
      {canEdit && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!dirty || status === 'pending'}>{t('ui:save')}</Button>
          <output aria-live="polite" className="text-sm text-muted-foreground">
            {status === 'saved' && !dirty && t('ui:saved')}
          </output>
          {status === 'fields-failed' && (
            <p role="alert" className="text-sm text-destructive">{t('ui:saveThreatError')}</p>
          )}
          {status === 'targets-failed' && (
            <p role="alert" className="text-sm text-destructive">
              {t(fieldsSaved ? 'ui:fieldsSavedTargetsError' : 'ui:saveTargetsError')} </p>
          )}
        </div>
      )}
    </form>
  )
}
