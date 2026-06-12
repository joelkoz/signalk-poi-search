// signalk-poi-search
//
// Second reference extension for the plotterExtensions specification: a
// non-AI search panel over Signal K `notes` resources (points of interest),
// pushing an include filter so the chart shows only matching POIs. Pairs
// naturally with signalk-activecaptain-resources (declared via the App
// Store `recommends` mechanism) but works against any notes provider.
//
// The plugin itself only serves the manifest; all behavior lives in the
// panel/widget pages in public/, served at /signalk-poi-search/ through the
// standard signalk-webapp mechanism.

const PLUGIN_ID = 'signalk-poi-search'
const ASSET_BASE = `/${PLUGIN_ID}`

const pkg = require('../package.json')

function buildManifest() {
  return {
    name: 'POI Search',
    description:
      'Search points of interest (notes) by name, category and distance; show only the matches on the chart.',
    version: pkg.version,
    apiVersion: '1',
    requires: ['panels.iframe', 'resources', 'resources.filter'],
    optional: ['buttons', 'widgets', 'map', 'units'],
    buttons: [
      {
        id: 'open-poi-search',
        title: 'POI Search',
        slot: 'mapToolbar',
        icon: 'travel_explore',
        action: { type: 'openPanel', panel: 'poi-search-panel' }
      }
    ],
    panels: [
      {
        id: 'poi-search-panel',
        title: 'POI Search',
        type: 'iframe',
        url: `${ASSET_BASE}/panel.html`,
        lifecycle: 'keepAlive'
      }
    ],
    widgets: [
      {
        id: 'poi-results',
        title: 'POI Search Results',
        type: 'iframe',
        url: `${ASSET_BASE}/widget.html`,
        size: '2x1',
        lifecycle: 'whileEnabled'
      }
    ]
  }
}

module.exports = (app) => {
  let providerRegistered = false
  let running = false

  const registerProvider = () => {
    if (providerRegistered) return
    if (typeof app.registerResourceProvider !== 'function') {
      app.error(`${PLUGIN_ID}: server has no resource provider registry`)
      return
    }
    app.registerResourceProvider({
      type: 'plotterExtensions',
      methods: {
        listResources: async () => (running ? { [PLUGIN_ID]: buildManifest() } : {}),
        getResource: async (id) => {
          if (!running || id !== PLUGIN_ID) {
            throw new Error(`No such plotterExtensions resource: ${id}`)
          }
          return buildManifest()
        },
        setResource: async () => {
          throw new Error(`${PLUGIN_ID} is a read-only provider`)
        },
        deleteResource: async () => {
          throw new Error(`${PLUGIN_ID} is a read-only provider`)
        }
      }
    })
    providerRegistered = true
  }

  return {
    id: PLUGIN_ID,
    name: 'POI Search',
    description:
      'Search panel for points of interest (Signal K notes) on plotterExtensions-capable chartplotters.',
    schema: () => ({ type: 'object', properties: {} }),
    start() {
      running = true
      registerProvider()
      app.debug(`${PLUGIN_ID}: started`)
    },
    stop() {
      running = false
      app.debug(`${PLUGIN_ID}: stopped`)
    }
  }
}
