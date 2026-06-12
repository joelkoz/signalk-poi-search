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

// Distinguish a short tap (toggle the search panel) from a long press
// (open the widget's configuration, where it can be removed). Without this
// guard, the pointerup that ends a long press would also fire the tap
// action.
const LONG_PRESS_MS = 1500
const MOVE_SLOP_PX = 8

function installGestures(client) {
  let timer = null
  let fired = false
  let down = null
  const cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  window.addEventListener('pointerdown', (e) => {
    fired = false
    down = { x: e.clientX, y: e.clientY }
    timer = setTimeout(() => {
      timer = null
      fired = true
      client.call('ui.toggleConfigPanel').catch(() => {})
    }, LONG_PRESS_MS)
  })
  window.addEventListener('pointermove', (e) => {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > MOVE_SLOP_PX) {
      cancel()
    }
  })
  window.addEventListener('pointercancel', cancel)
  window.addEventListener('pointerup', () => {
    cancel()
    if (fired) return // long press already opened configuration
    client.call('ui.togglePanel', { panel: 'poi-search-panel' }).catch(() => {})
  })
}

async function main() {
  const client = await connectExtension()
  const load = async () => {
    const state = await client.state.get(undefined, 'extension').catch(() => ({}))
    render(state)
  }
  await client.subscribe(['state.changed'], load)
  // The host clears the notes filter when the user dismisses the filter chip;
  // reflect that here so the widget stops showing a stale active search.
  await client.subscribe(['filters.changed'], (_name, params) => {
    if (params?.type === 'notes' && params?.active === false) {
      client.state
        .set({ active: false, count: 0, label: '' }, 'extension')
        .catch(() => {})
    }
  })
  installGestures(client)
  await load()
}

main().catch((err) => {
  document.getElementById('root').textContent = 'Host connection failed'
  console.error(err)
})
