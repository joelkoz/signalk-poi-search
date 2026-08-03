# signalk-poi-search

Search points of interest on your chartplotter. Works with any chartplotter
that supports Signal K plotter extensions (such as Freeboard-SK).

Points of interest come from the marine data on your server — for example
[signalk-activecaptain-resources](https://github.com/KvotheBloodless/signalk-activecaptain-resources),
which imports Garmin ActiveCaptain marinas, anchorages, hazards and more. In a
busy cruising area that can easily mean hundreds of markers. This extension
lets you narrow them down two ways.

Tap the **POI Search** button in your chartplotter to open the panel.

## Show on chart — tidy up the clutter

A checkbox per category of point of interest. Uncheck the ones you don't want
to see — hazards, bridges, whatever you find noisy — and they disappear from
the chart until you check them again. This stays in effect as you cruise; it is
not tied to a search.

The list starts with the usual ActiveCaptain categories, then adds the
categories used by any provider that can list its whole collection. Providers
that only answer position-based queries — ActiveCaptain among them — contribute
their categories after a search turns one up instead.

Points of interest that carry no category are always shown, so nothing you
placed yourself can be hidden by accident.

## Search — find something specific

- Enter a keyword, pick a category, and a distance from your vessel.
- Leave the category on **All shown types** to search everything you have
  checked above. Or pick a single category to go straight to it — handy when
  you want the nearest marina but normally keep marinas hidden. That choice
  ignores the checkboxes for as long as the search is on screen.
- **Search** — the chart shows only the matches, the view fits them, and a
  filter chip appears (clear it any time to see everything again).
- Results are listed **nearest first**, with how far each one is from your
  vessel. Tap the **Name** or distance heading to sort by that column, and
  again to reverse it. Distances use whatever unit you have set on your
  Signal K server — nautical miles or kilometres.
- Tap any result in the list to centre the chart on it, zooming in far enough
  that the marker actually shows. Worth knowing: chartplotters typically draw
  points of interest only near the middle of the chart and only above a certain
  zoom level — in Freeboard-SK both are set under *Settings → Resources →
  Notes* — so a distant match may be listed here before it appears on the
  chart. Tapping it brings the chart to it.
- **Clear search** goes back to just your **Show on chart** selection.

Optionally place the **POI Search Results** widget to keep the active search
and match count on screen; tap it to reopen the panel.

The panel remembers your entries and your category selection while it is
closed, and works with any provider of marine points of interest —
ActiveCaptain is recommended, not required.

## License

MIT
