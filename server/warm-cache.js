// Pre-warms the optimized photo cache by processing every photo under
// PHOTOS_DIR up front, instead of waiting for each one to be resized on
// its first real visitor request. Safe to re-run any time (e.g. after
// adding new photos) — already-cached, up-to-date files are skipped.
//
// Usage:
//   node warm-cache.js

const path = require('path');
const fs = require('fs/promises');
const sharp = require('sharp');

const PHOTOS_DIR = process.env.PHOTOS_DIR || '/mnt/raid/irisographywebsite';
const CACHE_DIR = path.join(__dirname, 'cache');
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MAX_WIDTH = 1600;
const JPEG_QUALITY = 78;

// How many photos to process at once. Higher = faster overall, but more
// CPU/disk load on the NAS machine at the same time. 3 is a safe default
// for a homelab box also running other things.
const CONCURRENCY = 3;

async function findAllPhotos() {
  const categories = await fs.readdir(PHOTOS_DIR, { withFileTypes: true });
  const files = [];

  for (const entry of categories) {
    if (!entry.isDirectory()) continue;
    const cat = entry.name;
    const catPath = path.join(PHOTOS_DIR, cat);
    const catFiles = await fs.readdir(catPath);

    for (const file of catFiles) {
      const ext = path.extname(file).toLowerCase();
      if (!IMAGE_EXT.has(ext)) continue;
      files.push({ cat, file });
    }
  }

  return files;
}

async function optimizeOne({ cat, file }) {
  const sourcePath = path.join(PHOTOS_DIR, cat, file);
  const cachePath = path.join(CACHE_DIR, cat, `${path.parse(file).name}.jpg`);

  const [sourceStat, cacheStat] = await Promise.all([
    fs.stat(sourcePath),
    fs.stat(cachePath).catch(() => null),
  ]);

  if (cacheStat && cacheStat.mtimeMs >= sourceStat.mtimeMs) {
    return { file: `${cat}/${file}`, status: 'skipped (already cached)' };
  }

  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await sharp(sourcePath)
    .rotate()
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toFile(cachePath);

  const [origSize, newSize] = await Promise.all([
    fs.stat(sourcePath).then(s => s.size),
    fs.stat(cachePath).then(s => s.size),
  ]);
  const savedPct = Math.round((1 - newSize / origSize) * 100);

  return { file: `${cat}/${file}`, status: `optimized (${savedPct}% smaller)` };
}

// Simple concurrency-limited runner, no extra dependency needed.
async function runWithConcurrency(items, limit, worker) {
  const results = [];
  let index = 0;

  async function next() {
    while (index < items.length) {
      const i = index++;
      try {
        const result = await worker(items[i]);
        results[i] = result;
        console.log(`[${i + 1}/${items.length}] ${result.file} — ${result.status}`);
      } catch (err) {
        results[i] = { file: `${items[i].cat}/${items[i].file}`, status: `ERROR: ${err.message}` };
        console.error(`[${i + 1}/${items.length}] ${items[i].cat}/${items[i].file} — ERROR: ${err.message}`);
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, next);
  await Promise.all(workers);
  return results;
}

async function main() {
  console.log(`Scanning ${PHOTOS_DIR} ...`);
  const photos = await findAllPhotos();
  console.log(`Found ${photos.length} photos. Warming cache with concurrency ${CONCURRENCY} ...\n`);

  const results = await runWithConcurrency(photos, CONCURRENCY, optimizeOne);

  const optimized = results.filter(r => r.status.startsWith('optimized')).length;
  const skipped = results.filter(r => r.status.startsWith('skipped')).length;
  const errored = results.filter(r => r.status.startsWith('ERROR')).length;

  console.log(`\nDone. ${optimized} optimized, ${skipped} already up to date, ${errored} errors.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
