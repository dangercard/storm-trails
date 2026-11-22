import { useEffect, useRef } from 'react';
import {
  type ExpressionSpecification,
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
import { CAT, categoryLabel, colorExpression, kt, regional } from '../data/categories';
import { displayName, formatDate, loadCountries, type Storm, type TrackPoint } from '../data/storms';
import { i18n } from '../i18n';

/** What the map offers beyond its props, once it has loaded */
export interface MapApi {
  /**
   * Plays the storms in view to time t (hours since 1970): those under way drawn to where they are, with a head
   * and their name; those over left as faint tracks; those to come hidden. null stops playing and shows them all.
   */
  setTime: (t: number | null) => void;
}

interface StormMapProps {
  /**
   * Every storm whose track has loaded, filtered or not: handed to the map only when a decade loads, so changing a
   * filter just hides and shows tracks rather than resending them all
   */
  all: { storm: Storm; points: TrackPoint[] }[];
  /** The storms in view (a subset of all), with their tracks */
  tracks: { storm: Storm; points: TrackPoint[] }[];
  selected: Storm | null;
  selectedPoints: TrackPoint[] | null;
  /** The chosen storm's wind footprint ({ kt: 34 } and { kt: 64 } areas), or null */
  footprint: GeoJSON.FeatureCollection | null;
  onSelect: (id: string | null) => void;
  /** Space the side panel covers, so a chosen storm is framed in the part of the map that shows */
  padding: { left: number; bottom: number };
  /** The "Near" filter's country, or circle round a point, to outline; null when it's off */
  near: GeoJSON.FeatureCollection | null;
  /** While true, a click on the map picks a spot (for "Near") rather than a storm */
  picking: boolean;
  onPick: (lat: number, lon: number) => void;
  apiRef: React.RefObject<MapApi | null>;
}

type Feature = GeoJSON.Feature<GeoJSON.MultiLineString, { id: string; cat: number; tropical: boolean }>;

/**
 * A track as lines: each stretch at one strength is a line (each segment takes the colour of the point it starts
 * from), and a storm's stretches at the same strength are one feature, so all the storms on record come to about
 * 36,000 features rather than 58,000, less to hand the map's worker on every change.
 */
function trackFeatures(storm: Storm, points: TrackPoint[]): Feature[] {
  const byCat = new Map<number, [number, number][][]>();
  let run: [number, number][] = [];
  let cat = points[0]?.cat;
  const flush = () => {
    if (run.length < 2) return;
    const lines = byCat.get(cat);
    if (lines) lines.push(run);
    else byCat.set(cat, [run]);
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
  return [...byCat].map(([cat, lines]) => ({
    type: 'Feature',
    properties: { id: storm.id, cat, tropical: cat >= CAT.depression || cat === CAT.unknown },
    geometry: { type: 'MultiLineString', coordinates: lines },
  }));
}

/** A whole track's features, built once per track (unpacked tracks are shared, so they key the cache) */
const built = new WeakMap<TrackPoint[], Feature[]>();
function featuresOf(storm: Storm, points: TrackPoint[]): Feature[] {
  let f = built.get(points);
  if (!f) {
    f = trackFeatures(storm, points);
    built.set(points, f);
  }
  return f;
}

setWorkerUrl(workerUrl);

const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * The basemap's place, country and sea names in the language showing, where the tiles have them (OpenMapTiles'
 * name:xx, from OpenStreetMap), else as they were (English or Latin script, with the local script alongside).
 * Runs before the site's own layers are added, so only the basemap's labels are touched.
 */
function localizeLabels(map: MlMap, lang: string) {
  if (lang === 'en') return;
  for (const layer of map.getStyle().layers) {
    if (layer.type !== 'symbol') continue;
    const field = map.getLayoutProperty(layer.id, 'text-field');
    if (!field || !JSON.stringify(field).includes('"name')) continue;
    map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', `name:${lang}`], field] as ExpressionSpecification);
  }
}

/**
 * The dark basemap draws water a shade lighter than land, so the two run together: make water near-black with a
 * hint of blue and lift the land to a slate grey, keeping it dark so the tracks stay the brightest thing on the map.
 */
const LAND = '#1c212b';
const WATER = '#07090e';
function recolorBasemap(map: MlMap) {
  const set = (layer: string, prop: string, value: unknown) => {
    if (map.getLayer(layer)) map.setPaintProperty(layer, prop as never, value as never);
  };
  set('background', 'background-color', LAND);
  set('water', 'fill-color', WATER);
  set('waterway', 'line-color', WATER);
  set('landcover_ice_shelf', 'fill-color', LAND);
  set('landcover_glacier', 'fill-color', LAND);
  set('road_area_pier', 'fill-color', LAND);
  set('road_pier', 'line-color', LAND);
  set('boundary_country_z0-4', 'line-color', '#3a4352');
  set('boundary_country_z5-', 'line-color', '#3a4352');
  set('boundary_state', 'line-color', '#2c3340');
}

/** The chosen storm's landfall countries, lit up */
const LANDFALL_FILL = '#5b7290';
const LANDFALL_EDGE = '#9fb4cf';
/** The "Near" filter's outline */
const NEAR = '#e8eef7';
/** The chosen storm's wind footprint: tropical-storm-force and hurricane-force, the colours of those categories */
const FOOTPRINT = ['match', ['get', 'kt'], 64, '#ffc140', '#00faf4'];

/**
 * Hides a track the filters leave out (feature state `off`) or, while playing, whose storm hasn't formed yet
 * (`hide`); both keyed by storm id
 */
const unlessHidden = (opacity: number) => [
  'case',
  ['any', ['boolean', ['feature-state', 'off'], false], ['boolean', ['feature-state', 'hide'], false]],
  0,
  opacity,
];

/** Whether a track feature on the map is showing (neither filtered out nor still to come while playing) */
const isShowing = (map: MlMap, id: string | number | undefined) => {
  if (id === undefined) return false;
  const s = map.getFeatureState({ source: 'tracks', id });
  return !s.off && !s.hide;
};

/** [west, south, east, north] of a collection, across the date line when that's tighter */
function bboxOf(fc: GeoJSON.FeatureCollection): [number, number, number, number] | null {
  const xs: number[] = [];
  const ys: number[] = [];
  const walk = (c: unknown): void => {
    if (typeof (c as number[])[0] === 'number') {
      xs.push((c as number[])[0]);
      ys.push((c as number[])[1]);
    } else (c as unknown[]).forEach(walk);
  };
  for (const f of fc.features) if ('coordinates' in f.geometry) walk(f.geometry.coordinates);
  if (!xs.length) return null;
  let w = Math.min(...xs);
  let e = Math.max(...xs);
  if (e - w > 180) {
    const shifted = xs.map((x) => (x < 0 ? x + 360 : x));
    w = Math.min(...shifted);
    e = Math.max(...shifted);
  }
  return [w, Math.min(...ys), e, Math.max(...ys)];
}

/** Where a storm is at time t, between its reports */
function positionAt(points: TrackPoint[], t: number): { upTo: TrackPoint[]; head: TrackPoint } {
  let i = 0;
  while (i + 1 < points.length && points[i + 1].t <= t) i++;
  const a = points[i];
  const b = points[i + 1];
  if (!b || a.t >= t) return { upTo: points.slice(0, i + 1), head: a };
  const f = (t - a.t) / (b.t - a.t);
  const head = { ...a, t, lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f };
  return { upTo: [...points.slice(0, i + 1), head], head };
}

const StormMap: React.FC<StormMapProps> = ({
  all,
  tracks,
  selected,
  selectedPoints,
  footprint,
  onSelect,
  padding,
  near,
  picking,
  onPick,
  apiRef,
}) => {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const ready = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const pickingRef = useRef(picking);
  pickingRef.current = picking;
  /** The latest props, for the playback calls that come from outside a render */
  const latest = useRef({ all, tracks, chosen: Boolean(selected && selectedPoints), padding });
  latest.current = { all, tracks, chosen: Boolean(selected && selectedPoints), padding };
  /** The ids of the storms on the map that the filters leave out (feature state `off`) */
  const off = useRef(new Set<string>());
  /** While playing: the time shown, the storms in view by when they end, and how many have ended */
  const play = useRef<{ t: number; byEnd: { id: string; end: number }[]; done: number } | null>(null);
  const pending = useRef<() => void>(() => {});
  const landfallLoaded = useRef(false);

  useEffect(() => {
    const map = new MlMap({
      container: container.current!,
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: [-40, 22],
      zoom: 1.6,
      minZoom: 0.8,
      maxZoom: 9,
      attributionControl: { compact: true },
      // Its controls' labels, in the language showing (App makes a new map when the language changes)
      locale: i18n().m.mapControls,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      recolorBasemap(map);
      localizeLabels(map, i18n().lang);
      // Under the place names, so they stay readable over a lit-up country
      const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
      map.addSource('landfall', { type: 'geojson', data: empty });
      map.addLayer(
        {
          id: 'landfall-fill',
          type: 'fill',
          source: 'landfall',
          filter: ['in', ['get', 'name'], ['literal', []]],
          paint: { 'fill-color': LANDFALL_FILL, 'fill-opacity': 0.35 },
        },
        firstLabel,
      );
      map.addLayer(
        {
          id: 'landfall-edge',
          type: 'line',
          source: 'landfall',
          filter: ['in', ['get', 'name'], ['literal', []]],
          paint: { 'line-color': LANDFALL_EDGE, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.6, 6, 1.4], 'line-opacity': 0.8 },
        },
        firstLabel,
      );
      map.addSource('near', { type: 'geojson', data: empty });
      map.addLayer(
        {
          id: 'near-fill',
          type: 'fill',
          source: 'near',
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint: { 'fill-color': NEAR, 'fill-opacity': 0.07 },
        },
        firstLabel,
      );
      map.addLayer(
        {
          id: 'near-edge',
          type: 'line',
          source: 'near',
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint: { 'line-color': NEAR, 'line-width': 1.4, 'line-opacity': 0.75, 'line-dasharray': [3, 2] },
        },
        firstLabel,
      );
      map.addLayer(
        {
          id: 'near-dot',
          type: 'circle',
          source: 'near',
          filter: ['==', ['geometry-type'], 'Point'],
          paint: { 'circle-radius': 4, 'circle-color': NEAR, 'circle-stroke-color': '#0b0e14', 'circle-stroke-width': 1.5 },
        },
        firstLabel,
      );
      // The chosen storm's wind footprint, under every track (so none is hidden) and over the land
      map.addSource('footprint', { type: 'geojson', data: empty });
      map.addLayer(
        {
          id: 'footprint-fill',
          type: 'fill',
          source: 'footprint',
          paint: { 'fill-color': FOOTPRINT as never, 'fill-opacity': ['match', ['get', 'kt'], 64, 0.2, 0.1] },
        },
        firstLabel,
      );
      map.addLayer(
        {
          id: 'footprint-edge',
          type: 'line',
          source: 'footprint',
          paint: { 'line-color': FOOTPRINT as never, 'line-width': 1, 'line-opacity': 0.55 },
        },
        firstLabel,
      );

      // Tracks keyed by storm id, so playing can hide each one (feature state) without redrawing them all
      map.addSource('tracks', { type: 'geojson', data: empty, promoteId: 'id' });
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
      // Playing: the storms under way, each its track so far and a head where it is now
      map.addSource('live', { type: 'geojson', data: empty });
      map.addSource('live-heads', { type: 'geojson', data: empty });
      map.addLayer({
        id: 'live',
        type: 'line',
        source: 'live',
        paint: { 'line-color': colorExpression as never, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 2, 6, 3.5] },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      map.addLayer({
        id: 'live-glow',
        type: 'circle',
        source: 'live-heads',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'cat'], -1, 9, 5, 18],
          'circle-color': colorExpression as never,
          'circle-opacity': 0.25,
          'circle-blur': 0.8,
        },
      });
      map.addLayer({
        id: 'live-heads',
        type: 'circle',
        source: 'live-heads',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'cat'], -1, 3.5, 5, 6.5],
          'circle-color': colorExpression as never,
          'circle-stroke-color': '#0b0e14',
          'circle-stroke-width': 1.5,
        },
      });
      map.addLayer({
        id: 'live-labels',
        type: 'symbol',
        source: 'live-heads',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
          'text-anchor': 'left',
          'text-offset': [0.9, 0],
          'text-optional': true,
        },
        paint: { 'text-color': '#dfe5ee', 'text-halo-color': '#0b0e14', 'text-halo-width': 1.5 },
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

      // The "Near" outline over the tracks (its fill stays under them), below the storms playing and the chosen one
      map.moveLayer('near-edge', 'live');
      map.moveLayer('near-dot', 'live');

      // Point details on hover (or tap) along the chosen storm
      const popup = new Popup({ closeButton: false, closeOnClick: false, className: 'point-popup', offset: 8 });
      map.on('mousemove', 'chosen-points', (e: MapMouseEvent & { features?: { properties: unknown }[] }) => {
        const p = e.features?.[0]?.properties as
          | { t: number; wind: number; pres: number; cat: number; regional: number; regionalWind: number }
          | undefined;
        if (!p) return;
        map.getCanvas().style.cursor = 'pointer';
        const { m } = i18n();
        const wind = p.wind ? m.units.wind(p.wind, kt.mph(p.wind), kt.kmh(p.wind)) : m.storm.windNotRecorded;
        // The regional agency's class and wind, where it has its own scale
        const r = regional(p.regional);
        const local = r
          ? `<br><span class="regional-note">${m.regional.withAgency(r.name, r.agency.short)}` +
            (p.regionalWind ? ` · ${m.regional.wind(p.regionalWind, r.minutes)}` : '') +
            '</span>'
          : '';
        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<strong>${formatDate(p.t, true)}</strong><br>${categoryLabel(p.cat)}<br>${wind}${p.pres ? `<br>${m.units.mb(p.pres)}` : ''}${local}`,
          )
          .addTo(map);
      });
      map.on('mouseleave', 'chosen-points', () => {
        map.getCanvas().style.cursor = '';
        popup.remove();
      });

      map.on('mouseenter', 'live-heads', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'live-heads', () => (map.getCanvas().style.cursor = ''));
      // Hidden tracks are still on the map (at no opacity): only the ones showing take the pointer
      map.on('mousemove', 'tracks-hit', (e: MapMouseEvent & { features?: { id?: string | number }[] }) => {
        map.getCanvas().style.cursor = e.features?.some((f) => isShowing(map, f.id)) ? 'pointer' : '';
      });
      map.on('mouseleave', 'tracks-hit', () => (map.getCanvas().style.cursor = ''));
      map.on('click', (e: MapMouseEvent) => {
        if (pickingRef.current) {
          onPickRef.current(e.lngLat.lat, e.lngLat.wrap().lng);
          return;
        }
        const hits = map
          .queryRenderedFeatures(
            [
              [e.point.x - 6, e.point.y - 6],
              [e.point.x + 6, e.point.y + 6],
            ],
            { layers: ['chosen-points', 'live-heads', 'tracks-hit'] },
          )
          // Not the tracks filtered out, or of storms still to come while playing
          .filter((f) => f.layer.id !== 'tracks-hit' || isShowing(map, f.id));
        if (hits.some((f) => f.layer.id === 'chosen-points')) return;
        onSelectRef.current((hits[0]?.properties?.id as string | undefined) ?? null);
      });

      apiRef.current = { setTime };

      ready.current = true;
      pending.current();
    });
    return () => {
      ready.current = false;
      apiRef.current = null;
      map.remove();
    };
    // Once: setTime reads everything it needs from refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * How see-through the tracks are: the more storms in view, the fainter each one, so where they bunch up still
   * reads as busier rather than one solid mass; faint all over while one storm is chosen.
   */
  const fade = () => {
    const map = mapRef.current!;
    const { tracks, chosen } = latest.current;
    const crowd = Math.min(1, Math.sqrt(300 / Math.max(1, tracks.length)));
    // Fainter still while playing, so the storms under way stand out
    const k = play.current ? 0.55 : 1;
    map.setPaintProperty('tracks', 'line-opacity', unlessHidden(chosen ? 0.15 : k * Math.max(0.22, 0.85 * crowd)) as never);
    map.setPaintProperty('tracks-other', 'line-opacity', unlessHidden(chosen ? 0.08 : k * Math.max(0.12, 0.45 * crowd)) as never);
  };

  /**
   * Hides the tracks of the storms the filters leave out, and shows the rest, changing only those that differ from
   * last time: a filter change costs a feature state per storm that came or went, with nothing sent to the worker
   */
  const applyShown = () => {
    const map = mapRef.current!;
    const { all, tracks } = latest.current;
    const shown = new Set(tracks.map(({ storm }) => storm.id));
    const before = off.current;
    const now = new Set<string>();
    for (const { storm } of all) if (!shown.has(storm.id)) now.add(storm.id);
    for (const id of now) if (!before.has(id)) map.setFeatureState({ source: 'tracks', id }, { off: true });
    for (const id of before) if (!now.has(id)) map.setFeatureState({ source: 'tracks', id }, { off: false });
    off.current = now;
  };

  /** Shows again the tracks playing has hidden (exactly those past `done` in its list) */
  const unhidePlayed = () => {
    const map = mapRef.current!;
    const p = play.current;
    if (!p) return;
    for (let i = p.done; i < p.byEnd.length; i++) map.setFeatureState({ source: 'tracks', id: p.byEnd[i].id }, { hide: false });
  };

  /** Hides every track whose storm hasn't ended by t, from scratch (on starting, or when the storms in view change) */
  const startPlaying = (t: number) => {
    const map = mapRef.current!;
    unhidePlayed();
    const byEnd = latest.current.tracks.map(({ storm }) => ({ id: storm.id, end: storm.end })).sort((a, b) => a.end - b.end);
    let done = 0;
    for (const { id, end } of byEnd) {
      if (end <= t) done++;
      else map.setFeatureState({ source: 'tracks', id }, { hide: true });
    }
    play.current = { t, byEnd, done };
    fade();
  };

  function setTime(t: number | null) {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    if (t === null) {
      if (!play.current) return;
      unhidePlayed();
      play.current = null;
      (map.getSource('live') as GeoJSONSource).setData(empty);
      (map.getSource('live-heads') as GeoJSONSource).setData(empty);
      fade();
      return;
    }
    if (!play.current) startPlaying(t);
    const p = play.current!;
    // Show the tracks of storms that ended since the last time shown, or hide them again going back
    let done = p.done;
    while (done < p.byEnd.length && p.byEnd[done].end <= t) {
      map.setFeatureState({ source: 'tracks', id: p.byEnd[done].id }, { hide: false });
      done++;
    }
    while (done > 0 && p.byEnd[done - 1].end > t) {
      done--;
      map.setFeatureState({ source: 'tracks', id: p.byEnd[done].id }, { hide: true });
    }
    p.done = done;
    p.t = t;

    const lines: Feature[] = [];
    const heads: GeoJSON.Feature[] = [];
    for (const { storm, points } of latest.current.tracks) {
      if (storm.start > t || storm.end < t || !points.length) continue;
      const { upTo, head } = positionAt(points, t);
      lines.push(...trackFeatures(storm, upTo));
      heads.push({
        type: 'Feature',
        properties: { id: storm.id, cat: head.cat, name: storm.name ? displayName(storm) : '' },
        geometry: { type: 'Point', coordinates: [head.lon, head.lat] },
      });
    }
    (map.getSource('live') as GeoJSONSource).setData({ type: 'FeatureCollection', features: lines });
    (map.getSource('live-heads') as GeoJSONSource).setData({ type: 'FeatureCollection', features: heads });
  }

  // Every loaded track, sent to the map's worker only when a decade loads (feature state outlives setData, so the
  // ones hidden stay hidden; the newly loaded ones are sorted out by applyShown)
  useEffect(() => {
    const draw = () => {
      (mapRef.current!.getSource('tracks') as GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: all.flatMap(({ storm, points }) => featuresOf(storm, points)),
      });
      applyShown();
    };
    if (ready.current) draw();
    else {
      const before = pending.current;
      pending.current = () => {
        before();
        draw();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all]);

  // The storms in view: shown, the rest hidden
  useEffect(() => {
    const draw = () => {
      applyShown();
      if (play.current) {
        const { t } = play.current;
        startPlaying(t);
        setTime(t);
      }
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
                properties: {
                  t: p.t,
                  wind: p.wind ?? 0,
                  pres: p.pres ?? 0,
                  cat: p.cat,
                  regional: p.regional,
                  regionalWind: p.regionalWind ?? 0,
                },
                geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
              })),
            }
          : empty,
      );
      fade();
      // The countries it made landfall in, and those it crossed over land
      const hit = chosen ? [...(selected.landfalls ?? []), ...(selected.crossed ?? [])] : [];
      const filter = ['in', ['get', 'name'], ['literal', hit]] as never;
      map.setFilter('landfall-fill', filter);
      map.setFilter('landfall-edge', filter);
      if (hit.length) {
        loadCountries().then((shapes) => {
          const source = map.getSource('landfall') as GeoJSONSource | undefined;
          // Set once: the filter picks the chosen storm's countries from all of them
          if (source && !landfallLoaded.current) {
            landfallLoaded.current = true;
            source.setData(shapes);
          }
        });
      }
      if (chosen) {
        // The track's extent (its longitudes run on past ±180°, so a storm across the date line stays in one piece)
        let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
        for (const p of selectedPoints) {
          w = Math.min(w, p.lon);
          e = Math.max(e, p.lon);
          s = Math.min(s, p.lat);
          n = Math.max(n, p.lat);
        }
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

  // The chosen storm's wind footprint
  useEffect(() => {
    const draw = () => (mapRef.current!.getSource('footprint') as GeoJSONSource).setData(footprint ?? empty);
    if (ready.current) draw();
    else {
      const before = pending.current;
      pending.current = () => {
        before();
        draw();
      };
    }
  }, [footprint]);

  // The "Near" outline, and the map framed on it
  useEffect(() => {
    const draw = () => {
      const map = mapRef.current!;
      (map.getSource('near') as GeoJSONSource).setData(near ?? empty);
      const box = near && bboxOf(near);
      if (box && !latest.current.chosen) {
        const pad = latest.current.padding;
        map.fitBounds(
          [
            [box[0], box[1]],
            [box[2], box[3]],
          ],
          { padding: { top: 60, right: 60, bottom: 60 + pad.bottom, left: 60 + pad.left }, maxZoom: 6, duration: 900 },
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
  }, [near]);

  return <div ref={container} className={`map${picking ? ' picking' : ''}`} />;
};

export default StormMap;
