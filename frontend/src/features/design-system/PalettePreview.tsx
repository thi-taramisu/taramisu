import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ratingGroups, type ColorScheme } from './colorSchemes'

export function PalettePreview({ scheme, dark }: { scheme: ColorScheme; dark: boolean }) {
  const headingId = `${scheme.id}-${dark ? 'dark' : 'light'}`

  return (
    <section
      aria-labelledby={headingId}
      data-color-scheme={scheme.id}
      className={`${dark ? 'dark ' : ''}overflow-hidden rounded-xl border border-border bg-background text-foreground`}
    >
      <header className="space-y-1 border-b border-border px-5 py-4">
        <h2 id={headingId} className="text-lg font-semibold">
          {scheme.name} <span className="text-sm font-normal text-muted-foreground">/ {dark ? 'dark' : 'light'}</span>
        </h2>
        <p className="text-sm text-muted-foreground">{scheme.description}</p>
      </header>
      <div className="space-y-5 p-5">
        <div className="space-y-3">
          <div className="rounded-lg border border-sidebar-border bg-sidebar p-3 text-sm text-sidebar-foreground">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Navigation example</p>
            <div className="rounded-md bg-sidebar-accent px-2 py-1.5 font-medium text-sidebar-accent-foreground">I-01 Headlamp system</div>
            <div className="px-2 py-1.5">A-01 Headlamp command</div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Button asChild><Link to="/projects/headlamp">Open workspace</Link></Button>
            <Button variant="secondary" asChild><Link to={`/design-system/colors/${scheme.id}`}>Show {scheme.name}</Link></Button>
            <span className="rounded-md bg-accent px-3 py-1.5 text-accent-foreground">Accent</span>
          </div>
        </div>
        {ratingGroups.map((group) => (
          <div key={group.name} className="space-y-2">
            <h3 className="text-sm font-semibold">{group.name}</h3>
            <div className="flex flex-wrap gap-1.5">
              {group.entries.map((entry) => (
                <span key={entry.label} className={`rounded-md border px-2 py-1 text-xs font-medium ${entry.className}`}>
                  {entry.label}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
