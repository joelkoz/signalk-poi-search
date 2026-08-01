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
public/     Built web assets. Gitignored and never committed — regenerated
            by the `prepare` script, so it is rebuilt on `npm install` and
            again when npm packs the tarball. Whitelisted in package.json
            `files`, which is how it reaches the published package. Served by
            the plugin as a top-level static route at
            /plotterext/signalk-poi-search/ (not a signalk-webapp, so absent
            from the Webapps launcher). Generated — do not hand-edit.
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
- **No server-side runtime dependencies.** The bus client is bundled into
  the browser assets at build time, and `express` is provided by the Signal K
  server at runtime — neither is a shipped runtime dependency. Both are carried
  as **devDependencies referenced by their published npm semver range**
  (`signalk-plotterext-bus`, `express`), never a local `file:` path. If you
  develop against a local checkout of the bus, do **not** commit the resulting
  lockfile — it records the sibling path and pins the linked version, which
  breaks `npm ci`. Regenerate from the registry before committing:
  `rm -rf node_modules package-lock.json && npm install`, then confirm the lock
  has zero `../signalk-plotterext-bus` references.
- **Filters are display-only and user-clearable.** This extension never
  modifies notes; it only pushes filters with a human-readable `label` (the
  host renders it as a clearable chip). Clearing state and the host filter
  must stay in sync, and dismissing the chip must clear *everything* this
  extension is filtering — search and hidden categories both — or the chip
  becomes impossible to dismiss.
- **One filter, composed here.** The host tracks at most one filter per
  (extension, resource type), so the search and the category checkboxes are
  combined in `pushFilter()` rather than pushed separately. Keep that the
  single place that calls `resources.setFilter`.
- **Hide categories with `exclude`, never `include`.** A filter condition on
  a missing field is false, so an include-by-category filter would also hide
  every note that carries no category at all.
- **The search summary lives in extension-scope state** so the results
  widget and a reopened panel agree; widgets re-render via `state.changed`.
- Degrade gracefully: `map` and `widgets` are optional capabilities; the
  panel must work without them.
- **Category means `properties.skIcon` and only that** (how ActiveCaptain
  encodes POI type). Do not re-add a `group` fallback: the hide filter matches
  one field path and `match` conditions are AND-combined with no OR, so a
  group-derived category would be offered in the UI and then fail to hide
  anything. Notes without `skIcon` are uncategorized, always visible, and
  'All shown types' always works. The category list is a *seed*, not a
  fixture: categories seen in query results are learned and remembered, so
  never assume the ActiveCaptain set is exhaustive.
- **Rebuild `public/` after any `src/web` edit** so a locally-linked dev
  server serves the current assets — but there is nothing to commit: `public/`
  is gitignored, and the published tarball always gets a fresh build from
  `prepare`. Only the `src/web` sources are reviewable, so never treat a
  rebuild as part of the diff.
- **`signalk.appIcon` is `assets/poi-search.png`, resolved out of `public/`.**
  The build copies `src/web/assets/` to `public/assets/`, and the server's
  App Store icon probe searches `public/` among its alternate directories, so
  the path resolves in the published package. The SignalK plugin-CI icon
  warning about this path is a known false positive: those icon checks are
  warnings, never errors, and the App Store probe finds it. Do **not** repoint
  it at `src/web/assets/...` on the strength of that warning — `src/` is not
  in the `files` whitelist, so that path is absent from the tarball and the
  icon really would break. (Declaring the committed source path is the tidier,
  warning-free form, but only if that exact path is added to `files` in the
  same change.)
