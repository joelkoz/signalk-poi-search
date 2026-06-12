// Plugin contract tests.

const { test } = require('node:test')
const assert = require('node:assert')

function fakeApp() {
  const calls = { providers: [] }
  return {
    calls,
    debug: () => {},
    error: () => {},
    registerResourceProvider: (p) => calls.providers.push(p)
  }
}

test('registers a read-only plotterExtensions provider with a valid manifest', async () => {
  const app = fakeApp()
  const plugin = require('../plugin/index.js')(app)
  plugin.start({})

  const provider = app.calls.providers[0]
  assert.strictEqual(provider.type, 'plotterExtensions')

  const list = await provider.methods.listResources({})
  const manifest = list['signalk-poi-search']
  assert.ok(manifest)
  assert.strictEqual(manifest.apiVersion, '1')
  assert.deepStrictEqual(manifest.requires, [
    'panels.iframe',
    'resources',
    'resources.filter'
  ])
  assert.strictEqual(manifest.buttons[0].action.type, 'togglePanel')
  assert.strictEqual(manifest.buttons[0].action.panel, manifest.panels[0].id)
  assert.strictEqual(manifest.panels[0].lifecycle, 'keepAlive')
  assert.strictEqual(manifest.widgets[0].size, '2x1')
  for (const url of [manifest.panels[0].url, manifest.widgets[0].url]) {
    assert.ok(url.startsWith('/plotterext/signalk-poi-search/'))
  }

  await assert.rejects(() => provider.methods.getResource('nope'))
  await assert.rejects(() => provider.methods.setResource('x', {}))
  await assert.rejects(() => provider.methods.deleteResource('x'))
})

test('provider returns empty list when stopped', async () => {
  const app = fakeApp()
  const plugin = require('../plugin/index.js')(app)
  plugin.start({})
  plugin.stop()
  assert.deepStrictEqual(await app.calls.providers[0].methods.listResources({}), {})
})

test('package declares the ActiveCaptain recommendation', () => {
  const pkg = require('../package.json')
  assert.ok(pkg.signalk.recommends.includes('signalk-activecaptain-resources'))
})
