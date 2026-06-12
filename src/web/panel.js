// POI search panel. Searches Signal K `notes` (points of interest) by
// keyword, category and distance from the vessel, then pushes an include
// filter (resources.setFilter) so the chart displays only the matches.
//
// The search summary is stored in extension-scope state so the companion
// results widget can display it (and so it survives panel close/reopen).

import { connectExtension } from 'signalk-plotterext-bus/extension'

// ActiveCaptain POI types arrive as properties.skIcon (lowercased). 'Any'
// disables the category condition, so non-AC notes providers work too.
const CATEGORIES = [
  ['', 'Any category'],
  ['marina', 'Marina'],
  ['anchorage', 'Anchorage'],
  ['hazard', 'Hazard'],
  ['business', 'Business'],
  ['boatramp', 'Boat ramp'],
  ['bridge', 'Bridge'],
  ['dam', 'Dam'],
  ['ferry', 'Ferry'],
  ['inlet', 'Inlet'],
  ['lock', 'Lock']
]

const M_PER_NM = 1852

let client
let lastResults = []

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  )
}

async function vesselPosition() {
  const res = await fetch('/signalk/v1/api/vessels/self/navigation/position', {
    credentials: 'include'
  })
  if (!res.ok) throw new Error('No vessel position available')
  const data = await res.json()
  const pos = data.value ?? data
  if (typeof pos?.longitude !== 'number' || typeof pos?.latitude !== 'number') {
    throw new Error('No vessel position available')
  }
  return pos
}

function categoryOf(note) {
  return (note.properties?.skIcon ?? note.group ?? '').toLowerCase()
}

function matches(note, keyword, category) {
  if (category && categoryOf(note) !== category) return false
  if (keyword) {
    const hay = `${note.name ?? ''} ${note.description ?? ''}`.toLowerCase()
    if (!hay.includes(keyword)) return false
  }
  return true
}

function boundsOf(notes) {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity
  for (const note of notes) {
    const p = note.position
    if (typeof p?.longitude !== 'number' || typeof p?.latitude !== 'number') continue
    minLon = Math.min(minLon, p.longitude)
    maxLon = Math.max(maxLon, p.longitude)
    minLat = Math.min(minLat, p.latitude)
    maxLat = Math.max(maxLat, p.latitude)
  }
  return minLon <= maxLon ? [minLon, minLat, maxLon, maxLat] : null
}

function setStatus(text) {
  document.getElementById('status').textContent = text
}

function renderResults() {
  const list = document.getElementById('results')
  if (!lastResults.length) {
    list.innerHTML = ''
    return
  }
  list.innerHTML = lastResults
    .slice(0, 50)
    .map(
      ([id, n]) =>
        `<li><span class="poi-name">${esc(n.name ?? id)}</span>
         <span class="poi-cat">${esc(categoryOf(n))}</span></li>`
    )
    .join('')
  if (lastResults.length > 50) {
    list.innerHTML += `<li class="poi-more">… and ${lastResults.length - 50} more</li>`
  }
}

async function runSearch() {
  const keyword = document.getElementById('keyword').value.trim().toLowerCase()
  const category = document.getElementById('category').value
  const distanceNm = Number(document.getElementById('distance').value) || 10
  setStatus('Searching…')
  try {
    const pos = await vesselPosition()
    const collection = await client.call('resources.list', {
      type: 'notes',
      query: {
        position: [pos.longitude, pos.latitude],
        distance: Math.round(distanceNm * M_PER_NM)
      }
    })
    const entries = Object.entries(collection ?? {}).filter(([, n]) =>
      matches(n, keyword, category)
    )
    lastResults = entries
    renderResults()

    const parts = []
    if (category) parts.push(CATEGORIES.find(([k]) => k === category)?.[1] ?? category)
    if (keyword) parts.push(`"${keyword}"`)
    parts.push(`< ${distanceNm} nm`)
    const label = `POI ${parts.join(' ')}: ${entries.length} match${entries.length === 1 ? '' : 'es'}`

    if (entries.length) {
      await client.call('resources.setFilter', {
        type: 'notes',
        filter: { mode: 'include', ids: entries.map(([id]) => id), label }
      })
      if (client.hasCapability('map')) {
        const bounds = boundsOf(entries.map(([, n]) => n))
        if (bounds) await client.call('map.fitBounds', { bounds }).catch(() => {})
      }
      setStatus(`${entries.length} matching POIs shown on chart.`)
    } else {
      await client.call('resources.clearFilter', { type: 'notes' }).catch(() => {})
      setStatus('No matches — filter cleared.')
    }

    await client.state.set(
      {
        label,
        count: entries.length,
        active: entries.length > 0,
        keyword,
        category,
        distanceNm
      },
      'extension'
    )
  } catch (err) {
    setStatus(`Search failed: ${err.message}`)
  }
}

async function clearFilter() {
  try {
    await client.call('resources.clearFilter', { type: 'notes' })
    lastResults = []
    renderResults()
    await client.state.set({ active: false, count: 0, label: '' }, 'extension')
    setStatus('Filter cleared — all POIs visible.')
  } catch (err) {
    setStatus(`Clear failed: ${err.message}`)
  }
}

async function main() {
  const root = document.getElementById('root')
  client = await connectExtension()
  const saved = await client.state.get(undefined, 'extension').catch(() => ({}))

  // No title here: the host chrome (drawer/dialog) shows the panel title.
  root.innerHTML = `
    <label class="row"><span>Keyword</span>
      <input id="keyword" value="${esc(saved.keyword ?? '')}" placeholder="Name contains…"></label>
    <label class="row"><span>Category</span>
      <select id="category">${CATEGORIES.map(
        ([value, title]) =>
          `<option value="${value}" ${saved.category === value ? 'selected' : ''}>${title}</option>`
      ).join('')}</select></label>
    <label class="row"><span>Within (nm)</span>
      <input id="distance" type="number" min="1" max="500" value="${Number(saved.distanceNm) || 10}"></label>
    <div class="actions">
      <button type="button" id="clear">Show all</button>
      <button type="button" id="search" class="primary">Search</button>
    </div>
    <p class="status" id="status"></p>
    <ul id="results" class="poi-results"></ul>`

  document.getElementById('search').addEventListener('click', runSearch)
  document.getElementById('clear').addEventListener('click', clearFilter)
  if (saved.active) {
    setStatus(`Active: ${saved.label}`)
  }

  // Reflect an externally-cleared filter (host filter chip dismissed).
  await client.subscribe(['filters.changed'], (_name, params) => {
    if (params?.type === 'notes' && params?.active === false) {
      lastResults = []
      renderResults()
      setStatus('Filter cleared — all POIs visible.')
      client.state.set({ active: false, count: 0, label: '' }, 'extension').catch(() => {})
    }
  })
}

main().catch((err) => {
  document.getElementById('root').textContent = `Host connection failed: ${err.message}`
  console.error(err)
})
