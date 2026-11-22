# Wind reach compared with NHC's wind swaths

*Checked 2026-11-22. Rerun with `npm run check:swaths` after a data rebuild. The full per-storm results are in
`wind-swath-check.json`, next to this file.*

The site works out where a storm's 34, 50 and 64 kt winds reached. It uses this for "Winds that reached" in the place
report (`src/data/near.ts`) and for the shaded footprint on the map (`src/data/footprintShapes.ts`). This check compares
those areas with the National Hurricane Center's own wind swaths for the same storms.

## What this does and doesn't show

NHC builds its swaths from the same kind of estimates the site uses: the best track's wind radii, which give how far
each wind speed reached in each quarter round the centre. So the comparison tests **how the site turns those estimates
into areas** (the shape by bearing, blending between 6-hourly reports, and the swept outlines) against the official
rendering.

It does **not** test whether those winds were actually felt at a place. NHC itself says the radii are "the maximum
possible extent… not all locations falling within the swaths will have experienced the indicated sustained wind
speeds". Checking that would need weather-station records.

## Method

- **Storms.** Every Atlantic and East Pacific hurricane that made landfall from 2005 (where NHC's GIS archive starts) to
  2026: 166 storms. NHC has no swath for 26 of them (most from 2005–2008, plus three Central Pacific storms from 2015),
  which leaves **140** to compare.
- **NHC's swath and estimates.** From each storm's best-track archive
  (`nhc.noaa.gov/gis/best_track/<id>_best_track.zip`): the `_windswath` shapes, and the `_radii` file with NHC's
  estimates at each report.
- **Time window.** NHC's swath covers only the time it advised on the storm, from its pieces' earliest start to their
  latest end. The site also shows winds from before and after that (as a low, or once post-tropical), where the
  agencies estimated them. Here both are compared over NHC's window, so the check is of the method rather than the span.
- **Grid.** A point every 0.25° over the area of NHC's 34 kt swath and 1° around it. At each point, the strongest
  winds that reached (64, 50, 34 kt or none) by NHC's swath and by the site. Points count by the area they stand for.
- **Cities.** Every city of 100,000 or more in that area, compared the same way.
- **Two sources, one storm.** For each storm, the check also counts the reports whose estimates differ between NHC's
  file and IBTrACS (which the site uses). Where none differ, any remaining difference can only come from the method.
- **Stray pieces.** Pieces of NHC's swath farther from every report than the storm's winds ever reached (plus 300 km)
  are dropped and counted. Only Kirk (2024) has them; see below.
- **Measures.**
  - *Overlap* is the area both call (at least) a given strength, as a share of the area either does.
  - *Beyond* and *short* are the areas only the site, or only NHC, calls it, as shares of NHC's area.

## Results

**The site, as it is now** (each quarter's estimate holds at its middle and blends into the next quarter's towards
the edges, as NHC draws its swaths), over all 140 storms:

| Winds | Overlap with NHC | Site beyond NHC | Site short of NHC |
|---|---|---|---|
| 34 kt (tropical-storm-force) | 97.0% | 1.9% | 1.2% |
| 50 kt | 96.0% | 2.7% | 1.3% |
| 64 kt (hurricane-force) | 93.8% | 4.6% | 1.8% |

- **Per storm:** the typical storm overlaps by 97% at 34 kt, 95% at 50 kt and 92% at 64 kt (medians).
- **Cities:** the site gives the same strongest winds as NHC at **1,235 of 1,344 cities (92%)**. In the other 109 it
  says stronger 67 times and weaker 42 times.
- **The map's footprint** matches as closely: 97.1% overlap at 34 kt and 93.6% at 64 kt.

**Method only.** For the 75 storms whose estimates are identical in NHC's file and IBTrACS:

| Winds | Overlap with NHC | Site beyond NHC | Site short of NHC |
|---|---|---|---|
| 34 kt | 97.6% | 1.4% | 1.0% |
| 50 kt | 97.0% | 2.1% | 1.0% |
| 64 kt | 95.2% | 3.6% | 1.4% |

**Before** (each quarter read as a quarter circle, its estimate all the way across the quarter), over the same storms
and windows:

| Winds | Overlap with NHC | Site beyond NHC | Site short of NHC |
|---|---|---|---|
| 34 kt | 90.8% | 9.1% | 0.9% |
| 50 kt | 90.1% | 10.0% | 0.9% |
| 64 kt | 87.9% | 12.5% | 1.2% |

- **Cities:** the same answer at 80% of them. When it differed, it said stronger winds than NHC 261 times and weaker
  only 34.
- **Method only:** 92.3%, 90.8% and 89.6% overlap.

This check found the difference, and the site now uses NHC's shape. For example, with the quarter circles Sandy (2012)
counted hurricane-force winds at New York, but NHC's swath has 50 kt there. Matthew (2016) and Isaias (2020) counted
tropical-storm-force winds at Miami that NHC's swath doesn't show. Both now agree with NHC.

## The storms that match least

Each of the lowest matches comes from the data, not the method.

- **Beryl (2018): 62% at 34 kt, the site's area larger.** The estimates and positions match NHC's at every report but
  one stretch. From 8 to 10 July Beryl degenerated into an open wave, still with 35–45 kt winds. IBTrACS has wind
  extents for those reports, and NHC's file has none, so NHC's swath leaves that stretch out. Beryl was tiny (20–40
  nautical miles), so that stretch alone makes the site's area 57% larger. The site shows those winds, as it does for a
  storm's other stages.
- **Patricia (2015): 73%, the site's area smaller.** NHC's GIS file dates from 3 December 2015. That is its "working"
  best track, from before NHC's final review of the storm. IBTrACS has the final best track, NHC's official record.
  The two disagree at 12 of 15 reports, most of all after landfall in Mexico: 0/50/0/30 nautical miles in the final
  record, 80/250/60/80 in the working one.
- **Kirk (2024): 76% before stray pieces were dropped, 98% after.** The estimates match NHC's at all 39 reports. But
  NHC's swath file is damaged:
  - Five copies of a shape, about every 31° of longitude across Europe and Asia (27–158°E). Kirk's track ends at 8°E.
  - Two slivers in the North Atlantic.
  - Everything cut off at exactly 51.0°N, though Kirk's winds reached about 280 km north of its track's end there.
    Other storms' swaths go well past 51°N (Fiona 2022 to 65°N), so the cut-off isn't a general limit.

  The check now drops the stray pieces. The cut-off remains, and accounts for most of the 16 European cities where the
  site gives 34 kt and NHC's swath gives none.
- **2010 storms** (Tomas, Paula, Igor and Alex, 80–92%). NHC's files date from weeks after the season, and their
  estimates differ from IBTrACS's at most reports (30 of 36 for Tomas, 15 of 15 for Paula).

**What's left.** Among storms with identical estimates, the remaining 1–2% on each side sits along the swaths' edges.
The likely cause is how each blends between reports. Small hurricane-force areas magnify it, because a few grid
points are a large share. Examples are Nicholas (2021) and Barbara (2013) at 64 kt.

## Also found by this check

Building every storm's footprint for the comparison showed that merging the shapes failed for Ophelia (2017) and Kirk
(2024). The site would have shown no footprint for them and left the request waiting. Fixed by snapping coordinates to
about 1 m before merging, and the worker now answers even if merging fails; a test covers both storms.
