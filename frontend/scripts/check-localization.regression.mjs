import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

test('reports actionable catalog and source errors and keeps UI warnings advisory', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'localization-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const write = (file, text) => writeFileSync(join(cwd, file), text)
  const run = () => spawnSync(process.execPath, [fileURLToPath(new URL('./check-localization.mjs', import.meta.url))], { cwd, encoding: 'utf8' })
  for (const lang of ['de', 'en']) {
    mkdirSync(join(cwd, 'src/i18n/locales', lang), { recursive: true })
    write('src/i18n/locales/' + lang + '/common.json', '{"hello":"Hi {{name}}"}')
    write('src/i18n/locales/' + lang + '/ui.json', '{}')
  }
  write('src/App.tsx', '<main>\n{/* i18n-allow-next-line: brand */}\n<b>ExampleBrand</b>\n<p title="Visible title">{t("hello")}</p></main>')
  write('src/App.test.tsx', '<p>{t("ignored")}</p>')
  const valid = run()
  assert.equal(valid.status, 0, valid.stderr)
  assert.match(valid.stderr, /App.tsx:4: warning:.*Visible title/)
  assert.doesNotMatch(valid.stderr, /ExampleBrand|ignored/)

  write('src/i18n/locales/en/common.json', '{"hello":"Hi {{first}}","empty":" ","onlyEnglish":"Hello"}')
  write('src/App.tsx', 't(flag ? "hello" : "ui:unknown")')
  const invalid = run()
  assert.equal(invalid.status, 1)
  assert.match(invalid.stderr, /en\/common.json: empty: expected nonempty/)
  assert.match(invalid.stderr, /de\/common.json: onlyEnglish: missing/)
  assert.match(invalid.stderr, /de\/common.json: hello: interpolation differs/)
  assert.match(invalid.stderr, /App.tsx:1: ui:unknown: unknown/)
})
