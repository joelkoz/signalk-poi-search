# Requirements: signalk-poi-search

The authoritative implementation spec for this plugin. It assumes the
Plotter Extensions API (see `plotter-extensions-api.md` in the
`signalk-instrument-widgets` repository) and the `signalk-plotterext-bus`
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

- Form: keyword (free text), category (Any + the ActiveCaptain POI types:
  marina, anchorage, hazard, business, boatramp, bridge, dam, ferry, inlet,
  lock), distance in nautical miles (default 10).
- **Search**:
  1. Reads vessel position via same-origin REST
     (`/signalk/v1/api/vessels/self/navigation/position`); fails with a
     visible message when unavailable.
  2. Calls `resources.list` with
     `{ type: "notes", query: { position: [lon, lat], distance: <m> } }`
     (distance converted from nm; the notes API expects metres).
  3. Matches client-side: category against
     `properties.skIcon`/`group` (case-insensitive; empty category matches
     all) and keyword against name + description (case-insensitive
     substring).
  4. With matches: pushes
     `resources.setFilter { type: "notes", filter: { mode: "include",
     ids, label } }` where `label` summarizes category/keyword/distance and
     the match count, then (capability `map`) `map.fitBounds` over the
     matches' bounding box. With zero matches: clears the filter and says
     so.
  5. Renders the match list in the panel (name + category, capped at 50
     with an overflow row).
- **Show all**: clears the host filter and the active state.
- Search parameters and the result summary are persisted to
  **extension-scope** state: `{ label, count, active, keyword, category,
  distanceNm }`; the panel restores them on reopen.

## 3. Results widget

- 2x1 tile showing the active search: match count (large) + filter label,
  or a "no active filter" prompt.
- Re-renders on `state.changed`; any tap calls
  `ui.openPanel("poi-search-panel")`.

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
chart to matching POIs with a clearable chip and fitted view; Show all
restores; the widget tracks the active search and reopens the panel;
panel state survives close/reopen (keepAlive).
