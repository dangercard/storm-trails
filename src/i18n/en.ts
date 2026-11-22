/**
 * Everything the site says, in English: the source every other language's file follows (each must have the same
 * shape, which TypeScript checks). Text with a number in it is a function, so each language can put the number where
 * its grammar wants it and pick the right plural. "{n}"-style slots mark where markup (bold numbers) goes; see rich().
 *
 * Not here, on purpose: storm names (official names, never translated), the data citation (a citation), and the
 * column names and values in downloads (spreadsheets and GIS tools rely on them, so those stay English).
 */
import type { Term } from '../data/categories';

const LOCALE = 'en-US';

const plural = new Intl.PluralRules(LOCALE);
/** The singular or plural, by the language's own rules */
const pick = (n: number, one: string, other: string) => (plural.select(n) === 'one' ? one : other);
/** At most one decimal: 14.5, 3, 0.4 */
const upTo1 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
/** Exactly one decimal: 3.0, 2.4 */
const fixed1 = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

/** The Australian scale, used by Australia's Bureau of Meteorology, Fiji and New Zealand, above its weakest class */
const australian = [
  'Category 1 tropical cyclone',
  'Category 2 tropical cyclone',
  'Category 3 severe tropical cyclone',
  'Category 4 severe tropical cyclone',
  'Category 5 severe tropical cyclone',
];

export const en = {
  /** The BCP 47 tag dates and numbers are formatted with */
  locale: LOCALE,

  categories: {
    [-1]: { label: 'Tropical depression', short: 'TD' },
    0: { label: 'Tropical storm', short: 'TS' },
    1: { label: 'Category 1', short: '1' },
    2: { label: 'Category 2', short: '2' },
    3: { label: 'Category 3', short: '3' },
    4: { label: 'Category 4', short: '4' },
    5: { label: 'Category 5', short: '5' },
    [-2]: { label: 'Subtropical', short: 'SS' },
    [-3]: { label: 'Disturbance', short: 'DS' },
    [-4]: { label: 'Post-tropical', short: 'PT' },
    [-9]: { label: 'Strength unknown', short: '?' },
  },
  basins: {
    NA: 'North Atlantic',
    EP: 'Eastern Pacific',
    WP: 'Western Pacific',
    NI: 'North Indian',
    SI: 'South Indian',
    SP: 'South Pacific',
    SA: 'South Atlantic',
  },
  /**
   * The regional agencies' own scales, shown alongside Saffir-Simpson (see REGIONAL in src/data/categories.ts): each
   * agency's classes weakest first, in the agency's own English terms (a translation would use the terms that
   * language's weather services and press use for them)
   */
  regional: {
    agencies: {
      jma: { short: 'JMA', name: 'Japan Meteorological Agency' },
      imd: { short: 'IMD', name: 'India Meteorological Department' },
      mfr: { short: 'Météo-France', name: 'Météo-France La Réunion' },
      bom: { short: 'BoM', name: 'Australian Bureau of Meteorology' },
      fms: { short: 'FMS', name: 'Fiji Meteorological Service' },
      nz: { short: 'MetService', name: 'MetService New Zealand' },
    },
    classes: {
      jma: ['Tropical depression', 'Tropical storm', 'Severe tropical storm', 'Typhoon', 'Very strong typhoon', 'Violent typhoon'],
      imd: [
        'Depression',
        'Deep depression',
        'Cyclonic storm',
        'Severe cyclonic storm',
        'Very severe cyclonic storm',
        'Extremely severe cyclonic storm',
        'Super cyclonic storm',
      ],
      mfr: [
        'Tropical disturbance',
        'Tropical depression',
        'Moderate tropical storm',
        'Severe tropical storm',
        'Tropical cyclone',
        'Intense tropical cyclone',
        'Very intense tropical cyclone',
      ],
      bom: ['Tropical low', ...australian],
      fms: ['Tropical depression', ...australian],
      nz: ['Tropical depression', ...australian],
    },
    /** A class with its agency: "Very strong typhoon (JMA)" */
    withAgency: (name: string, agency: string) => `${name} (${agency})`,
    /** The agency's wind, with how long it's averaged over */
    wind: (kt: number, minutes: number) => `${kt} kt, ${minutes}-minute average`,
  },
  units: {
    kt: (kt: number) => `${kt} kt`,
    km: (km: number) => `${km} km`,
    mb: (mb: number) => `${mb} mb`,
    /** A wind in knots with its conversions */
    wind: (kt: number, mph: number, kmh: number) => `${kt} kt · ${mph} mph · ${kmh} km/h`,
  },
  /** Compass letters for coordinates: 25.8°N, 80.2°W */
  compass: { N: 'N', S: 'S', E: 'E', W: 'W' },
  /** After a date and time, which are always in UTC */
  utc: (dateTime: string) => `${dateTime} UTC`,
  unnamed: 'Unnamed',
  language: 'Language',
  /** MapLibre's own controls, by its ids for them (see its default_locale); fixed when the map is made */
  mapControls: {
    'Map.Title': 'Map',
    'NavigationControl.ZoomIn': 'Zoom in',
    'NavigationControl.ZoomOut': 'Zoom out',
    'AttributionControl.ToggleAttribution': 'Toggle attribution',
    'AttributionControl.MapFeedback': 'Map feedback',
  },

  app: {
    tagline: 'Every tropical cyclone on record, worldwide.',
    seasons: 'Seasons',
    presets: { thisYear: 'This year', last10: 'Last 10 years', since1980: 'Since 1980', all: 'All' },
    basins: 'Basins',
    atLeast: 'At least',
    /** The strength filter's choices, by the lowest category code each lets through */
    strengths: {
      [-9]: 'Any',
      0: 'Tropical storm+',
      1: 'Category 1+',
      3: 'Category 3+',
      5: 'Category 5',
    },
    search: 'Search by name (e.g. Maria)',
    /** "{n}" is the number, set in bold */
    storms: (n: number) => pick(n, '{n} storm', '{n} storms'),
    loadingTracks: 'loading tracks…',
    play: '▶ Play through time',
    stopPlaying: 'Stop playing',
    download: 'Download',
    stormList: 'storm list (CSV)',
    stormListTitle: 'One row per storm',
    trackPoints: 'track points (CSV)',
    trackPointsTitle: 'One row per 6-hourly report',
    tracksGeoJson: 'tracks (GeoJSON)',
    tracksGeoJsonTitle: 'Tracks as lines, for QGIS, ArcGIS or Google Earth',
    placeReport: 'Place report ↗',
    loading: 'Loading…',
    listCapped: (n: number) => `List capped at ${n} strongest with given filters; the map shows all results.`,
    about: 'About the data',
    hideAbout: 'Hide',
    /** Before the data citation, which stays as published */
    tracksFrom: (source: string) => `Tracks from ${source}:`,
    and: 'and',
    /** How the data is read, a short point each (shown as a list under "About the data") */
    method: [
      'Each track has a point every 6 hours. The newest storms may still be provisional.',
      'Wind is the strongest 1-minute wind, from US agencies where they have one. Other agencies average over 10 ' +
        'minutes, which reads lower.',
      'Colours and filters use the Saffir-Simpson scale (category 1 to 5) everywhere. Where a region’s weather ' +
        'service has its own scale, such as Japan’s or India’s, its class is shown too.',
      'How far the winds reached comes from forecasters’ estimates, which start around 2000. They are drawn the ' +
        'way the US National Hurricane Center draws its wind maps, and match NHC’s maps to within a few percent.',
      'Before satellites (around 1966), storms that stayed at sea were often missed, and many old storms have no ' +
        'wind recorded.',
    ],
    mapCredit: 'Map © OpenFreeMap, OpenMapTiles, OpenStreetMap contributors.',
    legend: 'Legend',
    other: 'other',
  },

  years: {
    to: 'to',
    first: 'First season',
    last: 'Last season',
  },

  near: {
    label: 'Passed near',
    clear: (name: string) => `Stop filtering by ${name}`,
    within: 'Within',
    placeholder: 'Country or city (e.g. Miami)',
    country: 'Country',
    noMatch: 'No country or city by that name.',
    loadingPlaces: 'Loading places…',
    pick: 'Or pick a spot on the map',
    cancelPick: 'Cancel: click the map to choose a spot',
  },

  playbar: {
    region: 'Play through time',
    play: 'Play',
    pause: 'Pause',
    /** After the date while a storm is under way and playback has slowed for it */
    slowed: '1 week/s during storms',
    speeds: 'Speed, per second',
    /** Time passing per second, by days */
    speed: { 7: '1 week/s', 30: '1 month/s', 182: '6 months/s', 730: '2 years/s' },
    date: 'Date',
    close: 'Stop playing',
  },

  storm: {
    back: 'Back to the list',
    provisional: 'provisional',
    dates: 'Dates',
    days: (days: number) => (days < 1 ? 'under a day' : `${upTo1.format(days)} ${pick(days, 'day', 'days')}`),
    peakWind: 'Peak wind',
    notRecorded: 'not recorded',
    lowestPressure: 'Lowest pressure',
    ace: 'Energy (ACE)',
    basin: 'Basin',
    overLand: 'Over land',
    landfallIn: (countries: string) => `Made landfall in ${countries}`,
    /** Countries its centre reached over land (from a neighbour) rather than from the sea */
    alsoCrossed: (countries: string) => `Also crossed ${countries}`,
    crossed: (countries: string) => `Crossed ${countries}`,
    madeLandfall: 'Made landfall',
    stayedAtSea: 'Stayed at sea',
    loadingTrack: 'Loading the track…',
    hint: 'Tap or hover the dots on the map for each report.',
    downloadTrack: 'Download this track',
    noWind: 'No wind readings for this storm.',
    chart: "Wind (kt) over the storm's life",
    chartLabel: 'Wind speed over time',
    day0: 'day 0',
    /** In the popup on a point of the chosen storm */
    windNotRecorded: 'wind not recorded',
    /** The regional agency's class at the storm's peak, on its own scale */
    regional: 'Regional class',
    regionalTitle: 'The class the region’s official agency gave it at its peak, on its own scale, and its own wind',
    windField: 'Wind field',
    /** The farthest its 34 kt (and 64 kt) winds reached from the centre, in km; 64 kt winds by the basin's term */
    windFieldText: (ts: number, strongest: number | null, term: Term) =>
      `Tropical-storm-force winds up to ${ts} km from the centre` +
      (strongest ? `; ${term === 'typhoon' ? 'typhoon' : 'hurricane'}-force up to ${strongest} km` : ''),
    noEstimate: 'no estimate',
    /** The key to the shaded wind footprint on the map */
    footprint: 'Shaded on the map: where its winds reached',
    footprint34: 'Tropical-storm-force (34 kt+)',
    footprint64: (term: Term) => `${term === 'typhoon' ? 'Typhoon' : 'Hurricane'}-force (64 kt+)`,
  },

  report: {
    actions: 'Report actions',
    back: '← Back to the map',
    downloadCsv: 'Download CSV',
    downloadGeoJson: 'Download GeoJSON',
    print: 'Print or save as PDF',
    kicker: 'Tropical cyclone history',
    title: (km: number, place: string) => `Within ${km} km of ${place}`,
    seasons: (from: number, to: number) => (from === to ? `${from} season` : `${from}–${to} seasons`),
    allBasins: 'all basins',
    /** The strength filter, as it reads in the report's scope line */
    strength: {
      [-9]: 'any strength',
      0: 'at least tropical storm strength',
      1: 'at least category 1 strength',
      3: 'at least category 3 strength',
      5: 'at least category 5 strength',
    },
    named: (q: string) => `named “${q}”`,
    preparing: 'Preparing the report…',
    summary: 'Summary',
    storms: 'Storms',
    /** Category 1+ and 3+ when nearest, in the words of the basins the storms were in (see termOf) */
    hurricanes: (term: Term): string =>
      term === 'hurricane'
        ? 'Hurricane strength (category 1+) when nearest'
        : term === 'typhoon'
          ? 'Typhoon strength (category 1+) when nearest'
          : 'Category 1+ when nearest',
    majors: (term: Term): string => (term === 'hurricane' ? 'Major hurricane (category 3+) when nearest' : 'Category 3+ when nearest'),
    mostRecent: 'Most recent',
    noneInSeasons: 'none in these seasons',
    /** How often: count storms over that many years */
    howOften: (count: number, years: number) => {
      if (!count) return 'none';
      const per = years / count;
      if (per >= 1) return `about once every ${per < 10 ? fixed1.format(per) : whole.format(per)} years`;
      return `about ${fixed1.format(count / years)} a year`;
    },
    /** After the most recent storm's date */
    yearsAgo: (n: number) => (n <= 0 ? '' : n === 1 ? ' · last year' : ` · ${n} years ago`),
    satellite: (year: number) =>
      `Records before about ${year}, when satellites began watching every ocean, miss storms that stayed at sea and ` +
      'often have no wind reading, so the early decades undercount and the rates above are low.',
    map: 'Tracks, coloured by strength',
    mapLabel: (n: number, place: string) => `Map of ${n} storm tracks near ${place}`,
    legend: 'Legend',
    byMonth: 'When in the year (month of closest approach)',
    byDecade: 'Storms per decade',
    decade: (d: number) => `${d}s`,
    /** The tooltip on a column: "{n}" is the count, set in bold */
    columnTip: (n: number, label: string) => `${pick(n, '{n} storm', '{n} storms')} · ${label}`,
    everyStorm: 'Every storm',
    everyStormTitle: 'Every storm, most recent first',
    table: {
      storm: 'Storm',
      closest: 'Closest',
      distance: 'Distance',
      strengthThen: 'Strength then',
      windThen: 'Wind then',
      peak: 'Peak',
      landfall: 'Landfall in',
      /** After the landfall countries, those it reached over land */
      alsoCrossed: (countries: string) => `also crossed ${countries}`,
    },
    overLand: 'over land',
    yes: 'yes',
    noStorms: (km: number) => `No storms passed within ${km} km in these seasons.`,
    /** Under the table, when it lists storms that only came near by their winds */
    alsoListed: (km: number) =>
      `Also listed: storms whose centre stayed farther than ${km} km away but whose winds reached here.`,
    winds: {
      title: (place: string) => `Winds that reached ${place}`,
      /** The seasons the wind counts cover */
      scope: (from: number, to: number) =>
        `${from === to ? `${from} season` : `${from}–${to} seasons`}: the years with estimates of how far storms’ winds reached`,
      noData:
        'Estimates of how far storms’ winds reached exist only from about 2000, and are complete from 2004 in most ' +
        'basins. Choose seasons from 2004 on to see how often they reached here.',
      hurricane: (term: Term) => `${term === 'typhoon' ? 'Typhoon' : 'Hurricane'}-force winds (64 kt+)`,
      kt50: 'Winds of 50 kt or more',
      tropical: 'Tropical-storm-force winds (34 kt+)',
      unknown: (n: number) =>
        `${n} ${pick(n, 'storm', 'storms')} in these seasons came near enough but had no estimate of how far ` +
        `${pick(n, 'its', 'their')} winds reached, so these may count too few.`,
      /** The table column, and its cells by the strongest winds that reached */
      column: 'Winds reached here',
      cell: { 64: '64 kt+', 50: '50 kt+', 34: '34 kt+', 0: 'none' },
      noEstimate: 'no estimate',
    },
    howTitle: 'How this is worked out',
    /** How the report is worked out, a short point each */
    how: (km: number, country: boolean) => [
      `A storm counts if its centre passed within ${km} km of ` +
        `${country ? 'the country’s land (today’s borders)' : 'the place'}, at any point along its track.`,
      '“When nearest” is the storm’s strength and wind at its closest point.',
      'Wind is the strongest 1-minute wind, from US agencies where they have one. Other agencies average over 10 ' +
        'minutes, which reads lower.',
      'Strength is the Saffir-Simpson category. Where a region has its own scale, its class is shown underneath.',
      ...(country ? ['Distances to a country are accurate to about 10 km.'] : []),
    ],
    windsHowTitle: 'How far the winds reached',
    windsHow: (km: number, country: boolean) => [
      'Forecasters estimate how far 34, 50 and 64 kt winds reach from the centre, in each direction.',
      'These areas are drawn the way the US National Hurricane Center draws its wind maps, and match NHC’s maps to ' +
        'within a few percent.',
      'The estimates are the farthest those winds reached. “Reached here” means ' +
        `${country ? 'some of the country’s land' : 'this place'} was inside that area, not that every spot felt them.`,
      'Estimates start around 2000 and are complete from 2004 in most basins. Older storms show “no estimate”.',
      `Storms whose winds reached here are listed even if their centre stayed more than ${km} km away.`,
    ],
    data: (citation: string) => `Data: ${citation} Country shapes and places: Natural Earth.`,
    made: (date: string, from: string) => `Made ${date} from ${from}`,
  },
};

export type Messages = typeof en;
