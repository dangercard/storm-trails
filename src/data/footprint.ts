/**
 * A storm's wind footprint: the area its tropical-storm-force (34 kt) and hurricane-force (64 kt) winds covered over
 * its life, from the agencies' estimates of how far those winds reached in each quarter round the centre. Built in a
 * worker (see footprintShapes.ts), started the first time one is asked for.
 */
import FootprintWorker from './footprint.worker?worker';
import type { Radii, TrackPoint } from './storms';

export { BANDS } from './footprintShapes';

let worker: Worker | null = null;
let next = 0;
const waiting = new Map<number, (fc: GeoJSON.FeatureCollection | null) => void>();

/**
 * The footprint of a track (a feature per strength of winds, { kt: 34 } and { kt: 64 }, and for 12 ft seas,
 * { seas: 12 }), or null when it has no radii
 */
export function footprint(
  points: TrackPoint[],
  radii: (Radii | null)[] | null,
  seas: (Radii | null)[] | null,
): Promise<GeoJSON.FeatureCollection | null> {
  if (!worker) {
    worker = new FootprintWorker();
    worker.onmessage = (e: MessageEvent<{ id: number; footprint: GeoJSON.FeatureCollection | null }>) => {
      waiting.get(e.data.id)?.(e.data.footprint);
      waiting.delete(e.data.id);
    };
  }
  const id = next++;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    worker!.postMessage({ id, points, radii, seas });
  });
}

/** The farthest a storm's winds of a strength reached from its centre, in km, over its life; null without radii */
export function widest(radii: (Radii | null)[] | null, offset: number): number | null {
  if (!radii?.some(Boolean)) return null;
  let w = 0;
  for (const r of radii) if (r) w = Math.max(w, r[offset], r[offset + 1], r[offset + 2], r[offset + 3]);
  return w;
}
