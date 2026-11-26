import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createMockItemApi } from '../../api/mocks/mockItemApi'
import { renderApp } from '../../test/renderApp'
import { findSimilarAsset } from './similarAsset'

const project = '/projects/headlamp'
const tree = () => screen.getByRole('navigation', { name: 'Project elements' })

async function openNewAssetDialog(user: ReturnType<typeof renderApp>['user']) {
  await user.click(await within(tree()).findByRole('button', { name: 'New' }))
  await user.click(screen.getByRole('menuitem', { name: 'Asset' }))
  return screen.findByRole('dialog', { name: 'New Asset' })
}

describe('create asset', () => {
  it('creates an asset with only a name and opens its page on the Definition tab', async () => {
    const { user, api } = renderApp(project)
    const dialog = await openNewAssetDialog(user)

    expect(await within(dialog).findByLabelText('Item')).toHaveDisplayValue('Headlamp system')
    await user.type(within(dialog).getByLabelText(/Name/), '  Low beam relay  ')
    await user.click(within(dialog).getByRole('button', { name: 'Create & open' }))

    expect(await screen.findByRole('heading', { name: 'Low beam relay, Asset AS-5' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/projects\/headlamp\/assets\/.+$/)
    expect(within(screen.getByRole('navigation', { name: 'Asset tabs' })).getByRole('link', { name: 'Definition' })).toHaveAttribute('aria-current', 'page')
    expect(within(tree()).getByRole('link', { name: 'AS-5 Low beam relay' })).toBeInTheDocument()
    const created = (await api.content.assets('headlamp', 'i-01')).at(-1)!
    expect(created).toMatchObject({ code: 'AS-5', name: 'Low beam relay', component: '', properties: [] })
    expect(await api.assets.get('headlamp', created.id)).toMatchObject({ description: null, identification_source: null, properties: [] })
  })

  it('creates the declared properties in C / I / A order', async () => {
    const { user, api } = renderApp(project)
    const dialog = await openNewAssetDialog(user)

    await user.type(within(dialog).getByLabelText(/Name/), 'Diagnostic log')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Availability' }))
    await user.click(within(dialog).getByRole('checkbox', { name: 'Confidentiality' }))
    await user.click(within(dialog).getByRole('button', { name: 'Create & open' }))

    await screen.findByRole('heading', { name: 'Diagnostic log, Asset AS-5' })
    expect((await api.content.assets('headlamp', 'i-01')).at(-1)!.properties).toEqual(['C', 'A'])
    const properties = within(screen.getByRole('group', { name: 'Cybersecurity properties' }))
    expect(properties.getByRole('checkbox', { name: /Confidentiality/ })).toBeChecked()
    expect(properties.getByRole('checkbox', { name: /Integrity/ })).not.toBeChecked()
  })

  it('requires a name', async () => {
    const { user, api } = renderApp(project)
    const dialog = await openNewAssetDialog(user)

    await user.type(within(dialog).getByLabelText(/Name/), '   ')
    await user.click(within(dialog).getByRole('button', { name: 'Create & open' }))

    expect(within(dialog).getByLabelText(/Name/)).toHaveAccessibleDescription('Name is required.')
    expect(await api.content.assets('headlamp', 'i-01')).toHaveLength(4)
  })

  it('starts with the item of the current page', async () => {
    const api = createMockItemApi()
    const second = await api.items.create('headlamp', { name: 'Charging unit', scope_type: 'COMPONENT' })
    const { user } = renderApp(`${project}/items/${second.id}`, api)

    const dialog = await openNewAssetDialog(user)

    expect(await within(dialog).findByLabelText('Item')).toHaveDisplayValue('Charging unit')
    expect(within(dialog).getByLabelText('Item')).toBeEnabled()
  })

  it('points out a similar existing asset and opens it instead', async () => {
    const { user } = renderApp(project)
    const dialog = await openNewAssetDialog(user)

    await user.type(within(dialog).getByLabelText(/Name/), 'Camera frames')
    await user.click(await within(dialog).findByRole('link', { name: 'AS-3 Camera image data' }))

    expect(await screen.findByRole('heading', { name: 'Camera image data, Asset AS-3' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('findSimilarAsset', () => {
  const assets = [
    { id: 'a', code: 'AS-1', name: 'Camera image data', component: '', properties: [], damageScenarios: 0, threatScenarios: 0, maxRisk: null },
  ]

  it.each([
    ['camera frames', 'AS-1'],
    ['IMAGE', 'AS-1'],
    ['Firmware', undefined],
    // Words shorter than four letters are ignored.
    ['the cam', undefined],
    ['', undefined],
  ])('finds %j → %s', (name, code) => {
    expect(findSimilarAsset(name, assets)?.code).toBe(code)
  })
})
