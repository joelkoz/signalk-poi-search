// Build the panel/widget web assets into public/, which the plugin serves as
// a top-level static route at /plotterext/signalk-poi-search/.

import { build } from 'esbuild'
import { cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pub = join(root, 'public')
mkdirSync(join(pub, 'js'), { recursive: true })

await build({
  entryPoints: [join(root, 'src/web/panel.js'), join(root, 'src/web/widget.js')],
  bundle: true,
  format: 'iife',
  outdir: join(pub, 'js'),
  sourcemap: true,
  target: ['es2020'],
  logLevel: 'info'
})

cpSync(join(root, 'src/web/poi.css'), join(pub, 'poi.css'))

const page = (name, bodyClass, title) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="poi.css">
</head>
<body class="${bodyClass}">
<div id="root"></div>
<script src="js/${name}.js"></script>
</body>
</html>
`

writeFileSync(join(pub, 'panel.html'), page('panel', 'panel', 'POI Search'))
writeFileSync(join(pub, 'widget.html'), page('widget', 'widget', 'POI Results'))
writeFileSync(
  join(pub, 'index.html'),
  `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>POI Search</title>
<link rel="stylesheet" href="poi.css"></head>
<body class="panel">
<div id="root">
<h2>POI Search</h2>
<p class="status">This package provides a point-of-interest search panel and
results widget for chartplotters that support the Signal K
<code>plotterExtensions</code> resource type (e.g. Freeboard-SK). Open your
chartplotter and use its POI Search toolbar button. Works best together
with a notes provider such as signalk-activecaptain-resources.</p>
</div>
</body>
</html>
`
)

console.log('public/ assets written')
