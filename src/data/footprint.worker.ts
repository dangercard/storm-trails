/** Builds wind footprints off the main thread (see footprintShapes.ts): merging the shapes takes up to a few hundred ms */
import polygonClipping from 'polygon-clipping';
import { buildFootprint, type Union } from './footprintShapes';
import type { Radii, TrackPoint } from './storms';

self.onmessage = (
  e: MessageEvent<{ id: number; points: TrackPoint[]; radii: (Radii | null)[] | null; seas: (Radii | null)[] | null }>,
) => {
  const { id, points, radii, seas } = e.data;
  let footprint: GeoJSON.FeatureCollection | null = null;
  try {
    footprint = buildFootprint(points, radii, polygonClipping.union as Union, seas);
  } catch {
    // Merging failed (polygon-clipping, on awkward geometry): no footprint, rather than one never answered
  }
  self.postMessage({ id, footprint });
};
