import { useTranslation } from 'react-i18next'
import { useId, useState, type FormEvent } from 'react'
import { Eraser } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { AttackFeasibilityRating } from '../../api/models/attackPath'
import { useAttackPathRating, useUpdateAttackPathRating } from '../../api/queries/items'
import { useProjectAccess } from '../../api/queries/projects'
import { FACTORS, summarize, type Factor, type FactorScores } from './attackFeasibility'
import { FeasibilityBadge } from './FeasibilityBadge'

// The backend supports attack potential only; further methods can be added to this list.
const RATING_METHODS = [{ value: 'ATTACK_POTENTIAL', label: 'ui:attackPotential' }]

interface FormValues {
  scores: FactorScores
  rationale: string
}

function toValues(rating: AttackFeasibilityRating | null): FormValues {
  return {
    scores: {
      ap_elapsed_time: rating?.ap_elapsed_time ?? null,
      ap_specialist_expertise: rating?.ap_specialist_expertise ?? null,
      ap_knowledge_of_item: rating?.ap_knowledge_of_item ?? null,
      ap_window_of_opportunity: rating?.ap_window_of_opportunity ?? null,
      ap_equipment: rating?.ap_equipment ?? null,
    },
    rationale: rating?.rationale ?? '',
  }
}


/** Rating tab of an attack path ("AP Definition" wireframe, rating): the attack-potential-based approach of the data model. */
export function AttackPathRatingTab() {
  const { t } = useTranslation()
  const { projectId = '', entityId = '' } = useParams()
  const rating = useAttackPathRating(projectId, entityId)

  // Null is a loaded attack path without a rating.
  if (rating.data === undefined) {
    return rating.isError ? (
      <p role="alert" className="text-sm text-destructive">{t('ui:theRatingCouldNotBeLoaded')}</p>
    ) : (
      <output className="text-sm text-muted-foreground">{t('ui:loadingRating')}</output>
    )
  }
  // Remount on attack path change so the form starts from the saved values.
  return <RatingForm key={entityId} projectId={projectId} attackPathId={entityId} rating={rating.data} />
}

function RatingForm({ projectId, attackPathId, rating }: { projectId: string; attackPathId: string; rating: AttackFeasibilityRating | null }) {
  const { t } = useTranslation()
  const id = useId()
  const [values, setValues] = useState(() => toValues(rating))
  // Last saved state; kept here so a failed refetch cannot make the form dirty again.
  const [saved, setSaved] = useState(values)
  const update = useUpdateAttackPathRating(projectId, attackPathId)
  const { canEdit } = useProjectAccess(projectId)
  const dirty = JSON.stringify(values) !== JSON.stringify(saved)
  const { open, total, feasibility } = summarize(values.scores)

  function change(next: Partial<FormValues>) {
    setValues((prev) => ({ ...prev, ...next }))
    // Keeps Save disabled while a request runs; resetting would also drop its success callback.
    if (!update.isPending) update.reset()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    update.mutate(
      { ...values.scores, ap_total_score: total, feasibility_rating: feasibility, rationale: values.rationale.trim() || null },
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
    <form onSubmit={handleSubmit} noValidate className="@container grid max-w-3xl gap-4">
      {/* Read-only projects show the factors and rationale disabled and no Save. */}
      <fieldset disabled={!canEdit} className="contents">
        <div className="overflow-hidden rounded-lg border">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b bg-muted/50 px-4 py-2">
            <Label htmlFor={`${id}-method`}>{t('ui:ratingMethod')}</Label>
            <NativeSelect id={`${id}-method`} size="sm" defaultValue="ATTACK_POTENTIAL" className="w-44">
              {RATING_METHODS.map((method) => (
                <NativeSelectOption key={method.value} value={method.value}>
                  {t(method.label)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-4 p-4">
            {FACTORS.map((factor) => (
              <FactorChoice
                key={factor.key}
                factor={factor}
                score={values.scores[factor.key]}
                onChange={(score) => change({ scores: { ...values.scores, [factor.key]: score } })}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t bg-muted/50 px-4 py-2">
            <span className="text-sm font-medium">{t('ui:attackFeasibility')}</span>
            <output aria-live="polite" className="flex flex-wrap items-center gap-2 text-sm">
              {feasibility && total !== null ? (
                <>
                  <span className="text-muted-foreground tabular-nums">{t('ui:points', { count: total })}</span>
                  <FeasibilityBadge value={feasibility} />
                </>
              ) : (
                <span className="text-muted-foreground">
                  {t('ui:openFactorCount', { open, total: FACTORS.length })}</span>
              )}
            </output>
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-rationale`}>{t('ui:rationale')}</Label>
          <Textarea
            id={`${id}-rationale`}
            value={values.rationale}
            onChange={(event) => change({ rationale: event.target.value })}
          />
        </div>
      </fieldset>
      {canEdit && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!dirty || update.isPending}>{t('ui:save')}</Button>
          <output aria-live="polite" className="text-sm text-muted-foreground">
            {update.isSuccess && !dirty && t('ui:saved')}
          </output>
          {update.isError && (
            <p role="alert" className="text-sm text-destructive">{t('ui:theRatingCouldNotBeSavedPleaseTryAgain')}</p>
          )}
        </div>
      )}
    </form>
  )
}

interface FactorChoiceProps {
  factor: Factor
  score: number | null
  onChange: (score: number | null) => void
}

/** One attack potential factor: its options side by side with their scores, and the chosen score above them. */
function FactorChoice({ factor, score, onChange }: FactorChoiceProps) {
  const { t } = useTranslation()
  const id = useId()

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-2">
        <span id={`${id}-label`} className="flex-1 text-sm font-medium">
          {t(factor.label)}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">{score === null ? t('ui:notRated') : t('ui:points', { count: score })}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          disabled={score === null}
          aria-label={t('ui:clearCategory', { category: t(factor.label) })}
          title={t('ui:clearThisFactor')}
          onClick={() => onChange(null)}
        >
          <Eraser aria-hidden="true" />
        </Button>
      </div>
      {/* Where the options do not fit side by side, a dropdown takes over, so none gets cut off. */}
      <NativeSelect
        aria-labelledby={`${id}-label`}
        value={score ?? ''}
        onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
        className={cn('w-full @2xl:hidden', score === null && 'text-muted-foreground')}
      >
        <NativeSelectOption value="">{t('ui:select')}</NativeSelectOption>
        {factor.options.map((option) => (
          <NativeSelectOption key={option.score} value={option.score}>
            {t(option.label)} · {t('ui:points', { count: option.score })}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <div role="radiogroup" aria-labelledby={`${id}-label`} className="hidden @2xl:flex">
        {factor.options.map((option, index) => {
          const checked = score === option.score
          return (
            <label
              key={option.score}
              title={`${t(option.label)}: ${t('ui:points', { count: option.score })}`}
              className={cn(
                'relative flex h-8 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 border px-2 text-sm transition-colors has-[:disabled]:cursor-default',
                'has-[:focus-visible]:z-20 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
                checked
                  ? 'z-10 border-primary bg-primary/10 font-medium text-foreground'
                  : 'border-input bg-background text-muted-foreground not-has-[:disabled]:hover:bg-muted not-has-[:disabled]:hover:text-foreground',
                index === 0 ? 'rounded-l-md' : '-ml-px',
                index === factor.options.length - 1 && 'rounded-r-md',
              )}
            >
              <input type="radio" name={id} checked={checked} onChange={() => onChange(option.score)} className="sr-only" />
              <span className="truncate">{t(option.label)}</span>{' '}
              <span className="text-xs font-normal tabular-nums opacity-70">
                {option.score} <span className="sr-only">{t('ui:pointUnit', { count: option.score })}</span>
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
