# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Show on chart**: a persistent per-category filter in the search panel —
  one checkbox per known point-of-interest category, plus All/None. Unchecked
  categories are hidden from the chart until re-checked, independently of any
  search. Implemented as an `exclude` filter on the hidden categories so that
  points of interest carrying no category are never hidden.
- The category list is discovered, not fixed: it seeds with the ActiveCaptain
  POI types and learns any other category found in a query result, so other
  notes providers get their own categories. Remembered across sessions.
- Search results now show the range from the vessel to each point of interest
  and are sorted **nearest first**, so the 50-row display cap means "the
  nearest 50" rather than an arbitrary 50. Both the name and range columns
  are sortable headers (click to sort, click again to reverse); the choice is
  remembered. Range is computed once per search from the position that search
  was run with, so the column cannot drift as the vessel moves.
- The range column honours the server's **Unit Preferences** — `units.get`
  selects nautical miles or kilometres — instead of hard-coding a unit. The
  `Within (nm)` input is unchanged, since its label already names its unit.
- Tap a search result to centre the chart on it (`map.center`). A host only
  loads notes near the chart centre, so a distant match can be listed before
  it is drawn; the panel now says so when results are widely spread. The tap
  also clamps the zoom to at least the level below which hosts stop drawing
  notes (Freeboard-SK's "Notes Zoom level", default 10) — otherwise centring
  on a POI from a zoomed-out chart would still show nothing. It never zooms
  out: a closer current zoom is left alone.
- Fitting the chart to search results no longer lands below that zoom either.
  A wide result spread previously fitted to a zoom at which the host draws no
  notes at all, so a successful search could leave an empty chart; the view
  now falls back to centring on the results at the minimum zoom when they are
  too spread out to frame above it.

### Changed
- A note's category is now taken from `properties.skIcon` only; the previous
  fallback to `group` is gone. It could not be honoured by the host filter
  (which matches a single field path, with conditions AND-combined and no OR),
  so a group-derived category would have been offered as a checkbox that
  silently failed to hide anything. Notes without `skIcon` are uncategorized
  and always visible.
- The search category is now `All shown types` (obeying the checkboxes) plus
  one entry per known category. Selecting a single category **bypasses** the
  checkboxes for that search, so the nearest marina is still findable while
  marinas are hidden.
- `Show all` is now `Clear search`: it drops the search and returns to the
  category selection rather than clearing all filtering.
- The results widget shows the category filter when no search is running.

### Fixed
- Build script logs to stderr instead of stdout. On Node 22 / npm 10 the
  SignalK plugin-CI "Verify npm pack" step runs `prepare` (the build) even
  under `--ignore-scripts`, so build output on stdout corrupted the
  `npm pack --json` payload and the file-list parse failed — making the check
  report the plugin entry point and screenshots as missing from the tarball.
  Build-tooling only; the published tarball is unchanged.

## [0.5.3] - 2026-07-22

### Fixed
- Reference the `signalk-plotterext-bus` build dependency by its published npm
  version (`^0.5.0`) instead of a local `file:` path, so the project installs,
  builds, and tests cleanly from a fresh clone (it previously only resolved
  against a sibling working copy). Regenerated `package-lock.json` from the
  registry to purge the stale local-path reference that broke `npm ci`.

### Added
- Declare `express` as a `devDependency` so local install/build/test resolves it
  deterministically instead of relying on a globally-hoisted copy. It remains a
  build-only dependency — at runtime the plugin uses the `express` provided by
  the Signal K server, so it is not shipped as a runtime dependency.
- SignalK plugin-CI workflow (`.github/workflows/signalk-ci.yml`) that runs the
  shared cross-platform test matrix.
- This changelog.

## [0.5.2]

### Added
- App icon and app-store screenshot.

### Changed
- README rewritten to be user-facing.
- Removed the plugin from the webapps menu — it is a chart-plotter extension
  (plotterExtensions), not a standalone web app.
- Results widget: short tap toggles the search panel; long-press opens config
  (remove).

## [0.5.0]

### Added
- Initial release: search and filter points of interest (Signal K notes) on
  `plotterExtensions`-capable chartplotters. Registers a read-only
  plotterExtensions provider.
