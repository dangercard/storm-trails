/**
 * Everything the site says, in Spanish: the same shape as en.ts (TypeScript checks it), in Latin American Spanish
 * (es-419: most of the Spanish speakers hurricanes reach), addressing the reader as "tú".
 *
 * DRAFT, not yet reviewed by native speakers: it isn't offered in the language picker (VITE_LANGUAGES) until it is,
 * and opens only with ?lang=es. See REVIEW.md in this folder for what reviewers should check.
 *
 * Storm terms follow the Spanish the weather services use: NHC's Spanish products and Mexico's and Cuba's services
 * (huracán, tormenta tropical, depresión tropical, tocar tierra); the regional agencies' classes follow how the
 * Spanish-language press and Wikipedia render them.
 */
import type { Term } from '../data/categories';
import type { Messages } from './en';

const LOCALE = 'es-419';

const plural = new Intl.PluralRules(LOCALE);
/** The singular or plural, by the language's own rules */
const pick = (n: number, one: string, other: string) => (plural.select(n) === 'one' ? one : other);
/** At most one decimal: 14.5, 3, 0.4 */
const upTo1 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
/** Exactly one decimal: 3.0, 2.4 */
const fixed1 = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

/** "huracán" or "tifón", for 64 kt winds and storms, by the basin's term */
const storm64 = (term: Term) => (term === 'typhoon' ? 'tifón' : 'huracán');

/** The Australian scale, used by Australia's Bureau of Meteorology, Fiji and New Zealand, above its weakest class */
const australian = [
  'Ciclón tropical de categoría 1',
  'Ciclón tropical de categoría 2',
  'Ciclón tropical severo de categoría 3',
  'Ciclón tropical severo de categoría 4',
  'Ciclón tropical severo de categoría 5',
];

export const es: Messages = {
  locale: LOCALE,

  categories: {
    [-1]: { label: 'Depresión tropical', short: 'DT' },
    0: { label: 'Tormenta tropical', short: 'TT' },
    1: { label: 'Categoría 1', short: '1' },
    2: { label: 'Categoría 2', short: '2' },
    3: { label: 'Categoría 3', short: '3' },
    4: { label: 'Categoría 4', short: '4' },
    5: { label: 'Categoría 5', short: '5' },
    [-2]: { label: 'Subtropical', short: 'ST' },
    [-3]: { label: 'Perturbación', short: 'PE' },
    [-4]: { label: 'Postropical', short: 'PT' },
    [-9]: { label: 'Intensidad desconocida', short: '?' },
  },
  basins: {
    NA: 'Atlántico Norte',
    EP: 'Pacífico Oriental',
    WP: 'Pacífico Occidental',
    NI: 'Índico Norte',
    SI: 'Índico Sur',
    SP: 'Pacífico Sur',
    SA: 'Atlántico Sur',
  },
  regional: {
    agencies: {
      jma: { short: 'JMA', name: 'Agencia Meteorológica de Japón' },
      imd: { short: 'IMD', name: 'Departamento Meteorológico de la India' },
      mfr: { short: 'Météo-France', name: 'Météo-France La Reunión' },
      bom: { short: 'BoM', name: 'Oficina de Meteorología de Australia' },
      fms: { short: 'FMS', name: 'Servicio Meteorológico de Fiyi' },
      nz: { short: 'MetService', name: 'MetService de Nueva Zelanda' },
    },
    classes: {
      jma: ['Depresión tropical', 'Tormenta tropical', 'Tormenta tropical severa', 'Tifón', 'Tifón muy fuerte', 'Tifón violento'],
      imd: [
        'Depresión',
        'Depresión profunda',
        'Tormenta ciclónica',
        'Tormenta ciclónica severa',
        'Tormenta ciclónica muy severa',
        'Tormenta ciclónica extremadamente severa',
        'Supertormenta ciclónica',
      ],
      mfr: [
        'Perturbación tropical',
        'Depresión tropical',
        'Tormenta tropical moderada',
        'Tormenta tropical severa',
        'Ciclón tropical',
        'Ciclón tropical intenso',
        'Ciclón tropical muy intenso',
      ],
      bom: ['Baja tropical', ...australian],
      fms: ['Depresión tropical', ...australian],
      nz: ['Depresión tropical', ...australian],
    },
    withAgency: (name: string, agency: string) => `${name} (${agency})`,
    wind: (kt: number, minutes: number) => `${kt} kt, promedio de ${minutes} minutos`,
  },
  units: {
    kt: (kt: number) => `${kt} kt`,
    km: (km: number) => `${km} km`,
    mb: (mb: number) => `${mb} mb`,
    wind: (kt: number, mph: number, kmh: number) => `${kt} kt · ${mph} mph · ${kmh} km/h`,
  },
  compass: { N: 'N', S: 'S', E: 'E', W: 'O' },
  utc: (dateTime: string) => `${dateTime} UTC`,
  unnamed: 'Sin nombre',
  language: 'Idioma',
  mapControls: {
    'Map.Title': 'Mapa',
    'NavigationControl.ZoomIn': 'Acercar',
    'NavigationControl.ZoomOut': 'Alejar',
    'AttributionControl.ToggleAttribution': 'Mostrar u ocultar la atribución',
    'AttributionControl.MapFeedback': 'Comentarios sobre el mapa',
  },

  app: {
    tagline: 'Todos los ciclones tropicales registrados, en todo el mundo.',
    seasons: 'Temporadas',
    presets: { thisYear: 'Este año', last10: 'Últimos 10 años', since1980: 'Desde 1980', all: 'Todas' },
    basins: 'Cuencas',
    atLeast: 'Como mínimo',
    strengths: {
      [-9]: 'Cualquiera',
      0: 'Tormenta tropical+',
      1: 'Categoría 1+',
      3: 'Categoría 3+',
      5: 'Categoría 5',
    },
    search: 'Buscar por nombre (p. ej., Otis)',
    storms: (n: number) => pick(n, '{n} tormenta', '{n} tormentas'),
    loadingTracks: 'cargando trayectorias…',
    play: '▶ Reproducir en el tiempo',
    stopPlaying: 'Detener la reproducción',
    download: 'Descargar',
    stormList: 'lista de tormentas (CSV)',
    stormListTitle: 'Una fila por tormenta',
    trackPoints: 'puntos de trayectoria (CSV)',
    trackPointsTitle: 'Una fila por reporte, cada 6 horas',
    tracksGeoJson: 'trayectorias (GeoJSON)',
    tracksGeoJsonTitle: 'Trayectorias como líneas, para QGIS, ArcGIS o Google Earth',
    placeReport: 'Informe del lugar ↗',
    loading: 'Cargando…',
    listCapped: (n: number) => `Se listan las ${n} más intensas; el mapa las muestra todas.`,
    about: 'Sobre los datos',
    hideAbout: 'Ocultar',
    tracksFrom: (source: string) => `Trayectorias de ${source}:`,
    and: 'y',
    method: [
      'Cada trayectoria tiene un punto cada 6 horas. Las tormentas más recientes pueden ser aún provisionales.',
      'El viento es el viento máximo de 1 minuto, de las agencias de EE. UU. cuando lo tienen. Otras agencias ' +
        'promedian 10 minutos, lo que da valores más bajos.',
      'Los colores y los filtros usan la escala Saffir-Simpson (categoría 1 a 5) en todo el sitio. Donde el servicio ' +
        'meteorológico de una región tiene su propia escala, como la de Japón o la de la India, también se muestra su clase.',
      'Hasta dónde llegaron los vientos viene de estimaciones de los pronosticadores, que empiezan alrededor del 2000. ' +
        'Se dibujan como dibuja sus mapas de viento el Centro Nacional de Huracanes de EE. UU., y coinciden con ellos ' +
        'con un margen de pocos puntos porcentuales.',
      'Las temperaturas del mar bajo las tormentas vienen del registro satelital diario de la NOAA, desde 1981, y ' +
        'muestran el agua un día antes de que llegara cada tormenta.',
      'El oleaje alto (olas de 12 pies, 3.7 m, o más) son estimaciones de los pronosticadores de EE. UU., para el ' +
        'Atlántico y el Pacífico Oriental desde alrededor del 2004.',
      'Antes de los satélites (alrededor de 1966), a menudo no se registraban las tormentas que se quedaban en el mar, ' +
        'y muchas tormentas antiguas no tienen datos de viento.',
    ],
    mapCredit: 'Mapa © OpenFreeMap, OpenMapTiles, colaboradores de OpenStreetMap.',
    legend: 'Leyenda',
    other: 'otras',
  },

  years: {
    to: 'a',
    first: 'Primera temporada',
    last: 'Última temporada',
  },

  near: {
    label: 'Pasó cerca de',
    clear: (name: string) => `Dejar de filtrar por ${name}`,
    within: 'A menos de',
    placeholder: 'País o ciudad (p. ej., Miami)',
    country: 'País',
    noMatch: 'No hay ningún país ni ciudad con ese nombre.',
    loadingPlaces: 'Cargando lugares…',
    pick: 'O elige un punto en el mapa',
    cancelPick: 'Cancelar: haz clic en el mapa para elegir un punto',
  },

  playbar: {
    region: 'Reproducir en el tiempo',
    play: 'Reproducir',
    pause: 'Pausar',
    slowed: '1 semana/s durante tormentas',
    speeds: 'Velocidad, por segundo',
    speed: { 7: '1 semana/s', 30: '1 mes/s', 182: '6 meses/s', 730: '2 años/s' },
    date: 'Fecha',
    close: 'Dejar de reproducir',
  },

  storm: {
    back: 'Volver a la lista',
    provisional: 'provisional',
    dates: 'Fechas',
    days: (days: number) => (days < 1 ? 'menos de un día' : `${upTo1.format(days)} ${pick(days, 'día', 'días')}`),
    peakWind: 'Viento máximo',
    notRecorded: 'sin registro',
    lowestPressure: 'Presión mínima',
    ace: 'Energía (ACE)',
    basin: 'Cuenca',
    overLand: 'Sobre tierra',
    landfallIn: (countries: string) => `Tocó tierra en ${countries}`,
    alsoCrossed: (countries: string) => `También atravesó ${countries}`,
    crossed: (countries: string) => `Atravesó ${countries}`,
    madeLandfall: 'Tocó tierra',
    stayedAtSea: 'Se mantuvo en el mar',
    loadingTrack: 'Cargando la trayectoria…',
    hint: 'Toca o pasa el cursor sobre los puntos del mapa para ver cada reporte.',
    downloadTrack: 'Descargar esta trayectoria',
    noWind: 'No hay datos de viento para esta tormenta.',
    chart: 'Viento (kt) a lo largo de la vida de la tormenta',
    chartLabel: 'Velocidad del viento en el tiempo',
    day0: 'día 0',
    windNotRecorded: 'viento sin registro',
    regional: 'Clase regional',
    regionalTitle: 'La clase que le dio la agencia oficial de la región en su punto máximo, en su propia escala, y su propio viento',
    windField: 'Campo de viento',
    windFieldText: (ts: number, strongest: number | null, term: Term) =>
      `Vientos con fuerza de tormenta tropical hasta ${ts} km del centro` +
      (strongest ? `; con fuerza de ${storm64(term)} hasta ${strongest} km` : ''),
    windFieldPending: (term: Term) =>
      `Las extensiones de los vientos con fuerza de ${storm64(term)} aún no están en el registro: el registro final ` +
      'del centro de avisos sale después de la temporada.',
    noEstimate: 'sin estimación',
    footprint: 'Sombreado en el mapa: hasta dónde llegaron sus vientos',
    footprint34: 'Fuerza de tormenta tropical (34 kt+)',
    seaChart: 'Temperatura del mar bajo el centro (°C)',
    seaChartLabel: 'Temperatura del mar en el tiempo',
    seaChartNote:
      'El agua un día antes de que llegara la tormenta (registro satelital diario de la NOAA). Los ciclones ' +
      'tropicales suelen necesitar 26 °C o más para intensificarse.',
    seaTemp: (c: number, f: number) => `Mar ${fixed1.format(c)} °C · ${whole.format(f)} °F`,
    seas: 'Oleaje alto',
    seasText: (km: number) => `Olas de 12 pies (3.7 m) o más hasta ${km} km del centro`,
    footprintSeas: 'Olas de 12 pies (3.7 m) o más',
    footprint64: (term: Term) => `Fuerza de ${storm64(term)} (64 kt+)`,
  },

  report: {
    actions: 'Acciones del informe',
    back: '← Volver al mapa',
    downloadCsv: 'Descargar CSV',
    downloadGeoJson: 'Descargar GeoJSON',
    print: 'Imprimir o guardar como PDF',
    kicker: 'Historial de ciclones tropicales',
    title: (km: number, place: string) => `A menos de ${km} km de ${place}`,
    seasons: (from: number, to: number) => (from === to ? `Temporada ${from}` : `Temporadas ${from}–${to}`),
    allBasins: 'todas las cuencas',
    strength: {
      [-9]: 'cualquier intensidad',
      0: 'al menos intensidad de tormenta tropical',
      1: 'al menos categoría 1',
      3: 'al menos categoría 3',
      5: 'al menos categoría 5',
    },
    named: (q: string) => `llamadas «${q}»`,
    preparing: 'Preparando el informe…',
    summary: 'Resumen',
    storms: 'Tormentas',
    hurricanes: (term: Term) =>
      term === 'other'
        ? 'Categoría 1+ en su paso más cercano'
        : `Con intensidad de ${storm64(term)} (categoría 1+) en su paso más cercano`,
    majors: (term: Term) =>
      term === 'hurricane' ? 'Huracán mayor (categoría 3+) en su paso más cercano' : 'Categoría 3+ en su paso más cercano',
    mostRecent: 'La más reciente',
    noneInSeasons: 'ninguna en estas temporadas',
    howOften: (count: number, years: number) => {
      if (!count) return 'ninguna';
      const per = years / count;
      if (per >= 1) {
        return `aproximadamente una vez cada ${per < 10 ? fixed1.format(per) : whole.format(per)} años`;
      }
      return `aproximadamente ${fixed1.format(count / years)} al año`;
    },
    yearsAgo: (n: number) => (n <= 0 ? '' : n === 1 ? ' · el año pasado' : ` · hace ${n} años`),
    satellite: (year: number) =>
      `Los registros anteriores a ${year} aproximadamente, cuando los satélites empezaron a vigilar todos los ` +
      'océanos, omiten tormentas que se quedaron en el mar y a menudo no tienen datos de viento, así que las primeras ' +
      'décadas cuentan de menos y las frecuencias de arriba son bajas.',
    map: 'Trayectorias, coloreadas por intensidad',
    mapLabel: (n: number, place: string) => `Mapa de ${n} ${pick(n, 'trayectoria', 'trayectorias')} cerca de ${place}`,
    legend: 'Leyenda',
    byMonth: 'Época del año (mes del paso más cercano)',
    byDecade: 'Tormentas por década',
    decade: (d: number) => `${d}`,
    columnTip: (n: number, label: string) => `${pick(n, '{n} tormenta', '{n} tormentas')} · ${label}`,
    everyStorm: 'Todas las tormentas',
    everyStormTitle: 'Todas las tormentas, de la más reciente a la más antigua',
    table: {
      storm: 'Tormenta',
      closest: 'Paso más cercano',
      distance: 'Distancia',
      strengthThen: 'Intensidad entonces',
      windThen: 'Viento entonces',
      peak: 'Máximo',
      landfall: 'Tocó tierra en',
      alsoCrossed: (countries: string) => `también atravesó ${countries}`,
    },
    overLand: 'sobre tierra',
    yes: 'sí',
    noStorms: (km: number) => `Ninguna tormenta pasó a menos de ${km} km en estas temporadas.`,
    alsoListed: (km: number) =>
      `También aparecen tormentas cuyo centro pasó a más de ${km} km pero cuyos vientos llegaron hasta aquí.`,
    winds: {
      title: (place: string) => `Vientos que llegaron a ${place}`,
      scope: (from: number, to: number) =>
        `${from === to ? `Temporada ${from}` : `Temporadas ${from}–${to}`}: los años con estimaciones de hasta dónde ` +
        'llegaron los vientos de las tormentas',
      noData:
        'Las estimaciones de hasta dónde llegaron los vientos de las tormentas existen solo desde alrededor del 2000, ' +
        'y están completas desde 2004 en la mayoría de las cuencas. Elige temporadas a partir de 2004 para ver con qué ' +
        'frecuencia llegaron hasta aquí.',
      hurricane: (term: Term) => `Vientos con fuerza de ${storm64(term)} (64 kt+)`,
      kt50: 'Vientos de 50 kt o más',
      tropical: 'Vientos con fuerza de tormenta tropical (34 kt+)',
      unknown: (n: number) =>
        `${n} ${pick(n, 'tormenta', 'tormentas')} de estas temporadas ${pick(n, 'pasó', 'pasaron')} lo bastante cerca ` +
        `pero no ${pick(n, 'tiene', 'tienen')} estimación de hasta dónde llegaron sus vientos, así que estas cifras ` +
        'pueden quedarse cortas.',
      column: 'Vientos que llegaron aquí',
      cell: { 64: '64 kt+', 50: '50 kt+', 34: '34 kt+', 0: 'ninguno' },
      noEstimate: 'sin estimación',
    },
    howTitle: 'Cómo se calcula',
    how: (km: number, country: boolean) => [
      `Una tormenta cuenta si su centro pasó a menos de ${km} km de ` +
        `${country ? 'la tierra del país (fronteras actuales)' : 'el lugar'}, en cualquier punto de su trayectoria.`,
      '«En su paso más cercano» es la intensidad y el viento de la tormenta en su punto más cercano.',
      'El viento es el viento máximo de 1 minuto, de las agencias de EE. UU. cuando lo tienen. Otras agencias ' +
        'promedian 10 minutos, lo que da valores más bajos.',
      'La intensidad es la categoría Saffir-Simpson. Donde una región tiene su propia escala, su clase aparece debajo.',
      ...(country ? ['Las distancias a un país tienen un margen de unos 10 km.'] : []),
    ],
    windsHowTitle: 'Hasta dónde llegaron los vientos',
    windsHow: (km: number, country: boolean) => [
      'Los pronosticadores estiman hasta dónde llegan los vientos de 34, 50 y 64 kt desde el centro, en cada dirección.',
      'Estas áreas se dibujan como dibuja sus mapas de viento el Centro Nacional de Huracanes de EE. UU., y coinciden ' +
        'con ellos con un margen de pocos puntos porcentuales.',
      'Las estimaciones son lo más lejos que llegaron esos vientos. «Llegaron aquí» significa que ' +
        `${country ? 'parte del territorio del país' : 'este lugar'} estuvo dentro de esa área, no que todos los puntos los sintieran.`,
      'Las estimaciones empiezan alrededor del 2000 y están completas desde 2004 en la mayoría de las cuencas. Las ' +
        'tormentas más antiguas muestran «sin estimación».',
      `Las tormentas cuyos vientos llegaron hasta aquí aparecen aunque su centro pasara a más de ${km} km.`,
    ],
    data: (citation: string) => `Datos: ${citation} Formas de países y lugares: Natural Earth.`,
    made: (date: string, from: string) => `Generado el ${date} a partir de ${from}`,
  },
};
