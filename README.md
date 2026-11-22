# Storm Tracks

Every tropical cyclone on record, worldwide since 1842, on a map: pick a range of seasons, basins and a minimum
strength, and see the paths coloured by strength. Narrow it to storms that passed near a country, a city or a spot
on the map. Play them through time. The address bar keeps the view (filters, chosen storm, "Near"), so it can be
bookmarked or shared.

Downloads, all made in the browser: the storms in view as a CSV storm list, CSV track points or GeoJSON tracks
(split at the date line, for QGIS, ArcGIS or Google Earth), and any one storm's track. With "Near" on, the place
report (`?view=report`) gives how many storms passed, how often, how strong they were when nearest, when in the year,
a track map and a table of every one; it prints or saves as PDF and downloads as CSV or GeoJSON. Choose a storm for its dates, peak wind, lowest pressure, energy (ACE), the
countries it made landfall in and its wind over its life.

The site's name is a placeholder, set in one place: `VITE_APP_NAME` in `.env`.

React + Vite + MapLibre GL, with an OpenFreeMap basemap (no API key).

## Data

Tracks come from NOAA NCEI's [IBTrACS](https://www.ncei.noaa.gov/products/international-best-track-archive)
v04r01 (all basins). The trimmed files the site loads are in `public/data` and are committed, so the site builds
without the 333 MB download. To rebuild them:

```sh
npm run data        # data:fetch (download to data/raw, git-ignored) then data:build (write public/data)
```

`data:fetch` tries NCEI first. NCEI's download folder has been offline since late October 2026; when it is, the
script uses a frozen copy of NCEI's file of 2026-10-27 on Hugging Face, checked against its recorded sha256.
`scripts/build-data.mjs` explains what's kept (main tracks, 6-hourly points) and how wind and category are chosen.

Landfall countries are worked out at build time against Natural Earth country shapes (the `world-atlas` package;
today's borders), in `scripts/countries.mjs`. A country the centre reached over land from a neighbour (Haiti from the
Dominican Republic, Zimbabwe from Mozambique) isn't a landfall; it's listed as crossed, and lit up on the map too. `public/data/countries.topo.json` holds every country's shape (TopoJSON, unsimplified): the map lights
up the chosen storm's landfalls, and the "Near" filter measures distance to them. `public/data/places.json` is
Natural Earth's populated places (v5.1.2, fetched by `data:fetch` with its countries, for their names in other
languages), the cities "Near" can search.

`public/data/radii/<decade>.json` holds how far 34, 50 and 64 kt winds reached in each quarter round the centre at
each report (the US agencies' estimates, else Météo-France La Réunion's or Australia's), from about 2000. The place
report uses them for "Winds that reached" (`src/data/near.ts`, `reach`), and the chosen storm's shaded wind
footprint is built from them in a worker (`src/data/footprintShapes.ts`). Both hold each quarter's estimate in the
middle of the quarter and blend it into the next quarter's towards the edges, as NHC draws its wind swaths.
`npm run check:swaths` compares the result with NHC's own swaths (`docs/wind-swath-check.md`).

Strength is the Saffir-Simpson category everywhere (colours, filters). Alongside it, where the region's official
agency has its own scale, the site shows that agency's class and its own wind: the Japan Meteorological Agency, the
India Meteorological Department, Météo-France La Réunion, Australia's Bureau of Meteorology, Fiji and New Zealand
(IBTrACS's `WMO_AGENCY`). The class is worked out at build time from the agency's wind on today's thresholds for its
scale (`regionalOf` in `scripts/build-data.mjs`; the names are in `src/i18n`). The words follow the basin: "hurricane"
in the North Atlantic and East Pacific, "typhoon" in the West Pacific, "category 1+" elsewhere.

Cite: Gahtan, J., et al. (2024), IBTrACS Project, Version 4r01, NOAA NCEI, doi:10.25921/82ty-9e16; Knapp, K. R.,
et al. (2010), Bull. Amer. Meteor. Soc., 91, 363–376.

## Develop

```sh
npm install
npm run dev
npm test            # tests/: the logic on made-up tracks, and the built data against well-known storms
npm run build
```

Built for static hosting: `dist/` is the whole site. On Cloudflare Pages, `public/_headers` (copied into `dist/`) lets
browsers keep the fingerprinted code in `/assets` for a year; the page and `/data` are checked on each visit, so a data
rebuild shows at once. Cloudflare compresses with brotli on its own.

## Languages

Everything the site says is in `src/i18n/en.ts`; a language is another file of the same shape (TypeScript checks it),
added to `CATALOGS` in `src/i18n/index.tsx`. Text with a number in it is a function, so each language places the number
and picks the plural its own way. Storm names, the data citation, and the column names and values in downloads stay in
English in every language.

Names of countries and cities in other languages are made by `npm run data:build` into `public/data/names/<lang>.json`
(countries: the browsers' standard names, Unicode CLDR; cities: Natural Earth's), and load with the language. Links
keep a country's English name, so they work in every language. The basemap shows OpenStreetMap's names in the
language where it has them.

Spanish (`es.ts`) is drafted and waiting for native speakers to review it; `src/i18n/REVIEW.md` says what to check and
how a language goes public.

`VITE_LANGUAGES` in `.env` lists the languages offered to everyone. Any language with a file still opens with
`?lang=xx`, so a translation can be reviewed on the real site before it's offered. The language comes from `?lang=`,
then the reader's last choice, then their browser's languages, then English; links carry `lang` only when the reader
chose one, so a shared link opens in the next reader's own language.
