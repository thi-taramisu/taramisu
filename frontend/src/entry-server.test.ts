// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { render } from './entry-server'

describe('server rendering without browser APIs', () => {
  it('includes the filetree, active entity and graph links in the initial HTML', () => {
    expect(typeof window).toBe('undefined')
    const result = render('/projects/headlamp/assets/a-01/risks?view=graph')
    expect(result.status).toBe(200)
    expect(result.html).toContain('Project elements')
    expect(result.html).toContain('Headlamp on/off command')
    expect(result.html).toContain('aria-current="page"')
    expect(result.html).toContain('/projects/headlamp/attack-paths/ap-02?view=graph')
    expect(result.html).toContain('aria-expanded="true"')
  })

  it('only defers the browser-dependent diagram to the client', () => {
    const { html } = render('/projects/headlamp/items/i-01')
    expect(html).toContain('Loading item diagram…')
    expect(html).toContain('Project elements')
    expect(html).toContain('I-01')
  })

  it.each(['neutral', 'ocean', 'iris'])('renders a shareable %s page in light and dark modes', (scheme) => {
    const result = render(`/design-system/colors/${scheme}`)
    expect(result.status).toBe(200)
    expect(result.html.match(new RegExp(`data-color-scheme="${scheme}"`, 'g'))).toHaveLength(2)
    expect(result.html).toContain('Risk 5')
    expect(result.html).toContain('Omitted')
  })

  it.each(['/not-found', '/projects/unknown', '/design-system/colors/unknown'])(
    'returns a real 404 for %s', (path) => {
      const result = render(path)
      expect(result.status).toBe(404)
      expect(result.html).toContain('Page not found')
    },
  )

  it('redirects entry and legacy palette URLs on the server', () => {
    expect(render('/')).toMatchObject({ status: 302, redirect: '/projects' })
    expect(render('/design-sheet.html')).toMatchObject({ status: 302, redirect: '/design-system/colors' })
  })
})
