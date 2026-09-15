// Minimal JSON API for a folder of photos on the NAS.

// Title comes straight from the filename (minus extension).
// Year comes from the photo's own EXIF metadata (DateTimeOriginal /
// CreateDate) rather than the filename, so no special naming is needed.
// The folder name becomes the "cat" field used by the site's nav filter.
// Orientation ("tall"/"wide") is detected from the actual image, not guessed.

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs/promises');
const sizeOf = require('image-size');
const exifr = require('exifr');
const sharp = require('sharp');

const PORT = process.env.PORT || 4000;
const PHOTOS_DIR = process.env.PHOTOS_DIR || '/mnt/raid/irisographywebsite';
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

// Optimized copies are generated once per source photo and cached here.
// The cache is warmed before the server starts; deleting this folder forces
// regeneration during the next startup.
const CACHE_DIR = path.join(__dirname, 'cache');
const MAX_WIDTH = 1600;   // wide enough for a large desktop tile, small enough to load fast
const JPEG_QUALITY = 78;  // good visual quality at meaningfully smaller file size

const app = express();
let workList = [];

// Allow the site (served from a different origin/port) to fetch this API.
// Lock this down to your actual site origin once it has a fixed URL, e.g.:
// app.use(cors({ origin: 'http://your-site.local' }));
app.use(cors());

async function optimizePhoto(sourcePath, cachePath) {
  try {
    const [sourceStat, cacheStat] = await Promise.all([
      fs.stat(sourcePath),
      fs.stat(cachePath).catch(() => null),
    ]);

    if (cacheStat && cacheStat.mtimeMs >= sourceStat.mtimeMs) {
      return false;
    }

    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await sharp(sourcePath)
      .rotate() // apply EXIF orientation so resized output isn't sideways
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toFile(cachePath);
    return true;
  } catch (err) {
    throw new Error(`Failed to optimize ${sourcePath}: ${err.message}`);
  }
}

// Serves a resized, compressed JPEG. Startup pre-generates these files so
// the first visitor does not pay the resize cost.
app.get('/photos/:cat/:file', async (req, res) => {
  const { cat, file } = req.params;
  const ext = path.extname(file).toLowerCase();
  if (!IMAGE_EXT.has(ext)) return res.status(404).end();

  const sourcePath = path.join(PHOTOS_DIR, cat, file);
  const cachePath = path.join(CACHE_DIR, cat, `${path.parse(file).name}.jpg`);

  try {
    await optimizePhoto(sourcePath, cachePath);
    res.set('Cache-Control', 'public, max-age=604800'); // 1 week
    res.sendFile(cachePath);
  } catch (err) {
    console.error(err.message);
    res.status(500).end();
  }
});

function titleFromFilename(filename) {
  return path.parse(filename).name; // strips extension, e.g. "Sara.jpg" -> "Sara"
}

async function getYearFromExif(filePath) {
  try {
    const exif = await exifr.parse(filePath, ['DateTimeOriginal', 'CreateDate']);
    const date = exif?.DateTimeOriginal || exif?.CreateDate;
    if (date instanceof Date && !isNaN(date)) return date.getFullYear();
  } catch (err) {
    console.warn(`Could not read EXIF for ${filePath}:`, err.message);
  }
  return null;
}

async function buildWorkList() {
  const categories = await fs.readdir(PHOTOS_DIR, { withFileTypes: true });
  const items = [];

  for (const entry of categories) {
    if (!entry.isDirectory()) continue;
    const cat = entry.name;
    const catPath = path.join(PHOTOS_DIR, cat);
    const files = await fs.readdir(catPath);

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!IMAGE_EXT.has(ext)) continue;

      const filePath = path.join(catPath, file);
      let tall = true;
      try {
        const buffer = await fs.readFile(filePath);
        const dims = sizeOf(buffer);
        tall = dims.height >= dims.width;
      } catch (err) {
        console.warn(`Could not read dimensions for ${file}:`, err.message);
      }

      const title = titleFromFilename(file);
      const year = await getYearFromExif(filePath);

      items.push({
        title,
        year,
        tall,
        cat,
        image: `/photos/${encodeURIComponent(cat)}/${encodeURIComponent(file)}`,
      });
    }
  }

  return items;
}

app.get('/api/work', async (req, res) => {
  try {
    res.json(workList);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to read photos directory' });
  }
});

app.get('/', (req, res) => {
  res.send('Photo API running. Try GET /api/work');
});

async function startServer() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  workList = await buildWorkList();

  let optimized = 0;
  for (const item of workList) {
    const sourcePath = path.join(PHOTOS_DIR, item.cat, decodeURIComponent(item.image.split('/').pop()));
    const cachePath = path.join(CACHE_DIR, item.cat, `${path.parse(sourcePath).name}.jpg`);
    if (await optimizePhoto(sourcePath, cachePath)) optimized += 1;
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Photo API listening on http://0.0.0.0:${PORT}`);
    console.log(`Photos served from: ${PHOTOS_DIR}`);
    console.log(`Optimized ${optimized} photo${optimized === 1 ? '' : 's'} at startup`);
  });
}

startServer().catch(err => {
  console.error('Failed to prepare photo cache:', err);
  process.exitCode = 1;
});