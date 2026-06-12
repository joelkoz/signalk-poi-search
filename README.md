# signalk-poi-search

Search points of interest on your chartplotter. A reference extension for
the Signal K **plotterExtensions** mechanism (first reference host:
Freeboard-SK).

Points of interest arrive as Signal K `notes` — for example from
[signalk-activecaptain-resources](https://github.com/KvotheBloodless/signalk-activecaptain-resources),
which imports Garmin ActiveCaptain marinas, anchorages, hazards and more.
In a busy cruising area that easily means hundreds of markers. This
extension lets you narrow them:

- Tap the **POI Search** toolbar button in your chartplotter.
- Enter a keyword, pick a category (marina, anchorage, hazard, …) and a
  distance from your vessel.
- **Search** — the chart now shows only the matching POIs, the view fits
  the results, and a filter chip appears (clear it any time to see
  everything again).
- Optionally place the **POI Search Results** widget to keep the active
  search and match count on screen; tap it to reopen the search panel.

The search panel keeps its state while closed, and works with any Signal K
notes provider — ActiveCaptain is recommended, not required.

## Development

```sh
npm install
npm run build    # bundles src/web -> public/
npm test
```

Developer documentation lives in `AGENTS.md` and `REQUIREMENTS.md`.

## License

MIT
