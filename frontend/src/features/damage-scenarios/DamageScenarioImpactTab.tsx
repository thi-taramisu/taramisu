import { useState, type FormEvent } from 'react'
import { ChevronRight } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import type { ImpactCategory, ImpactRating, ImpactRatingValue } from '../../api/models/damageScenario'
import { useImpactRatings, useUpdateImpactRatings } from '../../api/queries/items'

const CATEGORIES: { value: ImpactCategory; label: string }[] = [
  { value: 'SAFETY', label: 'Safety' },
  { value: 'FINANCIAL', label: 'Financial' },
  { value: 'OPERATIONAL', label: 'Operational' },
  { value: 'PRIVACY', label: 'Privacy' },
]

const RATINGS: { value: ImpactRatingValue; label: string }[] = [
  { value: 'SEVERE', label: 'Severe' },
  { value: 'MAJOR', label: 'Major' },
  { value: 'MODERATE', label: 'Moderate' },
  { value: 'NEGLIGIBLE', label: 'Negligible' },
  { value: 'OMITTED', label: 'Omitted' },
]

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

/** Rating as a badge with the impact colour tokens; the rating is in the text, not only in the colour. */
function ImpactBadge({ rating }: { rating: ImpactRatingValue | null }) {
  const classes = rating ? RATING_CLASSES[rating] : 'border-rating-unknown-border bg-rating-unknown text-rating-unknown-foreground'
  return (
    <span className={`inline-flex h-5 items-center rounded-full border px-2 text-xs font-medium whitespace-nowrap ${classes}`}>
      {RATINGS.find((r) => r.value === rating)?.label ?? 'Not rated'}
    </span>
  )
}

/** Impact tab of a damage scenario ("DS Impact" wireframe, as a table): one rating per impact category S / F / O / P. */
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
  const update = useUpdateImpactRatings(projectId, damageScenarioId)
  const dirty = CATEGORIES.some(({ value }) =>
    (Object.keys(values[value]) as (keyof CategoryValues)[]).some((key) => values[value][key] !== saved[value][key]),
  )

  function change(category: ImpactCategory, patch: Partial<CategoryValues>) {
    setValues((prev) => ({ ...prev, [category]: { ...prev[category], ...patch } }))
    update.reset()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    update.mutate(
      CATEGORIES.map(({ value }) => ({
        impact_category: value,
        rating_value: values[value].rating,
        is_omitted_by_pm_15_07: values[value].rating === 'OMITTED',
        omission_or_rating_rationale: values[value].rationale || null,
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

  return (
    <form onSubmit={handleSubmit} className="grid max-w-3xl gap-4">
      <p className="text-sm text-muted-foreground">
        Rate the impact of the damage scenario per category. Omit a category only with a rationale, e.g. a higher rating in another
        category.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Category</TableHead>
            {RATINGS.map((option) => (
              <TableHead key={option.value} className="text-center">
                {option.label}
              </TableHead>
            ))}
            <TableHead>Rating</TableHead>
            <TableHead>Rationale</TableHead>
          </TableRow>
        </TableHeader>
        {CATEGORIES.map((category) => (
          <ImpactCategoryRows
            key={category.value}
            category={category}
            values={values[category.value]}
            onChange={(patch) => change(category.value, patch)}
          />
        ))}
      </Table>
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

interface ImpactCategoryRowsProps {
  category: (typeof CATEGORIES)[number]
  values: CategoryValues
  onChange: (patch: Partial<CategoryValues>) => void
}

/** One impact category: a row with the rating options, and a row with the rationale while it is opened. */
function ImpactCategoryRows({ category, values, onChange }: ImpactCategoryRowsProps) {
  const [open, setOpen] = useState(false)
  const { rating, rationale } = values

  function selectRating(value: ImpactRatingValue) {
    onChange({ rating: value })
    // An omission needs a justification, so the rationale opens with it.
    if (value === 'OMITTED') setOpen(true)
  }

  return (
    <Collapsible asChild open={open} onOpenChange={setOpen}>
      <TableBody>
        <TableRow>
          <TableHead scope="row" className="text-foreground">
            {category.label}
          </TableHead>
          {RATINGS.map((option) => (
            <TableCell key={option.value} className="text-center">
              <Label className="justify-center">
                <input
                  type="radio"
                  name={`impact-${category.value}`}
                  value={option.value}
                  checked={rating === option.value}
                  onChange={() => selectRating(option.value)}
                />
                <span className="sr-only">
                  {category.label} {option.label}
                </span>
              </Label>
            </TableCell>
          ))}
          <TableCell>
            <ImpactBadge rating={rating} />
          </TableCell>
          <TableCell>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" size="icon-xs" aria-label={`${open ? 'Collapse' : 'Expand'} ${category.label} rationale`}>
                <ChevronRight aria-hidden="true" className={`transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`} />
              </Button>
            </CollapsibleTrigger>
          </TableCell>
        </TableRow>
        <CollapsibleContent asChild>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={RATINGS.length + 3}>
              <Textarea
                aria-label={`${category.label} rationale`}
                value={rationale}
                placeholder={rating === 'OMITTED' ? 'Why the category is omitted (PM-15-07)' : 'Justification, e.g. ISO 26262-3 or Annex F reference'}
                onChange={(event) => onChange({ rationale: event.target.value })}
              />
            </TableCell>
          </TableRow>
        </CollapsibleContent>
      </TableBody>
    </Collapsible>
  )
}
