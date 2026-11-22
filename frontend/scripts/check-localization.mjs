import { readFileSync } from 'node:fs'

function catalog(file) {
  const keys = new Map()
  function visit(value, key) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [name, child] of Object.entries(value)) {
        visit(child, key ? key + '.' + name : name)
      }
    } else {
      keys.set(key, value)
      if (typeof value !== 'string' || !value.trim()) fail(file, key, 'expected nonempty translation')
    }
  }
  visit(JSON.parse(readFileSync(file, 'utf8')), '')
  return keys
}

function fail(file, key, message) {
  console.error(file + ': ' + key + ': ' + message)
  process.exitCode = 1
}

function variables(value) {
  return [...new Set(String(value).match(/{{[^}]+}}/g) ?? [])].toSorted()
}

for (const namespace of ['common', 'ui']) {
  const file = language => 'src/i18n/locales/' + language + '/' + namespace + '.json'
  const en = catalog(file('en'))
  const de = catalog(file('de'))
  for (const key of new Set([...en.keys(), ...de.keys()])) {
    if (!en.has(key) || !de.has(key)) {
      fail(file(en.has(key) ? 'de' : 'en'), key, 'missing translation')
    } else if (JSON.stringify(variables(en.get(key))) !== JSON.stringify(variables(de.get(key)))) {
      fail(file('de'), key, 'interpolation differs from ' + file('en'))
    }
  }
}
