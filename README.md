# Delta Vision | دلتا فيجن

Crop classification of the Nile Delta with **Sentinel-2 + Google Earth Engine** — a single-file
static web app, **Arabic-first (RTL) with English toggle**, and every area reported in
**فدان (feddan)**.

Open `public/index.html` (or the deployed URL) and you get the whole app: landing page, sign-up /
login, shapefile upload, drawing tools, the classification workspace, results in feddan, CSV export
and a printable report. No server required — Leaflet, proj4js, the fonts and the images are all
inlined into one HTML file.

> **Preview vs live**: the class map in this build is an illustrative preview that follows the
> season's class priors from the Basira engine; overall accuracy / Kappa are not computed.
> When your Earth Engine endpoint is ready, the same page switches to real classification —
> see [Live backend](#live-backend-earth-engine-optional) below.

## Quick start

```bash
python3 build.py            # builds public/index.html (~1.6 MB, all inline)
npx serve public            # or just open public/index.html in a browser
```

Requirements: Python 3.8+ with Pillow (`pip install Pillow`) for the build. Nothing else.

## What's inside

| Path | What it is |
| --- | --- |
| `src/app.js` | the app: hash routing, landing page, auth screens, workspace, results, CSV/print |
| `src/geo.js` | pure-JS shapefile reader: `.shp/.dbf/.prj/.cpg`, ZIP archives, CRS→WGS84, geodesic areas |
| `src/auth.js` | demo sign-up/login (localStorage, salted iterated SHA-256 — no server, no real security) |
| `src/i18n.js` | Arabic + English dictionaries, 12 classes, 11 algorithms, parameter ranges, seasons |
| `src/data.js` | engine constants (signatures, priors) + the built-in Borj El Arab study area |
| `src/index.html`, `src/style.css` | page skeleton + design (lime accent, rounded cards, RTL/LTR) |
| `vendor/` | Leaflet (BSD-2), proj4js (MIT), Poppins + Cairo fonts (OFL) |
| `images/` | AI-generated illustrations for the landing page (embedded as WebP at build) |
| `test/` | Node test suites + Playwright end-to-end tests |
| `ref/` | the reference facts / scripts used to generate `src/data.js` |

## Features

- **Upload SHP** — a `.zip` or the loose `.shp/.dbf/.prj/.cpg` files. Egyptian belts (EPSG 2299x),
  UTM zones, ED50 and Egypt 1907 datums are converted to WGS84; Arabic attribute encodings
  (Windows-1256, ISO-8859-6, DOS-864) are decoded. Per-parcel areas come out geodesic, in feddan.
- **Draw instead** — polygon / rectangle on the map, or centre + radius, or a bounding box.
- **Built-in study area** — Borj El Arab, 141,841.26 feddan (simplified from the project's own
  boundary file) so visitors can try everything without data.
- **11 algorithms** with the engine's real parameter ranges; supervised / unsupervised /
  knowledge-based groups; a Compare dialog; k-means clustering view.
- **Seasons** — winter (Nov–Apr), summer (May–Oct), full year, 2025/2024/2023, with the
  engine's exact date windows and competing-class lists.
- **Results in feddan** — class table (feddan + km²/ha/m² + %), donut, per-parcel table,
  reference NDVI signature chart, CSV export (BOM), printable report.
- **Accounts** — sign-up / login / logout / demo account, guarded routes. Client-side demo of
  the flow: there is no server, so it is not production security.

## Live backend (Earth Engine, optional)

The page speaks the engine's `RunInput`/`RunResult` shapes. Point it at your run endpoint with
either:

```html
<script>window.DV_BACKEND_URL = "https://your-api.example/api/run";</script>
```

or at runtime / for testing: `https://your.site/?backend=https://your-api.example/api/run`.

The endpoint receives `POST` JSON:

```jsonc
{
  "kind": "run", "algorithm": "rf", "season": "winter", "year": 2025, "cloudMax": 60,
  "params": { "rfTrees": 100 }, "samplePoints": [ { "classId": 1, "lon": 29.8, "lat": 30.9 } ],
  "aoiGeo": { "type": "FeatureCollection", "features": [ /* polygons in WGS84 */ ] },
  "aoiName": "Borj El Arab"
}
```

and must answer with:

```jsonc
{
  "mode": "live", "tileUrl": "https://…/{z}/{x}/{y}.png",  // EE tile overlay
  "oa": 0.913, "kappa": 0.874, "areaKm2": 595.73,
  "dateFrom": "2024-11-01", "dateTo": "2025-04-30",
  "nImages": 23, "nTrain": 4520, "nVal": 1937, "sampleSource": "auto", "durationMs": 38210,
  "classes": [ { "classId": 1, "areaKm2": 238.3, "percent": 40 } ]
}
```

With that set, the badge flips to **Earth Engine**, the map shows the real tile overlay, and the
results card shows the real OA / Kappa and the endpoint's own areas. Errors surface as a toast.

## Tests

```bash
npm test        # unit suites: geo 140 checks, auth 39, i18n 87  (needs node)
npm run test:e2e  # Playwright: 54 preview checks + 12 live-backend checks
```

The geo suite is checked against pyproj/geopandas reference values (see `ref/geo_reference.py`);
the live suite mocks the Earth Engine endpoint with Playwright routing and proves the whole
live path (input shape, OA/Kappa display, feddan from `areaKm2`, failure toast).

## Deploy

The app is one static file — any static host works.

**Vercel**: push this repo to GitHub, then "Import Project" at vercel.com (or `npx vercel`).
`vercel.json` already sets the build command (`python3 build.py`) and output (`public/`).
Vercel's Python runtime is available by default; if you build locally, commit `public/` and use
outputDirectory `public` with no build command.

**GitHub Pages**: `python3 build.py docs/index.html && git subtree push --prefix docs origin gh-pages`
(or commit the built file and point Pages at it).

## Credits

Sentinel-2 imagery © Copernicus/EESA · basemap imagery © Esri, Maxar, Earthstar Geographics ·
streets © OpenStreetMap contributors · Leaflet (BSD-2) · proj4js (MIT) · Poppins & Cairo (OFL).
Landing illustrations are AI-generated. Project engine: Basira | بصيرة.

## License

MIT for this repository's code. The vendored libraries keep their own licenses (see `vendor/`).
