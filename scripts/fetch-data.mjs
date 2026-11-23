// Downloads the raw data into data/raw/:
//
// - The IBTrACS v04r01 "ALL" CSV (every storm, every basin). NOAA NCEI's own folder is tried first. When it's offline
//   (as it was from late Oct to mid Nov 2026), a frozen copy of NCEI's file of 2026-10-27 is used instead, pinned to
//   one revision and checked against the sha256 its maintainer recorded, so it's byte for byte what NCEI published.
// - Natural Earth's populated places (v5.1.2), the cities the "Near" search offers, with their names in other
//   languages; and its countries (admin 0), for the countries' names in other languages and their ISO codes.
//
//   npm run data:fetch            download (each file skipped when it's already there)
//   npm run data:fetch -- --force download again
//   npm run data:fetch -- --force --latest   download again, and fail rather than fall back to the frozen copy (the
//                                 weekly update, .github/workflows/update-data.yml, so it never goes back in time)
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const IBTRACS = 'ibtracs.ALL.list.v04r01.csv';
const PLACES = 'ne_10m_populated_places.geojson';
const COUNTRIES = 'ne_10m_admin_0_countries.geojson';
const FILES = [
  {
    file: IBTRACS,
    sources: [
      {
        name: 'NOAA NCEI',
        url: `https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/${IBTRACS}`,
      },
      {
        name: 'frozen copy of NCEI 2026-10-27 (Hugging Face, yuiseki/ibtracs-v04r01-2026-10)',
        url: `https://huggingface.co/datasets/yuiseki/ibtracs-v04r01-2026-10/resolve/3407efc2b694b9aeaa679982715a5e8a33146c7c/raw/20261027/${IBTRACS}`,
        sha256: 'aec31872c58d4509d1bc5f9746bea6074ec208a2c3aba4ceff32bacd0b2059e2',
        frozen: true,
      },
    ],
  },
  {
    file: PLACES,
    sources: [
      {
        name: 'Natural Earth v5.1.2 (GitHub, nvkelso/natural-earth-vector)',
        url: `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/${PLACES}`,
        sha256: '9b8e3de09048ef00dfc70357dbb9fa324493f214b5e0ae4daf1aa79a8d10116b',
      },
    ],
  },
  {
    file: COUNTRIES,
    sources: [
      {
        name: 'Natural Earth v5.1.2 (GitHub, nvkelso/natural-earth-vector)',
        url: `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/${COUNTRIES}`,
        sha256: '239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255',
      },
    ],
  },
];

/** Saves the file from the first source that works; false when none does */
async function download({ file, sources }) {
  const out = `data/raw/${file}`;
  if (existsSync(out) && !process.argv.includes('--force')) {
    console.log(`${out} is already there (${(statSync(out).size / 1e6).toFixed(0)} MB); --force to download again`);
    return true;
  }
  for (const source of sources) {
    if (source.frozen && process.argv.includes('--latest')) {
      console.log(`Not trying the ${source.name}: --latest`);
      continue;
    }
    console.log(`Trying ${source.name}…`);
    let res;
    try {
      res = await fetch(source.url, { redirect: 'follow' });
    } catch (err) {
      console.log(`  unreachable (${err.message})`);
      continue;
    }
    if (!res.ok || !res.body) {
      console.log(`  HTTP ${res.status}`);
      continue;
    }
    const hash = createHash('sha256');
    const tmp = `${out}.part`;
    const body = Readable.fromWeb(res.body);
    body.on('data', (chunk) => hash.update(chunk));
    await pipeline(body, createWriteStream(tmp));
    const sha = hash.digest('hex');
    if (source.sha256 && sha !== source.sha256) {
      console.log(`  checksum mismatch (got ${sha}); not using it`);
      continue;
    }
    renameSync(tmp, out);
    console.log(`  saved ${out} (${(statSync(out).size / 1e6).toFixed(1)} MB, sha256 ${sha.slice(0, 12)}…)`);
    return true;
  }
  console.error(`No source worked for ${file}.`);
  return false;
}

mkdirSync('data/raw', { recursive: true });
let ok = true;
for (const f of FILES) ok = (await download(f)) && ok;
process.exit(ok ? 0 : 1);
