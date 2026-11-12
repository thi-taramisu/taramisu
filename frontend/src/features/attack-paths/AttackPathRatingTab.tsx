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
import { FACTORS, summarize, type Factor, type FactorScores } from './attackFeasibility'
import { FeasibilityBadge } from './FeasibilityBadge'

// The backend supports attack potential only; further methods can be added to this list.
const RATING_METHODS = [{ value: 'ATTACK_POTENTIAL', label: 'Attack Potential' }]

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

function points(score: number) {
  return `${score} ${score === 1 ? 'point' : 'points'}`
}

/** Rating tab of an attack path ("AP Definition" wireframe, rating): the attack-potential-based approach of the data model. */
export function AttackPathRatingTab() {
  const { projectId = '', entityId = '' } = useParams()
  const rating = useAttackPathRating(projectId, entityId)

  // Null is a loaded attack path without a rating.
  if (rating.data === undefined) {
    return rating.isError ? (
      <p role="alert" className="text-sm text-destructive">The rating could not be loaded.</p>
    ) : (
      <output className="text-sm text-muted-foreground">Loading rating…</output>
    )
  }
  // Remount on attack path change so the form starts from the saved values.
  return <RatingForm key={entityId} projectId={projectId} attackPathId={entityId} rating={rating.data} />
}

function RatingForm({ projectId, attackPathId, rating }: { projectId: string; attackPathId: string; rating: AttackFeasibilityRating | null }) {
  const id = useId()
  const [values, setValues] = useState(() => toValues(rating))
  // Last saved state; kept here so a failed refetch cannot make the form dirty again.
  const [saved, setSaved] = useState(values)
  const update = useUpdateAttackPathRating(projectId, attackPathId)
  const dirty = JSON.stringify(values) !== JSON.stringify(saved)
  const { open, total, feasibility } = summarize(values.scores)

  function change(next: Partial<FormValues>) {
    setValues((prev) => ({ ...prev, ...next }))
    update.reset()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    update.mutate(
      { ...values.scores, ap_total_score: total, feasibility_rating: feasibility, rationale: values.rationale.trim() || null },
      {
        onSuccess: (updated) => {
          setValues(toValues(updated))
          setSaved(toValues(updated))
        },
      },
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="@container grid max-w-3xl gap-4">
      <div className="overflow-hidden rounded-lg border">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b bg-muted/50 px-4 py-2">
          <Label htmlFor={`${id}-method`}>Rating Method</Label>
          <NativeSelect id={`${id}-method`} size="sm" defaultValue="ATTACK_POTENTIAL" className="w-44">
            {RATING_METHODS.map((method) => (
              <NativeSelectOption key={method.value} value={method.value}>
                {method.label}
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
          <span className="text-sm font-medium">Attack Feasibility</span>
          <output aria-live="polite" className="flex flex-wrap items-center gap-2 text-sm">
            {feasibility && total !== null ? (
              <>
                <span className="text-muted-foreground tabular-nums">{points(total)}</span>
                <FeasibilityBadge value={feasibility} />
              </>
            ) : (
              <span className="text-muted-foreground">
                {open} of {FACTORS.length} factors open
              </span>
            )}
          </output>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-rationale`}>Rationale</Label>
        <Textarea
          id={`${id}-rationale`}
          value={values.rationale}
          onChange={(event) => change({ rationale: event.target.value })}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!dirty || update.isPending}>
          Save
        </Button>
        <output aria-live="polite" className="text-sm text-muted-foreground">
          {update.isSuccess && !dirty && 'Saved.'}
        </output>
        {update.isError && (
          <p role="alert" className="text-sm text-destructive">
            The rating could not be saved. Please try again.
          </p>
        )}
      </div>
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
  const id = useId()

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-2">
        <span id={`${id}-label`} className="flex-1 text-sm font-medium">
          {factor.label}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">{score === null ? 'Not rated' : points(score)}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          disabled={score === null}
          aria-label={`Clear ${factor.label}`}
          title="Clear this factor"
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
        {/* Only a placeholder: once chosen, a value is changed, not emptied again. */}
        {score === null && (
          <NativeSelectOption value="" disabled>
            Select…
          </NativeSelectOption>
        )}
        {factor.options.map((option) => (
          <NativeSelectOption key={option.score} value={option.score}>
            {option.label} · {points(option.score)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <div role="radiogroup" aria-labelledby={`${id}-label`} className="hidden @2xl:flex">
        {factor.options.map((option, index) => {
          const checked = score === option.score
          return (
            <label
              key={option.score}
              title={`${option.label}: ${points(option.score)}`}
              className={cn(
                'relative flex h-8 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 border px-2 text-sm transition-colors',
                'has-[:focus-visible]:z-20 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
                checked ? 'z-10 border-primary bg-primary/10 font-medium text-foreground' : 'border-input bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
                index === 0 ? 'rounded-l-md' : '-ml-px',
                index === factor.options.length - 1 && 'rounded-r-md',
              )}
            >
              <input type="radio" name={id} checked={checked} onChange={() => onChange(option.score)} className="sr-only" />
              <span className="truncate">{option.label}</span>{' '}
              <span className="text-xs font-normal tabular-nums opacity-70">
                {option.score} <span className="sr-only">{option.score === 1 ? 'point' : 'points'}</span>
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
