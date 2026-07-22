# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
