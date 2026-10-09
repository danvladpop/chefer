/**
 * vendor-commons-photos.ts (WP-25 lane x — "complete media")
 *
 * Vendors openly licensed photos from Wikimedia Commons for the catalog exercises
 * listed in COMMONS_PICKS (the cardio / class presets, where a real scene photo
 * says more than an AI render). For each pick it asks the Commons API for the file
 * page URL, author and licence, REFUSES anything that is not CC0 / public domain /
 * CC BY / CC BY-SA (no NC, no ND), downloads a 1600 px rendition, cover-crops it to
 * 600×400 WebP (photo-lib.ts) and records source URL, author and licence in
 * docs/gym/exercise-photo-sources.json (the README credits table is built from it).
 *
 * CC BY / CC BY-SA need attribution: apps/api/static/exercises/README.md carries
 * the credits, and the in-app exercise detail screen does not (photo credit UI is
 * out of scope for this lane; flagged in the report).
 *
 * Usage (repo root):
 *   cd apps/api && pnpm exec tsx ../../scripts/gym/vendor-commons-photos.ts [--only a,b] [--force]
 *
 * Idempotent: a slug whose two files exist is skipped unless --force.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exercisePhotoFile } from '@chefer/types';
import {
  flag,
  onlyList,
  OUT_DIR,
  readManifest,
  sleep,
  toCatalogWebp,
  writeManifest,
  type Crop,
  type PhotoFrameSource,
} from './photo-lib';

type Pick = { title: string; crop?: Crop };

/** File titles are exactly as on commons.wikimedia.org (with the `File:` prefix). */
export const COMMONS_PICKS: Readonly<Record<string, [Pick, Pick]>> = {
  'dance-class': [
    { title: 'File:Buckley Zumba session.JPG' },
    { title: 'File:US Army 52862 Zumba adds Latin dance to fitness routine.jpg' },
  ],
  'spin-class': [
    { title: 'File:Indoor Cycle Class at a Gym.JPG' },
    { title: 'File:Indoor Cycling Group ICG Shop und Showroom Nürnberg 7.jpg' },
  ],
  'pilates-class': [
    { title: 'File:Pilates Cabane 14.jpg' },
    { title: 'File:Pilates reformer pic.jpg' },
  ],
  swimming: [
    { title: 'File:Nacc Meet 2013 (42757488).jpeg' },
    {
      title:
        'File:40. Schwimmzonen- und Mastersmeeting Enns 2017 200M FREISTIL HERREN (MASTERS)-0745.jpg',
    },
  ],
  // Running and outdoor running are the same activity: both use the same two scenes.
  running: [
    { title: 'File:120915-F-KX404-139 (7996341270).jpg' },
    { title: 'File:Evening jogger (4488221416).jpg', crop: { focusY: 0.2 } },
  ],
  'outdoor-run': [
    { title: 'File:120915-F-KX404-139 (7996341270).jpg' },
    { title: 'File:Evening jogger (4488221416).jpg', crop: { focusY: 0.2 } },
  ],
};

const UA = 'chefer-media-bot/1.0 (https://github.com/danvladpop/chefer; popdanvlad87@gmail.com)';
const ALLOWED = /^(CC0|Public domain|CC BY(-SA)? \d\.\d)/i;
const FORCE = flag('--force');

type CommonsInfo = {
  pageUrl: string;
  imageUrl: string;
  author: string;
  license: string;
};

async function getJson(url: string): Promise<unknown> {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) return res.json();
    await sleep(2000 * attempt);
  }
  throw new Error(`Commons API kept failing: ${url}`);
}

async function lookup(title: string): Promise<CommonsInfo> {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo' +
    `&iiprop=url|extmetadata&iiurlwidth=1600&titles=${encodeURIComponent(title)}`;
  const data = (await getJson(url)) as {
    query: {
      pages: Record<
        string,
        {
          imageinfo?: {
            thumburl: string;
            descriptionurl: string;
            extmetadata: Record<string, { value: string }>;
          }[];
        }
      >;
    };
  };
  const info = Object.values(data.query.pages)[0]?.imageinfo?.[0];
  if (!info) throw new Error(`Commons has no file ${title}`);
  const license = info.extmetadata['LicenseShortName']?.value ?? '';
  if (!ALLOWED.test(license) || /\b(NC|ND)\b/.test(license)) {
    throw new Error(`${title}: licence "${license}" is not allowed (CC0/PD/CC BY/CC BY-SA only)`);
  }
  const author = (info.extmetadata['Artist']?.value ?? '').replace(/<[^>]+>/g, '').trim();
  return { pageUrl: info.descriptionurl, imageUrl: info.thumburl, author, license };
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const only = onlyList();
  for (const [id, picks] of Object.entries(COMMONS_PICKS)) {
    if (only && !only.includes(id)) continue;
    const files = [exercisePhotoFile(id, 0), exercisePhotoFile(id, 1)] as const;
    if (!FORCE && files.every((f) => existsSync(join(OUT_DIR, f)))) continue;
    const frames: PhotoFrameSource[] = [];
    for (const frame of [0, 1] as const) {
      const pick = picks[frame];
      const info = await lookup(pick.title);
      const res = await fetch(info.imageUrl, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${pick.title}`);
      const tmp = join(tmpdir(), `commons-${process.pid}-${id}-${frame}.jpg`);
      writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
      toCatalogWebp(tmp, join(OUT_DIR, files[frame]), pick.crop);
      frames.push({
        file: files[frame],
        sourceUrl: info.pageUrl,
        author: info.author,
        license: info.license,
      });
      console.log(`${id} frame ${frame}: ${pick.title} (${info.license}, ${info.author})`);
      await sleep(1500);
    }
    const [f0, f1] = frames;
    if (f0 && f1) {
      // Re-read: other scripts (generate-exercise-photos.ts) write the same file.
      const fresh = readManifest();
      fresh[id] = { source: 'commons', frames: [f0, f1] };
      writeManifest(fresh);
    }
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
