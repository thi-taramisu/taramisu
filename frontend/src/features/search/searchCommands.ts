import type { SearchType } from '../../api/models/search'

const commands = new Map<string, SearchType>([
  ['project', 'projects'], ['projects', 'projects'], ['projekt', 'projects'], ['projekte', 'projects'],
  ['item', 'items'], ['items', 'items'],
  ['asset', 'assets'], ['assets', 'assets'],
  ['damage', 'damage-scenarios'], ['damage scenario', 'damage-scenarios'], ['damage-scenario', 'damage-scenarios'], ['damage-scenarios', 'damage-scenarios'], ['schadensszenario', 'damage-scenarios'],
  ['threat', 'threat-scenarios'], ['threat scenario', 'threat-scenarios'], ['threat-scenario', 'threat-scenarios'], ['threat-scenarios', 'threat-scenarios'], ['bedrohungsszenario', 'threat-scenarios'],
  ['attack', 'attack-paths'], ['attack path', 'attack-paths'], ['attack-path', 'attack-paths'], ['attack-paths', 'attack-paths'], ['angriffspfad', 'attack-paths'],
])

/** Exact commands only, so Tab still moves focus for ordinary search text. */
export function searchTypeCommand(value: string) {
  return commands.get(value.trim().toLowerCase())
}

/** Consume leading type commands; leave names, IDs and unknown prefixes as search text. */
export function parseSearchCommands(value: string) {
  const types: SearchType[] = []
  let query = value
  let match: RegExpExecArray | null
  while ((match = /^\s*([^:]+):\s*/.exec(query))) {
    const type = searchTypeCommand(match[1])
    if (!type) break
    if (!types.includes(type)) types.push(type)
    query = query.slice(match[0].length)
  }
  return { query, types }
}
