import { describe, expect, it } from 'vitest'
import { parseSearchCommands, searchTypeCommand } from './searchCommands'

describe('search type commands', () => {
  it.each([
    ['item', 'items'], ['ITEM', 'items'], ['asset', 'assets'], ['project', 'projects'],
    ['damage', 'damage-scenarios'], ['threat', 'threat-scenarios'], ['attack', 'attack-paths'],
    ['damage scenario', 'damage-scenarios'], ['attack-path', 'attack-paths'],
    ['Projekt', 'projects'], ['Schadensszenario', 'damage-scenarios'], ['Bedrohungsszenario', 'threat-scenarios'], ['Angriffspfad', 'attack-paths'],
  ])('completes %s to %s', (command, type) => {
    expect(searchTypeCommand(command)).toBe(type)
    expect(parseSearchCommands(`${command}: headlamp`)).toEqual({ query: 'headlamp', types: [type] })
  })

  it('combines pasted commands without adding a type twice', () => {
    expect(parseSearchCommands(' item: asset: ITEM: firmware')).toEqual({ query: 'firmware', types: ['items', 'assets'] })
  })

  it.each(['Headlamp system', 'item definition', 'TS-1', 'unknown: foo', 'https://example.com', 'toString: value'])('leaves ordinary search text intact: %s', (query) => {
    expect(searchTypeCommand(query)).toBeUndefined()
    expect(parseSearchCommands(query)).toEqual({ query, types: [] })
  })
})
