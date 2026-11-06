import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../../test/renderApp'
import { formatEntityId } from './entities'

const project = '/projects/headlamp'
const header = (name: string) => screen.findByRole('heading', { name }).then((heading) => heading.previousElementSibling!)

describe('formatEntityId', () => {
  it.each([
    ['A-01', '#01'],
    ['DS-12', '#12'],
    ['TS-03', '#03'],
    ['AP-100', '#100'],
  ])('formats %s as %s', (code, id) => {
    expect(formatEntityId(code)).toBe(id)
  })
})

describe('element header', () => {
  it('shows the ID of tree elements in the same place and format, and updates it on switching', async () => {
    const { user } = renderApp(`${project}/assets/a-01`)

    expect(await header('Headlamp on/off command')).toHaveTextContent(/^Asset\s*#01$/)

    const tree = screen.getByRole('navigation', { name: 'Project elements' })
    await user.click(within(tree).getByRole('link', { name: 'Body control ECU firmware' }))
    expect(await header('Body control ECU firmware')).toHaveTextContent(/^Asset\s*#02$/)

    await user.click(within(tree).getByRole('link', { name: 'Spoofed headlamp command on the CAN bus' }))
    expect(await header('Spoofed headlamp command on the CAN bus')).toHaveTextContent(/^Threat scenario\s*#01$/)
  })

  it('shows no ID for items, which have none', async () => {
    renderApp(`${project}/items/i-01`)

    expect(await header('Headlamp system')).toHaveTextContent(/^Item$/)
  })
})
