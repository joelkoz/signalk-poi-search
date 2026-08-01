# Requirements: signalk-poi-search

The authoritative implementation spec for this plugin. It assumes the
Plotter Extensions API (see `plotter-extensions-api.md`) and the `signalk-plotterext-bus`
wire protocol as context.

## 1. Manifest contract

Read-only `plotterExtensions` resource provider exposing one resource keyed
by the plugin id `signalk-poi-search`:

- `apiVersion: "1"`.
- `requires: ["panels.iframe", "resources", "resources.filter"]`.
- `optional: ["buttons", "widgets", "map", "units"]` — without `buttons`
  the panel is reachable through the host's panel UI; without `map` no
  fit-to-results; without `widgets` no results widget.
- One button: slot `mapToolbar`, icon `travel_explore`, action
  `{ type: "openPanel", panel: "poi-search-panel" }`.
- One panel: `poi-search-panel`, `type: "iframe"`, `lifecycle: "keepAlive"`
  (form and results survive close/reopen).
- One widget: `poi-results`, size `2x1`, `lifecycle: "whileEnabled"`, no
  config panel.
- Asset URLs are server-relative under `/plotterext/signalk-poi-search/`.

`listResources` returns `{}` while stopped; `setResource`/`deleteResource`
always reject.

## 2. Search panel behavior

The panel has two controls over the same resource type, composed into a
single host filter (the host tracks at most one filter per (extension,
resource type), so they cannot be pushed separately).

### 2.1 Categories

- A category is `properties.skIcon`, lowercased — **and nothing else**. A
  single-colon `namespace:id` symbol reference is reduced to its local id;
  anything else (including multi-colon URNs) is kept whole. Notes without
  `skIcon` are uncategorized and always visible.
  - A fallback to `group` is deliberately **not** supported. The filter that
    hides a category matches one field path and `match` conditions are
    AND-combined with no OR, so "skIcon in hidden OR group in hidden" is not
    expressible; a group-derived category would appear in the checkboxes and
    then silently fail to hide anything. One field for discovery, display,
    client-side narrowing and the host filter, or they disagree.
- `knownCategories` seeds with the ActiveCaptain POI types (marina,
  anchorage, hazard, business, boatramp, bridge, dam, ferry, inlet, lock)
  and is unioned with every category observed in a `resources.list` result,
  so other providers' categories appear without being hardcoded. Persisted.
- The **Show on chart** section renders one checkbox per known category,
  sorted by title. Unchecked categories are held in `hidden` (storing what
  is hidden, not what is shown, so a newly discovered category defaults to
  visible). `All` / `None` set the whole set.

### 2.2 Filter composition

One `resources.setFilter` call, chosen in this order:

1. **Search driving the chart** (a search is loaded and at least one match
   is visible): `{ mode: "include", ids, label }` where `label` summarizes
   scope/keyword/distance and the match count.
2. **Otherwise, categories hidden**: `{ mode: "exclude", match: [{ path:
   "properties.skIcon", op: "in", value: <hidden> }], label }`. Exclude
   rather than include is required: a condition on a missing field is false,
   so an include filter would also hide every uncategorized note.
3. **Otherwise**: `resources.clearFilter`.

### 2.3 Search

- Form: keyword (free text), category (`All shown types` + one entry per
  known category), distance in nautical miles (default 10).
- **Search**:
  1. Reads vessel position via same-origin REST
     (`/signalk/v1/api/vessels/self/navigation/position`); fails with a
     visible message when unavailable.
  2. Calls `resources.list` with
     `{ type: "notes", query: { position: [lon, lat], distance: <m> } }`
     (distance converted from nm; the notes API expects metres), and learns
     any new categories from the result.
  3. Matches client-side: category (empty matches all) and keyword against
     name + description (case-insensitive substring). The category selected
     at search time is captured as the search **scope**.
  4. Visible results are the matches, narrowed by `hidden` when the scope is
     empty; a scoped search **bypasses** `hidden` entirely, so a single
     category can be searched for while it is unchecked. The checkboxes are
     greyed out (with an explanatory note) only while a scoped search is on
     screen — never merely because the dropdown has a selection.
  5. Pushes the filter per §2.2, then (capability `map`) frames the visible
     matches using the zoom-aware fit-or-centre behaviour in §2.4 — never a
     bare `map.fitBounds`, which can land below the host's minimum note zoom.
  6. Renders the visible list in the panel (name + category + range, capped
     at 50 with an overflow row). With capability `map`, a row tap calls
     `map.center` on that POI.
  7. Zero matches, or matches that are all hidden, fall back to §2.2 with a
     status distinguishing the two. A loaded search is **not** discarded
     when a checkbox hides all of it — re-checking restores it without a
     new query.
### 2.4 Result ordering and range

- Range to each match is computed once per search, from the position that
  search was run with, and held by resource id — it does not drift as the
  vessel moves under a stale result set. Matches with no position have no
  range.
- The list is sorted by **distance ascending** by default, so the 50-row cap
  means "the nearest 50" rather than an arbitrary 50. The header exposes two
  sortable columns, `Name` and the range column; clicking the active column
  reverses it, clicking the other switches to it ascending. Positionless
  matches sort last in both directions. `sortKey`/`sortDir` are persisted.
- Sorting happens in `visibleEntries()`, not at render time, so the row
  indices used for tap-to-centre address the same order shown on screen.
- The range column follows the host's **unit preference**: `units.get` is
  read once at panel open and `units.distance` selects `nm` or `km` (values
  converted accordingly, column header labelled to match). Falls back to
  nautical miles without the `units` capability or for an unrecognized
  vocabulary value. The `Within (nm)` input is deliberately *not* converted —
  its label names its unit.

- A host constrains note display two ways, neither readable through the API,
  so a match can be listed but not drawn:
  - **Radius** — notes are fetched within a fixed radius of the map centre
    (Freeboard-SK default 20 nm). When results spread further than an assumed
    20 nm from the fitted centre the status says so and points at the
    tap-to-centre remedy.
  - **Minimum zoom** — notes are not drawn below a zoom threshold
    (Freeboard-SK: *Settings → Resources → Notes → Notes Zoom level*, default
    10). **No map movement this extension performs may end below it**, or the
    move produces a chart with none of the POIs it moved to.

Both constants are assumptions about the reference host, named as such in the
source. The two movements handle the zoom floor differently:

- **Tap-to-centre** passes `zoom: max(currentZoom, 10)` to `map.center`,
  reading the current zoom via `map.getView`. It never zooms *out* — a closer
  current zoom wins — and an unreadable view falls back to the threshold.
- **Fit-to-results** cannot use `map.fitBounds` unconditionally: it takes no
  zoom, picks its own, and for a wide result spread picks one below the
  threshold. The chosen zoom also cannot be read back afterwards — the
  reference host queues the move and `map.getView` reports the previous zoom
  until it completes — so the decision is made up front. `map.getView`'s
  `bounds` and `zoom` give the viewport's degree-span at a known zoom; the
  span available at the minimum zoom is that span × `2^(zoom - 10)`, reduced
  by 0.85 to mirror the padding the reference host applies when fitting. If
  the result bounds fit inside it, `map.fitBounds`; otherwise `map.center` on
  the bounds centre at exactly the minimum zoom. Only the choice is
  estimated — the resulting zoom is explicit — and the margin errs toward
  clamping rather than toward an invisible result set.
- **Clear search**: drops the search and its scope (including resetting the
  dropdown, so the checkboxes are never left greyed with no search to
  justify it) and re-applies §2.2.
- `filters.changed` with `active: false` for `notes` — the user dismissed
  the host chip — clears the search **and** `hidden`; re-applying the
  category selection would make the chip impossible to dismiss. The handler
  ignores the echo of the extension's own `clearFilter`.
- Persisted to **extension-scope** state: `{ label, count, active,
  searchActive, keyword, category, distanceNm, hidden, knownCategories,
  sortKey, sortDir }`.
  The category selection is re-applied on panel open (host filters do not
  survive a host reload); a previous search is not restored, since its ids
  describe a query the vessel has since moved away from.

## 3. Results widget

- 2x1 tile showing, in order: the active search (match count + label) when
  `searchActive`; else the category filter (hidden-category count + label)
  when `active`; else a "no active filter" prompt.
- Re-renders on `state.changed`; any tap calls
  `ui.openPanel("poi-search-panel")`.
- On `filters.changed` with `active: false` it clears `hidden` in state as
  well, for the case where the panel has never been opened and the widget is
  the only live context.

## 4. Serving and packaging

- Assets built to `public/`, committed, served by the plugin as a top-level
  Express static route at `/plotterext/signalk-poi-search/`
  (`app.use(ASSET_BASE, require('express').static(PUBLIC_DIR))`). The plugin
  is deliberately **not** a `signalk-webapp` (keyword omitted) so it stays
  out of the server's Webapps launcher; the pages only load inside a host
  iframe. `/plugins/*` is not used — it is admin-gated and breaks read-only
  users.
- Plugin entry is dependency-free CommonJS.
- `package.json` declares
  `"signalk": { "recommends": ["signalk-activecaptain-resources"] }` —
  discoverability without hard coupling; any notes provider works.

## 5. Test plan

`node --test` covers: provider type and manifest shape (required
capabilities, button->panel linkage, keepAlive panel, 2x1 widget, asset URL
prefix), read-only rejections, stopped behavior, and the App Store
recommendation.

End-to-end (manual, against a host + notes provider): search narrows the
chart to matching POIs with a clearable chip and fitted view; Clear search
restores; the widget tracks the active search and reopens the panel;
panel state survives close/reopen (keepAlive). For the category filter:
unchecking hides that category and only that category (uncategorized notes
stay visible); the selection survives panel reopen; a scoped search finds an
unchecked category; toggling a checkbox during a search re-selects without a
new provider query; dismissing the host chip clears both. For the result
list: it opens nearest-first, both column headers sort and reverse, the
choice survives panel reopen, and the range column switches to km when the
server's distance preference is metric.
