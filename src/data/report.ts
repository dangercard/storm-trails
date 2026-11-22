/** Which storms a place report lists, and the counts of winds that reached the place (see PlaceReport) */
import type { Track } from './exports';
import type { Closest, NearMeasure, Reach } from './near';
import type { Radii, Storm, TrackPoint } from './storms';

/** Estimates of how far winds reached exist from about 2000 (scattered), and are complete from 2004 in most basins */
export const RADII_FROM = 2000;
export const WINDS_COMPLETE_FROM = 2004;

/** A storm in the report: where it came closest, the strongest winds that reached, and whether its centre came within the distance */
export type ReportRow = { storm: Storm; closest: Closest; track: Track; reach: Reach; within: boolean };

/**
 * Every storm in the report, most recent first: those whose centre came within the distance (`tracks`), and those
 * among `nearby` whose winds reached the place though their centre stayed farther away; and the storms that came near
 * enough for their winds to have reached it but had no estimate of how far they did
 */
export function reportRows(
  tracks: Track[],
  nearby: Track[],
  measure: NearMeasure,
  radiiFor: (storm: Storm, points: TrackPoint[]) => (Radii | null)[] | null,
): { listed: ReportRow[]; unestimated: Storm[] } {
  const listed: ReportRow[] = [];
  const unestimated: Storm[] = [];
  const within = new Set(tracks.map((t) => t.storm));
  const reachOf = (t: Track) => (t.storm.season >= RADII_FROM ? measure.reach(t.points, radiiFor(t.storm, t.points)) : null);
  for (const track of tracks) {
    const closest = measure.closest(track.points);
    if (closest) listed.push({ storm: track.storm, closest, track, reach: reachOf(track), within: true });
  }
  for (const track of nearby) {
    if (within.has(track.storm) || track.storm.season < RADII_FROM) continue;
    const reach = reachOf(track);
    if (reach === null) unestimated.push(track.storm);
    if (!reach) continue;
    const closest = measure.closest(track.points);
    if (closest) listed.push({ storm: track.storm, closest, track, reach, within: false });
  }
  for (const r of listed) if (r.within && r.reach === null && r.storm.season >= RADII_FROM) unestimated.push(r.storm);
  listed.sort((a, b) => b.closest.t - a.closest.t);
  return { listed, unestimated };
}

/** How many of the listed storms' winds of at least `kt` reached the place, from the season `from` on */
export const windsReached = (listed: ReportRow[], kt: 34 | 50 | 64, from: number) =>
  listed.filter((r) => r.storm.season >= from && (r.reach ?? 0) >= kt).length;
