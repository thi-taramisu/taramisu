import { act, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it } from 'vitest'
import { ApiError } from '@/api/errors'
import type { EntityType } from '@/api/models/tree'
import { i18n } from '@/i18n'
import { EntityDataPage } from './EntityDataPage'

afterEach(async () => { await i18n.changeLanguage('en') })

function Page({ type, status }: { type: EntityType; status: number }) {
  const entity = useQuery<{ code: string; title: string }>({
    queryKey: ['entity', type],
    queryFn: async () => { throw new ApiError(status, 'Request failed') },
    retry: false,
  })
  return <EntityDataPage type={type} projectId="headlamp" entity={entity} />
}

it.each([
  ['items', 'Das Item', 'The item'],
  ['assets', 'Das Asset', 'The asset'],
  ['damage-scenarios', 'Das Schadensszenario', 'The damage scenario'],
  ['threat-scenarios', 'Das Bedrohungsszenario', 'The threat scenario'],
  ['attack-paths', 'Der Angriffspfad', 'The attack path'],
] as const)('translates the complete %s not-found sentence when switching languages', async (type, de, en) => {
  await i18n.changeLanguage('de')
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><Page type={type} status={404} /></MemoryRouter></QueryClientProvider>)
  expect(await screen.findByText(`${de} existiert nicht oder wurde gelöscht.`)).toBeInTheDocument()
  await act(async () => { await i18n.changeLanguage('en') })
  expect(screen.getByText(`${en} does not exist or was deleted.`)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to project' })).toHaveAttribute('href', '/projects/headlamp')
})

it('uses the masculine article for attack-path loading and failure messages', async () => {
  await i18n.changeLanguage('de')
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><Page type="attack-paths" status={500} /></MemoryRouter></QueryClientProvider>)
  expect(screen.getByRole('status')).toHaveTextContent('Der Angriffspfad wird geladen…')
  expect(await screen.findByRole('alert')).toHaveTextContent('Der Angriffspfad konnte nicht geladen werden.')
})
