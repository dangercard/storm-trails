/**
 * For the data tests: the app's own loaders (loadIndex, loadDecade, loadRadii, loadCountries, loadPlaces, the
 * language names) fetch /data/…; here those read public/data from disk instead, so the tests check the files as built.
 */
import { readFile } from 'node:fs/promises';
import { vi } from 'vitest';

vi.stubGlobal('fetch', async (path: string) => {
  const file = new URL(`../public${path}`, import.meta.url);
  try {
    const text = await readFile(file, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(text) };
  } catch {
    return { ok: false, status: 404, json: async () => null };
  }
});
