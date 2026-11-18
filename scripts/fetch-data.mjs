// Downloads the IBTrACS v04r01 "ALL" CSV (every storm, every basin) into data/raw/.
//
// NOAA NCEI's own folder is tried first. When it's offline (it has been since late Oct 2026), a frozen copy of NCEI's
// file of 2026-10-27 is used instead, pinned to one revision and checked against the sha256 its maintainer recorded,
// so it's byte for byte what NCEI published.
//
//   npm run data:fetch            download (skipped when the file is already there)
//   npm run data:fetch -- --force download again
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const FILE = 'ibtracs.ALL.list.v04r01.csv';
const OUT = `data/raw/${FILE}`;
const SOURCES = [
  {
    name: 'NOAA NCEI',
    url: `https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/${FILE}`,
  },
  {
    name: 'frozen copy of NCEI 2026-10-27 (Hugging Face, yuiseki/ibtracs-v04r01-2026-10)',
    url: `https://huggingface.co/datasets/yuiseki/ibtracs-v04r01-2026-10/resolve/3407efc2b694b9aeaa679982715a5e8a33146c7c/raw/20261027/${FILE}`,
    sha256: 'aec31872c58d4509d1bc5f9746bea6074ec208a2c3aba4ceff32bacd0b2059e2',
  },
];

if (existsSync(OUT) && !process.argv.includes('--force')) {
  console.log(`${OUT} is already there (${(statSync(OUT).size / 1e6).toFixed(0)} MB); --force to download again`);
  process.exit(0);
}
mkdirSync('data/raw', { recursive: true });

for (const source of SOURCES) {
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
  const tmp = `${OUT}.part`;
  const body = Readable.fromWeb(res.body);
  body.on('data', (chunk) => hash.update(chunk));
  await pipeline(body, createWriteStream(tmp));
  const sha = hash.digest('hex');
  if (source.sha256 && sha !== source.sha256) {
    console.log(`  checksum mismatch (got ${sha}); not using it`);
    continue;
  }
  renameSync(tmp, OUT);
  console.log(`  saved ${OUT} (${(statSync(OUT).size / 1e6).toFixed(0)} MB, sha256 ${sha.slice(0, 12)}…)`);
  process.exit(0);
}
console.error('No source worked.');
process.exit(1);
