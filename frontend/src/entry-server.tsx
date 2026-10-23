import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import { matchRoutes, StaticRouter } from 'react-router-dom'
import App from './App'
import { colorSchemes } from './features/design-system/colorSchemes'
import { exampleProject } from './features/workspace/exampleProject'
import { routes } from './routes'
import type { RenderResult } from './rendering'

export function render(url: string): RenderResult {
  const { pathname } = new URL(url, 'http://localhost')
  if (pathname === '/') return { html: '', status: 302, redirect: '/projects' }
  if (pathname === '/design-sheet.html') return { html: '', status: 302, redirect: '/design-system/colors' }

  const matches = matchRoutes(routes, pathname) ?? []
  const params = matches.at(-1)?.params
  const unknownScheme = params?.schemeId && !colorSchemes.some((scheme) => scheme.id === params.schemeId)
  const unknownProject = matches.some((match) => match.route.path === '/projects/:projectId') && params?.projectId !== exampleProject.id
  const status = matches.at(-1)?.route.path === '*' || unknownScheme || unknownProject ? 404 : 200
  // A fresh cache per request prevents data leaking between users when API queries are added.
  const queryClient = new QueryClient()
  try {
    const html = renderToString(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <StaticRouter location={url}><App /></StaticRouter>
        </QueryClientProvider>
      </StrictMode>,
    )
    return { html, status }
  } finally {
    queryClient.clear()
  }
}
