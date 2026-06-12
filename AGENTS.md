# Agent Instructions

Before changing or debugging this repository, read:

1. `README.md` — end-user documentation. Keep it user-facing.
2. `REQUIREMENTS.md` — the authoritative implementation spec for this
   plugin: manifest contract, search/filter behavior, state schema, test
   plan.

## What this plugin is

The second reference extension for the Signal K **plotter extension**
mechanism (the `plotterExtensions` resource type — see the specification
document `plotter-extensions-api.md`), destined for `SignalK/signalk-server`
`docs/develop/rest-api/proposed/`).

Where `signalk-instrument-widgets` exercises the widget surface, this
extension exercises the **panel + resource-filter surface**: a toolbar
button opens a keepAlive search panel that queries Signal K `notes`
resources (points of interest) by keyword, category and distance from the
vessel, then pushes an include filter (`resources.setFilter`) so the chart
displays only the matches, fitting the map view to them.

It pairs with `signalk-activecaptain-resources` — declared via the App
Store recommendation mechanism (`signalk.recommends` in `package.json`),
**not** a hard dependency — but works against any `notes` provider.

## Repository layout

```
plugin/     Plugin entry (CommonJS): registers the read-only
            plotterExtensions resource provider serving the manifest.
src/web/    Panel/widget browser source (plain JS + CSS) built on
            signalk-plotterext-bus/extension.
scripts/    build.mjs — esbuild bundles src/web -> public/.
public/     Built web assets, committed. Served by the plugin as a top-level
            static route at /plotterext/signalk-poi-search/ (not a
            signalk-webapp, so absent from the Webapps launcher). Generated —
            do not hand-edit.
test/       node --test plugin contract tests.
```

## Build / test

```sh
npm install
npm run build
npm test
```

End-to-end testing needs a Signal K server with this plugin plus a notes
provider installed, and a chartplotter host implementing the panel/filter
surface (Freeboard-SK is the reference). The notes query requires a vessel
position (`navigation.position`).

## Engineering rules

- **Serve UI assets from a public top-level static route, not from
  `/plugins/*`.** The plugin mounts `public/` itself with
  `app.use('/plotterext/signalk-poi-search', require('express').static(PUBLIC_DIR))`.
  Never use `registerWithRouter()` / `/plugins/*` for UI — admin-gated, breaks
  read-only users. Do **not** re-add the `signalk-webapp` keyword: it would
  list this plugin in the server's Webapps launcher, but these pages only load
  inside a host iframe. (Express is provided by the server, so requiring it
  adds no runtime dependency of our own.)
- **The resource provider stays read-only**; the manifest is code.
- **No server-side runtime dependencies**; the bus client is bundled into
  the browser assets at build time. Until `signalk-plotterext-bus` is on
  npm, `package.json` carries it as a local `file:` devDependency — replace
  with a semver range at publication.
- **Filters are display-only and user-clearable.** This extension never
  modifies notes; it only pushes include filters with a human-readable
  `label` (the host renders it as a clearable chip). Clearing state and the
  host filter must stay in sync (`Show all` clears both).
- **The search summary lives in extension-scope state** so the results
  widget and a reopened panel agree; widgets re-render via `state.changed`.
- Degrade gracefully: `map` and `widgets` are optional capabilities; the
  panel must work without them.
- Category matching keys off `properties.skIcon` (how ActiveCaptain encodes
  POI type) but must not break on notes without it ('Any category' always
  works).
- Rebuild and commit `public/` in the same change as any `src/web` edit.
