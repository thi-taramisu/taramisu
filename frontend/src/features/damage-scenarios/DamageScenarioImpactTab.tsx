import { useId, useState, type FormEvent } from 'react'
import { ChevronDown, Eraser, MessageSquareText } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { ImpactCategory, ImpactRating, ImpactRatingValue } from '../../api/models/damageScenario'
import { useImpactRatings, useUpdateImpactRatings } from '../../api/queries/items'

const CATEGORIES: { value: ImpactCategory; label: string }[] = [
  { value: 'SAFETY', label: 'Safety' },
  { value: 'FINANCIAL', label: 'Financial' },
  { value: 'OPERATIONAL', label: 'Operational' },
  { value: 'PRIVACY', label: 'Privacy' },
]

interface RatingOption {
  value: ImpactRatingValue
  label: string
}

const SCALE: RatingOption[] = [
  { value: 'SEVERE', label: 'Severe' },
  { value: 'MAJOR', label: 'Major' },
  { value: 'MODERATE', label: 'Moderate' },
  { value: 'NEGLIGIBLE', label: 'Negligible' },
]

// Not a level of the scale, so it is shown apart from it.
const OMITTED: RatingOption = { value: 'OMITTED', label: 'Omitted' }

const RATING_CLASSES: Record<ImpactRatingValue, string> = {
  SEVERE: 'border-impact-severe-border bg-impact-severe text-impact-severe-foreground',
  MAJOR: 'border-impact-major-border bg-impact-major text-impact-major-foreground',
  MODERATE: 'border-impact-moderate-border bg-impact-moderate text-impact-moderate-foreground',
  NEGLIGIBLE: 'border-impact-negligible-border bg-impact-negligible text-impact-negligible-foreground',
  OMITTED: 'border-impact-omitted-border bg-impact-omitted text-impact-omitted-foreground',
}

interface CategoryValues {
  rating: ImpactRatingValue | null
  rationale: string
  /** Not editable for now; kept so saving does not reset the stored flag. */
  reusedFromFunctionalSafety: boolean
}

type FormValues = Record<ImpactCategory, CategoryValues>

function toValues(ratings: ImpactRating[]): FormValues {
  return Object.fromEntries(
    CATEGORIES.map(({ value }) => {
      const rating = ratings.find((r) => r.impact_category === value)
      return [
        value,
        {
          rating: rating?.rating_value ?? null,
          rationale: rating?.omission_or_rating_rationale ?? '',
          reusedFromFunctionalSafety: rating?.reused_from_functional_safety ?? false,
        },
      ]
    }),
  ) as FormValues
}

type FormErrors = Partial<Record<ImpactCategory, string>>

/** A category can only be omitted with a rationale and in favour of a rated category [PM-15-07]. */
function omissionErrors(values: FormValues): FormErrors {
  const rated = CATEGORIES.some(({ value }) => values[value].rating && values[value].rating !== 'OMITTED')
  const errors: FormErrors = {}
  for (const { value, label } of CATEGORIES) {
    if (values[value].rating !== 'OMITTED') continue
    if (!rated) errors[value] = `${label} can only be omitted if another category is rated.`
    else if (!values[value].rationale.trim()) errors[value] = `A rationale is required to omit ${label}.`
  }
  return errors
}

/** Impact tab of a damage scenario: one rating per impact category S / F / O / P. */
export function DamageScenarioImpactTab() {
  const { projectId = '', entityId = '' } = useParams()
  const { data: ratings, isError } = useImpactRatings(projectId, entityId)

  if (!ratings) {
    return isError ? (
      <p role="alert" className="text-sm text-destructive">
        The impact ratings could not be loaded.
      </p>
    ) : (
      <output className="text-sm text-muted-foreground">Loading impact ratings…</output>
    )
  }
  // Remount on damage scenario change so the form starts from the saved values.
  return <ImpactForm key={entityId} projectId={projectId} damageScenarioId={entityId} ratings={ratings} />
}

function ImpactForm({ projectId, damageScenarioId, ratings }: { projectId: string; damageScenarioId: string; ratings: ImpactRating[] }) {
  const [values, setValues] = useState(() => toValues(ratings))
  // Last saved state; kept here so a failed refetch cannot make the form dirty again.
  const [saved, setSaved] = useState(values)
  const [errors, setErrors] = useState<FormErrors>({})
  const update = useUpdateImpactRatings(projectId, damageScenarioId)
  const dirty = CATEGORIES.some(({ value }) =>
    (Object.keys(values[value]) as (keyof CategoryValues)[]).some((key) => values[value][key] !== saved[value][key]),
  )

  function change(category: ImpactCategory, patch: Partial<CategoryValues>) {
    setValues((prev) => ({ ...prev, [category]: { ...prev[category], ...patch } }))
    update.reset()
    // A change in one category can resolve the error of another, e.g. rating it in favour of an omission.
    setErrors({})
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = omissionErrors(values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    update.mutate(
      CATEGORIES.map(({ value }) => ({
        impact_category: value,
        rating_value: values[value].rating,
        is_omitted_by_pm_15_07: values[value].rating === 'OMITTED',
        omission_or_rating_rationale: values[value].rationale.trim() || null,
        reused_from_functional_safety: value === 'SAFETY' && values[value].reusedFromFunctionalSafety,
      })),
      {
        onSuccess: (updated) => {
          setValues(toValues(updated))
          setSaved(toValues(updated))
        },
      },
    )
  }

  // Container, so the rows lay out by the width of the form, not of the window.
  return (
    <form onSubmit={handleSubmit} noValidate className="@container grid max-w-3xl gap-4">
      <div className="divide-y justify-self-start rounded-lg border px-4">
        {CATEGORIES.map((category) => (
          <ImpactCategoryRow
            key={category.value}
            category={category}
            values={values[category.value]}
            error={errors[category.value]}
            onChange={(patch) => change(category.value, patch)}
          />
        ))}
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
            The impact ratings could not be saved. Please try again.
          </p>
        )}
      </div>
    </form>
  )
}

interface RatingSegmentProps {
  name: string
  option: RatingOption
  checked: boolean
  onSelect: () => void
  className?: string
}

/** Radio styled as a segment; its width depends on the space only, so selecting or clearing a rating moves nothing. */
function RatingSegment({ name, option, checked, onSelect, className }: RatingSegmentProps) {
  return (
    <label
      className={cn(
        'relative flex h-8 min-w-0 cursor-pointer items-center justify-center border text-sm transition-colors',
        'has-[:focus-visible]:z-20 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
        checked ? `z-10 font-medium ${RATING_CLASSES[option.value]}` : 'border-input bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
        className,
      )}
    >
      <input type="radio" name={name} value={option.value} checked={checked} onChange={onSelect} className="sr-only" />
      <span className="truncate px-1">{option.label}</span>
    </label>
  )
}

interface ImpactCategoryRowProps {
  category: (typeof CATEGORIES)[number]
  values: CategoryValues
  error?: string
  onChange: (patch: Partial<CategoryValues>) => void
}

/** One impact category: the rating, and below it the rationale, collapsed to a preview until opened. */
function ImpactCategoryRow({ category, values, error, onChange }: ImpactCategoryRowProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const { rating, rationale } = values
  // The rationale stays open while it shows an error.
  const expanded = open || Boolean(error)
  const name = `impact-${category.value}`

  function selectRating(value: ImpactRatingValue) {
    onChange({ rating: value })
    // An omission needs a justification, so the rationale opens with it.
    if (value === 'OMITTED') setOpen(true)
  }

  function clear() {
    onChange({ rating: null, rationale: '' })
    setOpen(false)
  }

  return (
    <div className="grid items-center gap-x-4 gap-y-1 py-3 @xl:grid-cols-[7rem_1fr]">
      <span id={`${id}-label`} className="text-sm font-medium">
        {category.label}
      </span>
      <div className="flex items-center gap-3">
        {/* Five equal tracks of at most 6rem, so the segments only depend on the available space. */}
        <div role="radiogroup" aria-labelledby={`${id}-label`} className="grid min-w-0 flex-1 grid-cols-[repeat(5,minmax(0,6rem))]">
          {SCALE.map((option, index) => (
            <RatingSegment
              key={option.value}
              name={name}
              option={option}
              checked={rating === option.value}
              onSelect={() => selectRating(option.value)}
              className={cn(index === 0 ? 'rounded-l-md' : '-ml-px', index === SCALE.length - 1 && 'rounded-r-md')}
            />
          ))}
          <RatingSegment
            name={name}
            option={OMITTED}
            checked={rating === OMITTED.value}
            onSelect={() => selectRating(OMITTED.value)}
            className="ml-3 rounded-md"
          />
        </div>
        {/* Always shown and only disabled, so it keeps its place in the row. */}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground"
          disabled={!rating && !rationale}
          aria-label={`Clear ${category.label}`}
          title="Clear rating and rationale"
          onClick={clear}
        >
          <Eraser aria-hidden="true" />
        </Button>
      </div>
      {/* Contained, so a long rationale wraps instead of widening the box, which only fits the ratings. */}
      <Collapsible open={expanded} onOpenChange={setOpen} className="grid grid-cols-1 gap-2 contain-inline-size @xl:col-start-2">
        <div className="flex items-center gap-2">
          <CollapsibleTrigger asChild>
            {/* The negative margin lines the icon up with the rating segments above. */}
            <Button type="button" variant="ghost" size="sm" className="relative -ml-1.5">
              <MessageSquareText aria-hidden="true" data-icon="inline-start" />
              <span className="sr-only">{category.label}</span> Rationale
              <ChevronDown aria-hidden="true" data-icon="inline-end" className={cn('transition-transform', expanded && 'rotate-180')} />
            </Button>
          </CollapsibleTrigger>
          {!expanded && rationale && <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{rationale}</p>}
        </div>
        <CollapsibleContent className="grid gap-2">
          <Textarea
            aria-label={`${category.label} rationale`}
            value={rationale}
            onChange={(event) => onChange({ rationale: event.target.value })}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : undefined}
          />
          {error && (
            <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
