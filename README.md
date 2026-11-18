# Storm Tracks

Every tropical cyclone on record, worldwide since 1842, on a map: pick a range of seasons, basins and a minimum
strength, and see the paths coloured by strength. Choose a storm for its dates, peak wind, lowest pressure, energy
(ACE), landfall and wind over its life.

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

Cite: Gahtan, J., et al. (2024), IBTrACS Project, Version 4r01, NOAA NCEI, doi:10.25921/82ty-9e16; Knapp, K. R.,
et al. (2010), Bull. Amer. Meteor. Soc., 91, 363–376.

## Develop

```sh
npm install
npm run dev
npm run build
```
