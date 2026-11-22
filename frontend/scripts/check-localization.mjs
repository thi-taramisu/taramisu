import { readFileSync, readdirSync } from 'node:fs'
import ts from 'typescript'

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

const known = new Set()
for (const namespace of ['common', 'ui']) {
  const file = language => 'src/i18n/locales/' + language + '/' + namespace + '.json'
  const en = catalog(file('en'))
  const de = catalog(file('de'))
  for (const key of new Set([...en.keys(), ...de.keys()])) {
    known.add(namespace + ':' + key)
    if (!en.has(key) || !de.has(key)) {
      fail(file(en.has(key) ? 'de' : 'en'), key, 'missing translation')
    } else if (JSON.stringify(variables(en.get(key))) !== JSON.stringify(variables(de.get(key)))) {
      fail(file('de'), key, 'interpolation differs from ' + file('en'))
    }
  }
}

const visibleAttributes = new Set(['alt', 'aria-label', 'aria-description', 'placeholder', 'title', 'label'])
const excluded = /^(?:__)?(?:tests?|mocks?|demos?|fixtures?|stories)(?:__)?$/i

function inspect(file) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const lines = source.text.split(/\r?\n/)
  function visit(node) {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line
    const location = file + ':' + (line + 1)
    if (ts.isCallExpression(node) && ['t', 'i18n.t'].includes(node.expression.getText(source))) {
      const [arg] = node.arguments
      function checkKey(argument) {
        if (ts.isConditionalExpression(argument)) {
          checkKey(argument.whenTrue)
          checkKey(argument.whenFalse)
        } else if (ts.isStringLiteralLike(argument)) {
          const key = argument.text.includes(':') ? argument.text : 'common:' + argument.text
          if (!known.has(key) && !(known.has(key + '_one') && known.has(key + '_other'))) {
            fail(location, argument.text, 'unknown translation key')
          }
        }
      }
      if (arg) checkKey(arg)
    }
    let literal
    if (ts.isJsxText(node)) literal = node.text
    if (ts.isJsxAttribute(node) && visibleAttributes.has(node.name.getText(source))) {
      const value = node.initializer
      if (value && ts.isStringLiteral(value)) literal = value.text
      if (value && ts.isJsxExpression(value) && value.expression && ts.isStringLiteralLike(value.expression)) {
        literal = value.expression.text
      }
    }
    if (ts.isJsxExpression(node) && !ts.isJsxAttribute(node.parent) &&
        node.expression && ts.isStringLiteralLike(node.expression)) literal = node.expression.text
    if (literal && /\p{L}/u.test(literal.replace(/&(?:#\d+|#x[\da-f]+|\w+);/gi, '')) &&
        !/^\s*(?:\/\/|\{?\/\*)\s*i18n-allow-next-line(?:\s*:\s*\w.*)?\s*(?:\*\/\}?)?\s*$/.test(lines[line - 1] ?? '')) {
      console.warn(location + ': warning: hardcoded UI text: ' + literal.trim().replace(/\s+/g, ' '))
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}

function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = directory + '/' + entry.name
    if (path === 'src/features/design-system' || path === 'src/pages/ColorSchemesPage.tsx') continue
    if (entry.isDirectory() && !excluded.test(entry.name)) scan(path)
    if (entry.isFile() && /\.tsx?$/.test(entry.name) &&
        !/\.(?:d|test|spec|mock|demo|stories)\.tsx?$/.test(entry.name)) inspect(path)
  }
}
scan('src')
