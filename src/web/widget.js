// POI search results widget (2x1): shows the active search and match count.
// Tapping it opens the search panel.

import { connectExtension } from 'signalk-plotterext-bus/extension'

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  )
}

function render(state) {
  const root = document.getElementById('root')
  if (state?.active) {
    root.innerHTML = `
      <div class="poiw">
        <div class="poiw-count">${Number(state.count) || 0}</div>
        <div class="poiw-text">
          <div class="poiw-label">${esc(state.label ?? 'POI search')}</div>
          <div class="poiw-hint">Tap to refine</div>
        </div>
      </div>`
  } else {
    root.innerHTML = `
      <div class="poiw">
        <div class="poiw-text center">
          <div class="poiw-label">POI Search</div>
          <div class="poiw-hint">No active filter — tap to search</div>
        </div>
      </div>`
  }
}

async function main() {
  const client = await connectExtension()
  const load = async () => {
    const state = await client.state.get(undefined, 'extension').catch(() => ({}))
    render(state)
  }
  await client.subscribe(['state.changed'], load)
  window.addEventListener('pointerup', () => {
    client.call('ui.openPanel', { panel: 'poi-search-panel' }).catch(() => {})
  })
  await load()
}

main().catch((err) => {
  document.getElementById('root').textContent = 'Host connection failed'
  console.error(err)
})
