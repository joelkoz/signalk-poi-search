// POI search panel. Two cooperating controls over Signal K `notes` (points
// of interest):
//
//   * "Show on chart" — a persistent per-category filter. Categories the
//     user unchecks are hidden from the chart until re-checked.
//   * "Search" — a transient keyword/category/distance query around the
//     vessel that narrows the chart to the matches.
//
// The host tracks at most one filter per (extension, resource type), so the
// two are composed here into a single `resources.setFilter` call rather than
// pushed separately: a search emits an include-by-id filter (already reduced
// to the visible categories), and with no search running the category
// selection emits an exclude-by-category filter.
//
// The summary is stored in extension-scope state so the companion results
// widget can display it (and so it survives panel close/reopen).

import { connectExtension } from 'signalk-plotterext-bus/extension'

// Seed categories: the ActiveCaptain POI types, which arrive as
// properties.skIcon (lowercased). This is only a seed — any other category
// seen in a query result is added to the list and remembered, so other notes
// providers get their own categories without this file knowing about them.
const SEED_CATEGORIES = {
  marina: 'Marina',
  anchorage: 'Anchorage',
  hazard: 'Hazard',
  business: 'Business',
  boatramp: 'Boat ramp',
  bridge: 'Bridge',
  dam: 'Dam',
  ferry: 'Ferry',
  inlet: 'Inlet',
  lock: 'Lock'
}

const M_PER_NM = 1852
const KM_PER_NM = 1.852
const MAX_ROWS = 50

// A host fetches notes within its own radius of the map centre, and the API
// gives no way to read or widen it — so a match further out than that may be
// listed here yet never drawn. 20 nm is the reference host's default; the
// warning below is therefore worded as a possibility, not a fact, and the
// remedy offered is to tap the result (which recentres the map on it).
const ASSUMED_HOST_NOTE_RADIUS_NM = 20

// A host also stops drawing notes below a minimum zoom (Freeboard-SK:
// Settings -> Resources -> Notes -> "Notes Zoom level", default 10). Like the
// radius above it is not exposed through the API, so centring on a result has
// to guarantee a zoom at least this close or the POI the user just tapped
// would not appear. Never zooms *out*: the current zoom wins when it is
// already closer in.
const ASSUMED_HOST_NOTE_MIN_ZOOM = 10

let client
let hasMap = false

// Entries ([id, note]) matched by the last search, before the category
// checkboxes are applied. `searchScope` is the category the search was run
// with ('' = all shown types) — captured at search time so later edits to the
// form do not retroactively reinterpret the results on screen.
let searchMatches = []
let searchActive = false
let searchScope = ''

// Range from the vessel to each match, in nautical miles, keyed by resource
// id. Computed once per search from the position that search was run with, so
// the column cannot drift as the vessel moves under a stale result set.
const distanceNmById = new Map()

// Result ordering. Nearest-first by default: the panel exists to answer
// "what is the closest X", and it also makes the MAX_ROWS cap mean "the
// nearest 50" rather than "whichever 50 the provider happened to return".
let sortKey = 'distance'
let sortDir = 1

// The host's preferred distance unit ('naut-mile' | 'kilometer'). Read once
// from units.get; nautical miles when the host has no units capability.
let unitPref = 'naut-mile'

let knownCategories = []
const hidden = new Set()

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  )
}

// One definition of "this note can be placed on a chart", so bounds, range,
// the range warning and tap-to-centre all agree on which notes count. Half a
// position is no position: a note with a longitude but no latitude would
// otherwise reach nmBetween and poison a Math.max with NaN.
function hasPosition(note) {
  const p = note?.position
  return typeof p?.longitude === 'number' && typeof p?.latitude === 'number'
}

// Category values may be symbol references. A single-colon `namespace:id` is
// reduced to its local id (the host compares those namespace-tolerantly, so a
// bare id in a filter still matches a qualified stored value); anything else,
// including multi-colon URNs, is kept whole.
function localId(ref) {
  const s = String(ref ?? '').toLowerCase()
  const parts = s.split(':')
  return parts.length === 2 ? parts[1] : s
}

// A note's category is `properties.skIcon` and nothing else. The obvious
// fallback to `group` cannot be supported: the host filter that hides a
// category matches a single field path, and `match` conditions are
// AND-combined with no OR, so "skIcon in hidden OR group in hidden" is not
// expressible. Offering group-derived categories in the checkboxes would
// therefore list categories that silently fail to hide. A provider that wants
// its categories filterable must set `properties.skIcon`; notes without it are
// uncategorized and always visible.
function categoryOf(note) {
  return localId(note.properties?.skIcon ?? '')
}

function titleOf(category) {
  return (
    SEED_CATEGORIES[category] ??
    category.charAt(0).toUpperCase() + category.slice(1)
  )
}

function sortedCategories() {
  return [...knownCategories].sort((a, b) => titleOf(a).localeCompare(titleOf(b)))
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
    if (!hasPosition(note)) continue
    const p = note.position
    minLon = Math.min(minLon, p.longitude)
    maxLon = Math.max(maxLon, p.longitude)
    minLat = Math.min(minLat, p.latitude)
    maxLat = Math.max(maxLat, p.latitude)
  }
  return minLon <= maxLon ? [minLon, minLat, maxLon, maxLat] : null
}

function nmBetween(lon1, lat1, lon2, lat2) {
  const R_NM = 6371000 / M_PER_NM
  const toRad = Math.PI / 180
  const dLat = (lat2 - lat1) * toRad
  const dLon = (lon2 - lon1) * toRad
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(a)))
}

function setStatus(text) {
  document.getElementById('status').textContent = text
}

function formValues() {
  return {
    keyword: document.getElementById('keyword').value.trim().toLowerCase(),
    category: document.getElementById('category').value,
    distanceNm: Number(document.getElementById('distance').value) || 10
  }
}

function distanceUnitLabel() {
  return unitPref === 'kilometer' ? 'km' : 'nm'
}

function formatDistance(nm) {
  if (typeof nm !== 'number' || !Number.isFinite(nm)) return '—'
  const value = unitPref === 'kilometer' ? nm * KM_PER_NM : nm
  return value < 100 ? value.toFixed(1) : String(Math.round(value))
}

// Positionless notes sort last whichever way the column is pointing — they
// have no place on a distance axis, and burying them is more useful than
// letting them head the list on a descending sort.
function compareEntries(a, b) {
  if (sortKey === 'name') {
    const an = String(a[1].name ?? a[0])
    const bn = String(b[1].name ?? b[0])
    return sortDir * an.localeCompare(bn)
  }
  const ad = distanceNmById.get(a[0])
  const bd = distanceNmById.get(b[0])
  if (ad === undefined && bd === undefined) return 0
  if (ad === undefined) return 1
  if (bd === undefined) return -1
  return sortDir * (ad - bd)
}

// Results the chart should show: a search scoped to one category bypasses the
// checkboxes (that is what selecting a category in the search means), an
// unscoped search is narrowed by them. Sorted here rather than at render time
// so the row indices used for tap-to-centre address the same order on screen.
function visibleEntries() {
  if (!searchActive) return []
  const entries = searchScope
    ? [...searchMatches]
    : searchMatches.filter(([, n]) => !hidden.has(categoryOf(n)))
  return entries.sort(compareEntries)
}

/* ---------- category discovery ---------- */

// Union any category seen in a result set into the remembered list, so the
// checkboxes grow to cover whatever this server's notes provider actually
// serves. Returns true when the list changed.
function learnCategories(notes) {
  let grew = false
  for (const note of notes) {
    const cat = categoryOf(note)
    if (cat && !knownCategories.includes(cat)) {
      knownCategories.push(cat)
      grew = true
    }
  }
  return grew
}

/* ---------- rendering ---------- */

function renderCategories() {
  const box = document.getElementById('categories')
  // Greyed only while a scoped search is actually driving the chart — not
  // merely because a category is picked in the dropdown. Until Search is
  // pressed the checkboxes are still what the chart is obeying, and showing
  // them as inert would be a lie.
  const scoped = searchActive && searchScope !== ''
  box.innerHTML = sortedCategories()
    .map(
      (cat) =>
        `<label class="cat"><input type="checkbox" data-cat="${esc(cat)}"
           ${hidden.has(cat) ? '' : 'checked'} ${scoped ? 'disabled' : ''}>
         <span>${esc(titleOf(cat))}</span></label>`
    )
    .join('')
  document.getElementById('cat-note').textContent = scoped
    ? 'Bypassed while the search is scoped to a single category.'
    : ''
  box.classList.toggle('disabled', scoped)
}

function renderCategoryOptions() {
  const select = document.getElementById('category')
  const current = select.value
  select.innerHTML =
    `<option value="">All shown types</option>` +
    sortedCategories()
      .map((cat) => `<option value="${esc(cat)}">${esc(titleOf(cat))}</option>`)
      .join('')
  select.value = current
  if (select.value !== current) select.value = ''
}

function sortArrow(key) {
  if (sortKey !== key) return ''
  return sortDir === 1 ? ' ▲' : ' ▼'
}

function renderResults() {
  const head = document.getElementById('results-head')
  const list = document.getElementById('results')
  const entries = visibleEntries()
  if (!entries.length) {
    head.innerHTML = ''
    list.innerHTML = ''
    return
  }
  head.innerHTML = `
    <button type="button" class="sortcol" data-sort="name">Name${sortArrow('name')}</button>
    <button type="button" class="sortcol num" data-sort="distance">${distanceUnitLabel()}${sortArrow('distance')}</button>`
  list.innerHTML = entries
    .slice(0, MAX_ROWS)
    .map(([id, n], i) => {
      const tappable = hasMap && hasPosition(n)
      return `<li data-idx="${i}" class="${tappable ? 'tappable' : ''}">
        <span class="poi-name">${esc(n.name ?? id)}</span>
        <span class="poi-cat">${esc(categoryOf(n))}</span>
        <span class="poi-dist">${esc(formatDistance(distanceNmById.get(id)))}</span></li>`
    })
    .join('')
  if (entries.length > MAX_ROWS) {
    list.innerHTML += `<li class="poi-more">… and ${entries.length - MAX_ROWS} more</li>`
  }
}

// Clicking the active column reverses it; clicking the other switches to it,
// starting nearest-first / A-Z rather than inheriting the previous direction.
function onSortClick(event) {
  const key = event.target?.closest('button[data-sort]')?.dataset?.sort
  if (!key) return
  if (key === sortKey) sortDir = -sortDir
  else {
    sortKey = key
    sortDir = 1
  }
  renderResults()
  persist(lastSummary).catch(() => {})
}

/* ---------- filter composition ---------- */

function searchLabel(count, scope, keyword, distanceNm) {
  const parts = []
  if (scope) parts.push(titleOf(scope))
  if (keyword) parts.push(`"${keyword}"`)
  parts.push(`< ${distanceNm} nm`)
  return `POI ${parts.join(' ')}: ${count} match${count === 1 ? '' : 'es'}`
}

// "Marina, Dam", or a count once the list would be too long for a chip.
function hidingNames() {
  const list = [...hidden]
  return list.length > 3 ? `${list.length} types` : list.map(titleOf).join(', ')
}

// The single place that talks to resources.setFilter. Returns the summary to
// persist so the widget and a reopened panel agree with the chart.
async function pushFilter(searchInfo) {
  const entries = visibleEntries()
  if (searchActive && entries.length) {
    const label = searchLabel(
      entries.length,
      searchScope,
      searchInfo.keyword,
      searchInfo.distanceNm
    )
    await client.call('resources.setFilter', {
      type: 'notes',
      filter: { mode: 'include', ids: entries.map(([id]) => id), label }
    })
    return { label, count: entries.length, active: true, searchActive: true }
  }

  // No search driving the chart: fall back to the persistent category
  // selection. Exclude-by-category rather than include-by-category on
  // purpose — a condition on a missing field is false, so include would also
  // hide every note that carries no category at all.
  const hiddenList = [...hidden]
  if (hiddenList.length) {
    const label = `POI: hiding ${hidingNames()}`
    await client.call('resources.setFilter', {
      type: 'notes',
      filter: {
        mode: 'exclude',
        match: [{ path: 'properties.skIcon', op: 'in', value: hiddenList }],
        label
      }
    })
    // searchActive is false here even if a search is loaded: it is the
    // category selection, not the search, that is driving the chart.
    return { label, count: 0, active: true, searchActive: false }
  }

  await client.call('resources.clearFilter', { type: 'notes' }).catch(() => {})
  return { label: '', count: 0, active: false, searchActive: false }
}

// Remembered so a sort change can re-persist without recomputing the filter.
let lastSummary = { label: '', count: 0, active: false, searchActive: false }

async function persist(summary) {
  lastSummary = summary
  const { keyword, category, distanceNm } = formValues()
  await client.state.set(
    {
      ...summary,
      keyword,
      category,
      distanceNm,
      hidden: [...hidden],
      knownCategories,
      sortKey,
      sortDir
    },
    'extension'
  )
}

/* ---------- actions ---------- */

// Warn when results are spread wider than a host is likely to have loaded.
function rangeWarning(entries) {
  const bounds = boundsOf(entries.map(([, n]) => n))
  if (!bounds) return ''
  const [minLon, minLat, maxLon, maxLat] = bounds
  const cLon = (minLon + maxLon) / 2
  const cLat = (minLat + maxLat) / 2
  let furthest = 0
  for (const [, n] of entries) {
    if (!hasPosition(n)) continue
    furthest = Math.max(furthest, nmBetween(cLon, cLat, n.position.longitude, n.position.latitude))
  }
  if (furthest <= ASSUMED_HOST_NOTE_RADIUS_NM) return ''
  return hasMap
    ? ' Some may lie outside your chartplotter’s note display radius — tap one to centre on it.'
    : ' Some may lie outside your chartplotter’s note display radius.'
}

async function runSearch() {
  const { keyword, category, distanceNm } = formValues()
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
    const all = Object.entries(collection ?? {})
    if (learnCategories(all.map(([, n]) => n))) {
      renderCategoryOptions()
      renderCategories()
    }

    searchScope = category
    searchMatches = all.filter(([, n]) => matches(n, keyword, category))

    // Range from the position this search was run with, not from wherever the
    // vessel is by the time the user reads the list.
    distanceNmById.clear()
    for (const [id, n] of searchMatches) {
      if (hasPosition(n)) {
        distanceNmById.set(
          id,
          nmBetween(pos.longitude, pos.latitude, n.position.longitude, n.position.latitude)
        )
      }
    }

    searchActive = searchMatches.length > 0
    renderCategories() // a scoped search greys the checkboxes it bypasses

    const entries = visibleEntries()
    if (!entries.length) {
      // Nothing to put on the chart: fall back to the category selection
      // rather than leaving an empty chart the user cannot explain. The two
      // ways to get here need different explanations.
      renderResults()
      const summary = await pushFilter({ keyword, distanceNm })
      await persist(summary)
      setStatus(
        searchActive
          ? `${searchMatches.length} found, all in hidden categories — check them under “Show on chart”.`
          : 'No matches — showing all visible categories.'
      )
      return
    }

    renderResults()
    const summary = await pushFilter({ keyword, distanceNm })
    await persist(summary)

    if (hasMap) {
      const bounds = boundsOf(entries.map(([, n]) => n))
      if (bounds) await fitToResults(bounds)
    }
    setStatus(
      `${entries.length} matching POIs shown on chart.${rangeWarning(entries)}`
    )
  } catch (err) {
    setStatus(`Search failed: ${err.message}`)
  }
}

// Drop the search and return to category-filter-only mode. The scope goes
// with it — including the dropdown, since leaving a category selected there
// would keep the checkboxes greyed out with no search to justify it.
function resetSearch() {
  searchActive = false
  searchMatches = []
  searchScope = ''
  document.getElementById('category').value = ''
  renderCategories()
  renderResults()
}

async function clearSearch() {
  try {
    resetSearch()
    const summary = await pushFilter(formValues())
    await persist(summary)
    setStatus(
      hidden.size
        ? `Search cleared — hiding ${hidingNames()}.`
        : 'Search cleared — all POIs visible.'
    )
  } catch (err) {
    setStatus(`Clear failed: ${err.message}`)
  }
}

// Report what the chart is showing after a category change. A loaded search
// whose matches are all currently hidden is kept, not discarded — re-checking
// the category brings it straight back with no new query.
function statusAfterCategoryChange() {
  const visible = visibleEntries().length
  if (visible) return `${visible} matching POIs shown on chart.`
  if (searchActive) return `Search matches are all hidden — hiding ${hidingNames()}.`
  return hidden.size ? `Hiding ${hidingNames()}.` : 'All POIs visible.'
}

// A checkbox changed. When a search is on screen this only re-selects from
// the results already in hand — no new provider query.
async function applyCategoryChange() {
  try {
    renderResults()
    const summary = await pushFilter(formValues())
    await persist(summary)
    setStatus(statusAfterCategoryChange())
  } catch (err) {
    setStatus(`Filter failed: ${err.message}`)
  }
}

function onCategoryToggle(cat, show) {
  if (show) hidden.delete(cat)
  else hidden.add(cat)
  return applyCategoryChange()
}

function setAllCategories(show) {
  if (show) hidden.clear()
  else for (const cat of knownCategories) hidden.add(cat)
  renderCategories()
  return applyCategoryChange()
}

// Frame the results without ever landing below the zoom at which the host
// stops drawing notes.
//
// `map.fitBounds` takes no zoom and picks its own, which for a wide result
// spread is well below the threshold — the fitted chart then shows none of
// the POIs it just fitted to. The host's chosen zoom also cannot be read back
// afterwards (the reference host queues the move and reports the *old* zoom
// until it completes), so this decides up front instead: derive the viewport
// span the minimum zoom can cover from the current view, and fall back to a
// plain centre-at-minimum when the results do not fit inside it.
async function fitToResults(bounds) {
  const [minLon, minLat, maxLon, maxLat] = bounds
  const centre = [(minLon + maxLon) / 2, (minLat + maxLat) / 2]

  const view = await client.call('map.getView').catch(() => null)
  const zoom = typeof view?.zoom === 'number' ? view.zoom : null
  const vb = Array.isArray(view?.bounds) && view.bounds.length === 4 ? view.bounds : null

  if (zoom !== null && vb) {
    // Each zoom level out doubles the visible span. The 0.85 mirrors the
    // padding the reference host applies when fitting, so the estimate errs
    // toward clamping rather than toward an invisible result set.
    const factor = 2 ** (zoom - ASSUMED_HOST_NOTE_MIN_ZOOM) * 0.85
    const lonRoom = Math.abs(vb[2] - vb[0]) * factor
    const latRoom = Math.abs(vb[3] - vb[1]) * factor
    if (maxLon - minLon <= lonRoom && maxLat - minLat <= latRoom) {
      await client.call('map.fitBounds', { bounds }).catch(() => {})
      return
    }
  }

  await client
    .call('map.center', { position: centre, zoom: ASSUMED_HOST_NOTE_MIN_ZOOM })
    .catch(() => {})
}

async function onResultTap(event) {
  const li = event.target.closest('li[data-idx]')
  if (!li || !hasMap) return
  const entry = visibleEntries()[Number(li.dataset.idx)]
  if (!entry || !hasPosition(entry[1])) return
  const p = entry[1].position

  // Clamp to the minimum zoom that still draws notes. An unreadable view
  // falls back to that minimum rather than leaving the zoom alone — the whole
  // point of the tap is that the POI becomes visible.
  const view = await client.call('map.getView').catch(() => null)
  const current = typeof view?.zoom === 'number' ? view.zoom : ASSUMED_HOST_NOTE_MIN_ZOOM
  await client
    .call('map.center', {
      position: [p.longitude, p.latitude],
      zoom: Math.max(current, ASSUMED_HOST_NOTE_MIN_ZOOM)
    })
    .catch(() => {})
}

/* ---------- startup ---------- */

async function main() {
  const root = document.getElementById('root')
  client = await connectExtension()
  hasMap = client.hasCapability('map')

  // Distances are shown in the unit the user configured on the host, not a
  // unit this panel picked. Falls back to nautical miles when the host has no
  // units capability or reports a vocabulary value we do not handle.
  if (client.hasCapability('units')) {
    const prefs = await client.call('units.get').catch(() => null)
    const distance = prefs?.units?.distance
    if (distance === 'kilometer' || distance === 'naut-mile') unitPref = distance
  }

  // `?? {}` as well as the catch: a host may legitimately *resolve* with
  // undefined when nothing has been stored yet, which the catch would not
  // cover and every field read below would then throw on.
  const saved = (await client.state.get(undefined, 'extension').catch(() => null)) ?? {}
  if (saved.sortKey === 'name' || saved.sortKey === 'distance') sortKey = saved.sortKey
  if (saved.sortDir === 1 || saved.sortDir === -1) sortDir = saved.sortDir

  knownCategories = Array.isArray(saved.knownCategories) && saved.knownCategories.length
    ? [...saved.knownCategories]
    : Object.keys(SEED_CATEGORIES)
  for (const cat of Array.isArray(saved.hidden) ? saved.hidden : []) hidden.add(cat)

  // No title here: the host chrome (drawer/dialog) shows the panel title.
  root.innerHTML = `
    <section class="sect">
      <h3>Search</h3>
      <label class="row"><span>Keyword</span>
        <input id="keyword" value="${esc(saved.keyword ?? '')}" placeholder="Name contains…"></label>
      <label class="row"><span>Category</span>
        <select id="category"></select></label>
      <label class="row"><span>Within (nm)</span>
        <input id="distance" type="number" min="1" max="500" value="${Number(saved.distanceNm) || 10}"></label>
      <div class="actions">
        <button type="button" id="clear">Clear search</button>
        <button type="button" id="search" class="primary">Search</button>
      </div>
    </section>
    <section class="sect">
      <h3>Show on chart
        <span class="sect-actions">
          <button type="button" class="linkish" id="cat-all">All</button>
          <button type="button" class="linkish" id="cat-none">None</button>
        </span>
      </h3>
      <div id="categories" class="cats"></div>
      <p class="cat-note" id="cat-note"></p>
    </section>
    <p class="status" id="status"></p>
    <div id="results-head" class="poi-head"></div>
    <ul id="results" class="poi-results"></ul>`

  renderCategoryOptions()
  document.getElementById('category').value = saved.category ?? ''
  renderCategories()

  document.getElementById('search').addEventListener('click', runSearch)
  document.getElementById('clear').addEventListener('click', clearSearch)
  document.getElementById('cat-all').addEventListener('click', () => setAllCategories(true))
  document.getElementById('cat-none').addEventListener('click', () => setAllCategories(false))
  document.getElementById('categories').addEventListener('change', (e) => {
    const cat = e.target?.dataset?.cat
    if (cat) onCategoryToggle(cat, e.target.checked)
  })
  document.getElementById('results').addEventListener('click', onResultTap)
  document.getElementById('results-head').addEventListener('click', onSortClick)

  // Filters do not survive a host reload, so re-apply the remembered category
  // selection on open. A previous search is not restored — its ids describe a
  // query the vessel has since moved away from.
  const summary = await pushFilter(formValues()).catch(() => null)
  if (summary) {
    await persist(summary).catch(() => {})
    if (summary.active) setStatus(`Hiding ${hidingNames()}.`)
  }

  // Reflect an externally-cleared filter (host filter chip dismissed). The
  // user dismissed *all* of this extension's filtering, so the category
  // selection is cleared too — otherwise re-applying it would make the chip
  // impossible to dismiss.
  //
  // pushFilter's own clearFilter call echoes back as this same event, so act
  // only when something was actually being filtered; if not, the clear was
  // ours and there is nothing to undo.
  await client.subscribe(['filters.changed'], (_name, params) => {
    if (
      params?.type === 'notes' &&
      params?.active === false &&
      (searchActive || hidden.size)
    ) {
      hidden.clear()
      resetSearch()
      setStatus('Filter cleared — all POIs visible.')
      persist({ label: '', count: 0, active: false, searchActive: false }).catch(() => {})
    }
  })
}

main().catch((err) => {
  document.getElementById('root').textContent = `Host connection failed: ${err.message}`
  console.error(err)
})
