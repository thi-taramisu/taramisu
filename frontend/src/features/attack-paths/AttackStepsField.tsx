import { useId, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

/** A step while it is edited; the key keeps the row when steps move. */
export interface StepDraft {
  key: number
  description: string
}

interface AttackStepsFieldProps {
  steps: StepDraft[]
  onChange: (steps: StepDraft[]) => void
  /** Shown in the header next to "Add Step", e.g. whether the list is complete. */
  actions?: ReactNode
}

/** Part of the Definition form: the ordered attacker actions (AP Definition wireframe). */
export function AttackStepsField({ steps, onChange, actions }: AttackStepsFieldProps) {
  const headingId = useId()

  function move(index: number, by: number) {
    const target = index + by
    if (target < 0 || target >= steps.length) return
    const next = [...steps]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <section aria-labelledby={headingId} className="overflow-hidden rounded-lg border">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-muted/50 px-4 py-2">
        <h2 id={headingId} className="flex-1 text-sm font-medium">
          Steps
        </h2>
        {actions}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...steps, { key: Math.max(0, ...steps.map((step) => step.key)) + 1, description: '' }])}
        >
          <Plus aria-hidden="true" />
          Add Step
        </Button>
      </div>
      {steps.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">No steps yet.</p>
      ) : (
        <ol className="divide-y">
          {steps.map((step, index) => {
            const number = index + 1
            return (
              <li key={step.key} className="flex items-center gap-2 px-4 py-1.5">
                <span aria-hidden="true" className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs tabular-nums">
                  {number}
                </span>
                {/* Reads like the list of the wireframe; an empty step keeps its border, so it is clear where to type. */}
                <Textarea
                  aria-label={`Step ${number}`}
                  value={step.description}
                  className={`min-h-8 resize-none bg-transparent py-1 text-sm hover:border-input md:text-sm dark:bg-transparent ${step.description.trim() ? 'border-transparent' : ''}`}
                  onChange={(event) => onChange(steps.map((s) => (s.key === step.key ? { ...s, description: event.target.value } : s)))}
                />
                <div className="flex shrink-0 items-center text-muted-foreground">
                  {/* aria-disabled instead of disabled keeps the focus on the button when the step reaches the end. */}
                  <Button type="button" variant="ghost" size="icon-xs" aria-label={`Move step ${number} up`} title="Move up" aria-disabled={index === 0} className={index === 0 ? 'opacity-40' : undefined} onClick={() => move(index, -1)}>
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Move step ${number} down`}
                    title="Move down"
                    aria-disabled={index === steps.length - 1}
                    className={index === steps.length - 1 ? 'opacity-40' : undefined}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove step ${number}`} title="Remove step" onClick={() => onChange(steps.filter((s) => s.key !== step.key))}>
                    <X aria-hidden="true" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
