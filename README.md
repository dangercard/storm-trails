# Storm Trails

Every tropical cyclone on record, worldwide since 1842, on a map: [stormtrails.com](https://stormtrails.com).

- Filter by seasons, basins and strength; play the storms through time.
- **Near:** storms that passed near a country, a city or a spot on the map, and how far their winds reached. The
  place report (`?view=report`) counts them, charts them, and prints or downloads.
- **A storm:** its dates, peak wind, pressure, energy (ACE), landfalls, wind field, rough seas, and the sea
  temperature under it.
- Downloads as CSV or GeoJSON, made in the browser. The address bar keeps the view, so any view can be shared.

React + Vite + MapLibre GL, with an OpenFreeMap basemap (no API key).

## Develop

```sh
npm install
npm run dev
npm test     # the logic on made-up tracks, and the built data against well-known storms
npm run build
```

`dist/` is the whole site. It's served by the Cloudflare Worker `storm-trails` (`wrangler.jsonc`), which deploys each
push to `master`. `public/_headers` lets browsers cache `/assets` for a year; the page and `/data` are checked on each
visit.

## Data

The files the site loads are in `public/data`, committed, so the site builds without downloading anything. To rebuild
them:

```sh
npm run data        # download IBTrACS and Natural Earth to data/raw (git-ignored), then build public/data
npm run data:sst    # sea temperatures for new or changed storms (kept in data/sst)
npm run data:build  # again, to add them to the tracks
```

A GitHub Action (`.github/workflows/update-data.yml`) does this every Monday, and commits the result only if the tests
pass. If a data test fails after an IBTrACS update, a storm may have been re-analysed; check before changing the
test.

Sources:

- **Tracks:** NOAA NCEI's [IBTrACS](https://www.ncei.noaa.gov/products/international-best-track-archive) v04r01.
  If NCEI is offline, `data:fetch` falls back to a checksummed copy of its 2026-10-27 file (never in the weekly
  update).
- **Wind and seas extents:** IBTrACS, from about 2000. They're drawn as NHC draws its wind swaths;
  `npm run check:swaths` compares the two (`docs/wind-swath-check.md`).
- **Sea temperature:** NOAA OISST v2.1 (from 1981), via NOAA's CoastWatch ERDDAP. Each point gets the water the day
  before the storm arrived, or the latest day within a week before when that day is missing.
- **Countries and cities:** Natural Earth. A country reached over land from a neighbour is listed as crossed, not a
  landfall.

Strength is Saffir-Simpson everywhere. Where the region's official agency has its own scale (Japan, India,
Météo-France La Réunion, Australia, Fiji, New Zealand), the storm panel shows that class too.

`scripts/build-data.mjs` explains the details of what's kept and how.

Cite: Gahtan, J., et al. (2024), IBTrACS Project, Version 4r01, NOAA NCEI, doi:10.25921/82ty-9e16; Knapp, K. R.,
et al. (2010), Bull. Amer. Meteor. Soc., 91, 363–376.

## Languages

Everything the site says is in `src/i18n/en.ts`. Another language is a file of the same shape, which TypeScript
checks. Country and city names come from `public/data/names/<lang>.json`, written by the data build.

Spanish (`es.ts`) is drafted and waiting for review by native speakers. It opens with `?lang=es` but isn't offered
yet; `src/i18n/REVIEW.md` says what to check and how to make it public.
