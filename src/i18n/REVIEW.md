# Reviewing a translation

A language goes public only after native speakers have reviewed it. Until then it isn't listed in `VITE_LANGUAGES`
(`.env`), so it isn't offered in the picker or chosen from a reader's browser, but it opens on the real site with
`?lang=xx`. To make it public, add its code to `VITE_LANGUAGES` (e.g. `VITE_LANGUAGES=en,es`) and rebuild.

Status:

| Language | File | Drafted | Reviewed by | Public |
|---|---|---|---|---|
| Spanish (es-419) | `es.ts` | 2026-11-20 (Claude) | | no |

## What to look at

Open these with `?lang=es` (or the language's code) added, and read every word:

1. **The map page:** `/?lang=es`. This covers the filters, the list, the "Passed near" search (try a city in your
   language's spelling and in English), the playback bar (▶ under the list) and "About the data" at the bottom.
2. **A storm:** `/?lang=es&from=2017&to=2017&min=0&storm=2017260N12310` (Maria). Also hover the dots on the map.
   - For the regional scales, try one storm from each agency:
     - Haiyan (`2013306N07162`), JMA
     - Amphan (`2020136N10088`), IMD
     - Freddy (`2023036S12117`), Météo-France
     - Yasi (`2011028S13180`), BoM
     - Winston (`2016041S14170`), Fiji
   - For sea temperature and rough seas: Ian (`/?lang=es&from=2022&to=2022&min=0&storm=2022266N12294`). Read the
     "Oleaje alto" row, the map key under it, the sea temperature chart and the note below it, and hover a dot over
     water for the temperature line in the popup.
3. **A place report:** `/?lang=es&from=1980&to=2026&min=0&country=Mexico&km=100&view=report`, and a city one:
   `/?lang=es&from=2004&to=2026&min=0&lat=25.788&lon=-80.224&place=Miami&km=50&view=report`. The text under the
   table ("How this is worked out") is the longest.
4. **Print preview** of a report, and the site on a phone.

## Spanish: decisions to confirm or change

- **Variety and tone.**
  - The draft is Latin American Spanish (`es-419`), since that's where most Spanish speakers hurricanes reach live.
    Dates and numbers follow it: "14.5 días", with a decimal point.
  - It says "tú" ("elige", "haz clic").
- **Storm terms** follow the Spanish of NHC's products and Mexico's and Cuba's weather services:
  - *depresión tropical*, *tormenta tropical*, *huracán*, *huracán mayor*, *tocó tierra*.
  - "Intensidad" is used for strength, "fuerza" for wind force ("vientos con fuerza de huracán").
- **Abbreviations** in the legend and list: DT, TT, ST (subtropical), PE (perturbación), PT (postropical). Are these
  the ones readers would recognize?
- **"Reporte" vs "informe".** "Reporte" is used for a storm's 6-hourly position reports, and "informe" for the place
  report.
- **Sea temperature and rough seas.**
  - *Oleaje alto* for the 12 ft seas, as NHC's Spanish advisories say. The height is given in feet first, with metres
    after ("olas de 12 pies (3.7 m) o más"), because 12 ft is the forecasters' own threshold. Would readers rather
    see metres alone?
  - *Temperatura del mar bajo el centro* for the chart, and *Mar 29.5 °C · 85 °F* in the map popup.
  - *Intensificarse* for a storm strengthening ("suelen necesitar 26 °C o más para intensificarse").
  - The two new points in "Acerca de los datos" (sea temperature and rough seas).
- **The note on a provisional storm** with no typhoon- or hurricane-force extents yet ("Las extensiones de los vientos
  con fuerza de tifón aún no están en el registro…"). See it on Ragasa: `/?lang=es&from=2025&to=2025&min=0&storm=2025260N13138`.
- **Regional scales** (`regional.classes`). These are names, so they should match what each region's
  Spanish-language press uses:
  - JMA: *tifón muy fuerte*, *tifón violento*.
  - IMD: *tormenta ciclónica extremadamente severa*, *supertormenta ciclónica*.
  - Météo-France: *ciclón tropical intenso*, *muy intenso*.
  - Australia: *ciclón tropical severo de categoría 3*, *baja tropical*.
- **Country names** come from the standard list browsers use (Unicode CLDR), and from Natural Earth for territories
  with no ISO code. One was overridden in `scripts/build-data.mjs` (`NAME_FIXES`): Natural Earth calls the Spratly
  Islands "Isla Wake", a different island. Scarborough Reef also has a fix there, for the Philippines' name in a
  disputed area, but the site doesn't show the reef today.
- **City names** are Natural Earth's (`NAME_ES`), in `public/data/names/es.json`. Most are right, but spot-check the
  big ones in your region. Some look off, for example "Hải Phòng" (Vietnamese, not Spanish) and "Ciudad de Jilin".
  Fixes go in `NAME_FIXES` too.
- **Map labels** come from OpenStreetMap's `name:es`, through the basemap. Fix them in OpenStreetMap itself, not here.

## On purpose, not translated

- Storm names. They are official names.
- The data citation.
- Column names and values in downloaded CSV and GeoJSON files, because spreadsheets and GIS tools rely on them.
- The basemap's attribution line.
