import { useEffect, useRef } from 'react';
import {
  type GeoJSONSource,
  Map as MlMap,
  type MapMouseEvent,
  NavigationControl,
  Popup,
  setWorkerUrl,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre looks for its worker beside its own file, which isn't where Vite serves it: bundle it as a worker instead
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { category, CAT, colorExpression, kt } from '../data/categories';
import { formatDate, type Storm, type TrackPoint } from '../data/storms';

interface StormMapProps {
  /** The storms in view, with their tracks */
  tracks: { storm: Storm; points: TrackPoint[] }[];
  selected: Storm | null;
  selectedPoints: TrackPoint[] | null;
  onSelect: (id: string | null) => void;
  /** Space the side panel covers, so a chosen storm is framed in the part of the map that shows */
  padding: { left: number; bottom: number };
}

type Feature = GeoJSON.Feature<GeoJSON.LineString, { id: string; cat: number; tropical: boolean }>;

/**
 * A track as lines, one per stretch at the same strength (each segment takes the colour of the point it starts
 * from), so a whole century of storms is a few hundred thousand lines rather than millions.
 */
function trackFeatures(storm: Storm, points: TrackPoint[]): Feature[] {
  const out: Feature[] = [];
  let run: [number, number][] = [];
  let cat = points[0]?.cat;
  const flush = () => {
    if (run.length > 1) {
      out.push({
        type: 'Feature',
        properties: { id: storm.id, cat, tropical: cat >= CAT.depression || cat === CAT.unknown },
        geometry: { type: 'LineString', coordinates: run },
      });
    }
  };
  for (const p of points) {
    run.push([p.lon, p.lat]);
    if (p.cat !== cat) {
      flush();
      run = [[p.lon, p.lat]];
      cat = p.cat;
    }
  }
  flush();
  return out;
}

setWorkerUrl(workerUrl);

const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

const StormMap: React.FC<StormMapProps> = ({ tracks, selected, selectedPoints, onSelect, padding }) => {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const ready = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const pending = useRef<() => void>(() => {});

  useEffect(() => {
    const map = new MlMap({
      container: container.current!,
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: [-40, 22],
      zoom: 1.6,
      minZoom: 0.8,
      maxZoom: 9,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      map.addSource('tracks', { type: 'geojson', data: empty });
      map.addSource('chosen', { type: 'geojson', data: empty });
      map.addSource('chosen-points', { type: 'geojson', data: empty });
      const width = ['interpolate', ['linear'], ['zoom'], 1, 1, 6, 2.5];
      map.addLayer({
        id: 'tracks-other',
        type: 'line',
        source: 'tracks',
        filter: ['!', ['get', 'tropical']],
        paint: { 'line-color': colorExpression as never, 'line-width': width as never, 'line-opacity': 0.45, 'line-dasharray': [2, 2] },
        layout: { 'line-cap': 'butt' },
      });
      map.addLayer({
        id: 'tracks',
        type: 'line',
        source: 'tracks',
        filter: ['get', 'tropical'],
        paint: { 'line-color': colorExpression as never, 'line-width': width as never, 'line-opacity': 0.8 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      // A wide invisible line under each track, so a thin one is easy to tap
      map.addLayer({
        id: 'tracks-hit',
        type: 'line',
        source: 'tracks',
        paint: { 'line-color': '#000', 'line-width': 12, 'line-opacity': 0 },
      });
      map.addLayer({
        id: 'chosen-halo',
        type: 'line',
        source: 'chosen',
        paint: { 'line-color': '#0b0e14', 'line-width': 7, 'line-opacity': 0.9 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      map.addLayer({
        id: 'chosen',
        type: 'line',
        source: 'chosen',
        paint: { 'line-color': colorExpression as never, 'line-width': 4 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      map.addLayer({
        id: 'chosen-points',
        type: 'circle',
        source: 'chosen-points',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 2.5, 7, 5],
          'circle-color': colorExpression as never,
          'circle-stroke-color': '#0b0e14',
          'circle-stroke-width': 1,
        },
      });

      // Point details on hover (or tap) along the chosen storm
      const popup = new Popup({ closeButton: false, closeOnClick: false, className: 'point-popup', offset: 8 });
      map.on('mousemove', 'chosen-points', (e: MapMouseEvent & { features?: { properties: unknown }[] }) => {
        const p = e.features?.[0]?.properties as { t: number; wind: number; pres: number; cat: number } | undefined;
        if (!p) return;
        map.getCanvas().style.cursor = 'pointer';
        const wind = p.wind ? `${p.wind} kt · ${kt.mph(p.wind)} mph · ${kt.kmh(p.wind)} km/h` : 'wind not recorded';
        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<strong>${formatDate(p.t, true)}</strong><br>${category(p.cat).label}<br>${wind}${p.pres ? `<br>${p.pres} mb` : ''}`,
          )
          .addTo(map);
      });
      map.on('mouseleave', 'chosen-points', () => {
        map.getCanvas().style.cursor = '';
        popup.remove();
      });

      map.on('mouseenter', 'tracks-hit', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'tracks-hit', () => (map.getCanvas().style.cursor = ''));
      map.on('click', (e: MapMouseEvent) => {
        const near = map.queryRenderedFeatures(
          [
            [e.point.x - 6, e.point.y - 6],
            [e.point.x + 6, e.point.y + 6],
          ],
          { layers: ['chosen-points', 'tracks-hit'] },
        );
        if (near.some((f: { layer: { id: string } }) => f.layer.id === 'chosen-points')) return;
        onSelectRef.current((near[0]?.properties?.id as string | undefined) ?? null);
      });

      ready.current = true;
      pending.current();
    });
    return () => {
      ready.current = false;
      map.remove();
    };
  }, []);

  /**
   * How see-through the tracks are: the more storms in view, the fainter each one, so where they bunch up still
   * reads as busier rather than one solid mass; faint all over while one storm is chosen.
   */
  const fade = () => {
    const map = mapRef.current!;
    const chosen = selected && selectedPoints;
    const crowd = Math.min(1, Math.sqrt(300 / Math.max(1, tracks.length)));
    map.setPaintProperty('tracks', 'line-opacity', chosen ? 0.15 : Math.max(0.22, 0.85 * crowd));
    map.setPaintProperty('tracks-other', 'line-opacity', chosen ? 0.08 : Math.max(0.12, 0.45 * crowd));
  };

  // The storms in view
  useEffect(() => {
    const draw = () => {
      const map = mapRef.current!;
      (map.getSource('tracks') as GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: tracks.flatMap(({ storm, points }) => trackFeatures(storm, points)),
      });
      fade();
    };
    if (ready.current) draw();
    else {
      const before = pending.current;
      pending.current = () => {
        before();
        draw();
      };
    }
    // fade reads the chosen storm too; this only redraws when the tracks change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks]);

  // The chosen storm: drawn on top, the rest faded, and the map framed on it
  useEffect(() => {
    const draw = () => {
      const map = mapRef.current!;
      const chosen = selected && selectedPoints;
      (map.getSource('chosen') as GeoJSONSource).setData(
        chosen ? { type: 'FeatureCollection', features: trackFeatures(selected, selectedPoints) } : empty,
      );
      (map.getSource('chosen-points') as GeoJSONSource).setData(
        chosen
          ? {
              type: 'FeatureCollection',
              features: selectedPoints.map((p) => ({
                type: 'Feature',
                properties: { t: p.t, wind: p.wind ?? 0, pres: p.pres ?? 0, cat: p.cat },
                geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
              })),
            }
          : empty,
      );
      fade();
      if (chosen) {
        const [w, s, e, n] = selected.bbox;
        map.fitBounds(
          [
            [w, s],
            [e, n],
          ],
          {
            padding: { top: 60, right: 60, bottom: 60 + padding.bottom, left: 60 + padding.left },
            maxZoom: 6,
            duration: 900,
          },
        );
      }
    };
    if (ready.current) draw();
    else {
      const before = pending.current;
      pending.current = () => {
        before();
        draw();
      };
    }
    // Framing follows the storm, not the panel's size
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, selectedPoints]);

  return <div ref={container} className="map" />;
};

export default StormMap;
