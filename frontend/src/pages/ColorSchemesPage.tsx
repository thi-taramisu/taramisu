import { Link, NavLink, useParams } from 'react-router-dom'
import { colorSchemes } from '../features/design-system/colorSchemes'
import { PalettePreview } from '../features/design-system/PalettePreview'
import { NotFoundPage } from './NotFoundPage'

export function ColorSchemesPage() {
  const { schemeId } = useParams()
  const schemes = schemeId ? colorSchemes.filter((scheme) => scheme.id === schemeId) : colorSchemes
  if (schemes.length === 0) return <NotFoundPage />

  return (
    <main className="mx-auto max-w-7xl space-y-8 p-6 lg:p-10">
      <header className="max-w-3xl space-y-3">
        <Link to="/projects" className="text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">Back to projects</Link>
        <h1 className="text-3xl font-semibold tracking-tight">{schemeId ? `${schemes[0].name} colour scheme` : 'Colour schemes'}</h1>
        <p className="text-muted-foreground">Three UI palette proposals for team review, with light and dark examples. Risk scores and rating labels keep the same colours in every scheme.</p>
        <p className="text-sm text-muted-foreground">The mappings describe presentation, not risk calculation or acceptance. Entity colours identify types and do not indicate severity.</p>
      </header>
      <nav aria-label="Colour schemes" className="flex flex-wrap gap-2">
        {[{ id: '', name: 'Compare all' }, ...colorSchemes].map((scheme) => (
          <NavLink
            key={scheme.id}
            to={`/design-system/colors${scheme.id ? `/${scheme.id}` : ''}`}
            end
            className={({ isActive }) => `rounded-md px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring ${isActive ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border border-border hover:bg-muted hover:text-foreground'}`}
          >
            {scheme.name}
          </NavLink>
        ))}
      </nav>
      <div className={`grid items-start gap-5 ${schemeId ? 'lg:grid-cols-2' : 'lg:grid-cols-3'}`}>
        {[false, true].flatMap((dark) => schemes.map((scheme) => <PalettePreview key={`${scheme.id}-${dark}`} scheme={scheme} dark={dark} />))}
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">Every rating needs a visible number or label alongside its colour. Colour-blindness and graph use remain part of the accessibility review in issue #88.</p>
    </main>
  )
}
