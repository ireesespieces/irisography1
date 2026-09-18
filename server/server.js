// JSON API for a folder of photos and videos on the NAS.
//
// Layout expected on disk:
//
//   irisographywebsite/
//     selected-works/
//       sara.jpg
//     portraits/
//     sports/
//     street/
//     video/
//       clip.mp4
//       clip2.mov
//
// Title comes straight from the filename (minus extension).
// Photo year comes from EXIF metadata (DateTimeOriginal / CreateDate).
// Video year comes from the file's own modified-time, since videos don't
// carry the same EXIF date fields.
// The folder name becomes the "cat" field used by the site's nav filter.
// Orientation ("tall"/"wide") is detected from the actual image/video, not guessed.

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs/promises');
const { execFile } = require('child_process');
const { promisify } = require('util');
const sizeOf = require('image-size');
const exifr = require('exifr');
const sharp = require('sharp');

const execFileAsync = promisify(execFile);

const PORT = process.env.PORT || 4000;
const PHOTOS_DIR = process.env.PHOTOS_DIR || '/mnt/raid/irisographywebsite';
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const VIDEO_EXT = new Set(['.mp4', '.mov']);

// Optimized photo copies and video poster frames are generated once per
// source file and cached here. The cache is warmed before the server
// starts; deleting this folder forces regeneration during the next startup.
const CACHE_DIR = path.join(__dirname, 'cache');
const MAX_WIDTH = 1600;   // wide enough for a large desktop tile, small enough to load fast
const JPEG_QUALITY = 78;  // good visual quality at meaningfully smaller file size

let workList = [];

const app = express();

// Allow the site (served from a different origin/port) to fetch this API.
// Lock this down to your actual site origin once it has a fixed URL, e.g.:
// app.use(cors({ origin: 'http://your-site.local' }));
app.use(cors());

async function optimizePhoto(sourcePath, cachePath) {
  const [sourceStat, cacheStat] = await Promise.all([
    fs.stat(sourcePath),
    fs.stat(cachePath).catch(() => null),
  ]);

  if (cacheStat && cacheStat.mtimeMs >= sourceStat.mtimeMs) return false;

  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await sharp(sourcePath)
    .rotate() // apply EXIF orientation so resized output isn't sideways
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toFile(cachePath);
  return true;
}

// Extracts a single frame (1 second in) from a video as a poster thumbnail,
// using the system ffmpeg binary. Requires ffmpeg to be installed
// (sudo apt install ffmpeg on Debian/Ubuntu).
async function generatePoster(sourcePath, cachePath) {
  const [sourceStat, cacheStat] = await Promise.all([
    fs.stat(sourcePath),
    fs.stat(cachePath).catch(() => null),
  ]);

  if (cacheStat && cacheStat.mtimeMs >= sourceStat.mtimeMs) return false;

  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await execFileAsync('ffmpeg', [
    '-y',                    // overwrite existing output
    '-ss', '00:00:01',       // seek 1s in, avoids all-black first frames
    '-i', sourcePath,
    '-frames:v', '1',
    '-vf', `scale='min(${MAX_WIDTH},iw)':-2`,
    '-q:v', '4',
    cachePath,
  ]);
  return true;
}

// Serves a resized, compressed JPEG for any photo under PHOTOS_DIR.
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
    console.error(`Failed to serve/optimize ${sourcePath}:`, err.message);
    res.status(500).end();
  }
});

// Serves a poster-frame thumbnail for a video (used as the tile image).
app.get('/video-poster/:cat/:file', async (req, res) => {
  const { cat, file } = req.params;
  const ext = path.extname(file).toLowerCase();
  if (!VIDEO_EXT.has(ext)) return res.status(404).end();

  const sourcePath = path.join(PHOTOS_DIR, cat, file);
  const cachePath = path.join(CACHE_DIR, cat, `${path.parse(file).name}.poster.jpg`);

  try {
    await generatePoster(sourcePath, cachePath);
    res.set('Cache-Control', 'public, max-age=604800');
    res.sendFile(cachePath);
  } catch (err) {
    console.error(`Failed to generate poster for ${sourcePath}:`, err.message);
    res.status(500).end();
  }
});

// Serves the actual video file for playback. res.sendFile (via Express's
// underlying `send` library) already handles Range headers correctly, so
// seeking/scrubbing in the <video> element works without extra code.
app.get('/videos/:cat/:file', (req, res) => {
  const { cat, file } = req.params;
  const ext = path.extname(file).toLowerCase();
  if (!VIDEO_EXT.has(ext)) return res.status(404).end();

  const sourcePath = path.join(PHOTOS_DIR, cat, file);
  res.set('Cache-Control', 'public, max-age=604800');
  res.sendFile(sourcePath, err => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

function titleFromFilename(filename) {
  return path.parse(filename).name; // strips extension
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

async function getYearFromFileDate(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.mtime.getFullYear();
  } catch {
    return null;
  }
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
      const filePath = path.join(catPath, file);
      const title = titleFromFilename(file);

      if (IMAGE_EXT.has(ext)) {
        let tall = true;
        try {
          const buffer = await fs.readFile(filePath);
          const dims = sizeOf(buffer);
          tall = dims.height >= dims.width;
        } catch (err) {
          console.warn(`Could not read dimensions for ${file}:`, err.message);
        }
        const year = await getYearFromExif(filePath);

        items.push({
          title, year, tall, cat,
          video: false,
          image: `/photos/${encodeURIComponent(cat)}/${encodeURIComponent(file)}`,
        });
      } else if (VIDEO_EXT.has(ext)) {
        const posterCachePath = path.join(CACHE_DIR, cat, `${path.parse(file).name}.poster.jpg`);
        let tall = false; // most video work is landscape; corrected below if poster read succeeds
        try {
          await generatePoster(filePath, posterCachePath);
          const buffer = await fs.readFile(posterCachePath);
          const dims = sizeOf(buffer);
          tall = dims.height >= dims.width;
        } catch (err) {
          console.warn(`Could not generate/read poster for ${file}:`, err.message);
        }
        const year = await getYearFromFileDate(filePath);

        items.push({
          title, year, tall, cat,
          video: true,
          poster: `/video-poster/${encodeURIComponent(cat)}/${encodeURIComponent(file)}`,
          src: `/videos/${encodeURIComponent(cat)}/${encodeURIComponent(file)}`,
        });
      }
      // anything else (unrecognized extension) is silently skipped
    }
  }

  return items;
}

app.get('/api/work', (req, res) => {
  res.json(workList);
});

app.get('/', (req, res) => {
  res.send('Photo/video API running. Try GET /api/work');
});

async function startServer() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  workList = await buildWorkList();

  let optimized = 0;
  for (const item of workList) {
    try {
      if (!item.video) {
        const sourcePath = path.join(PHOTOS_DIR, item.cat, decodeURIComponent(item.image.split('/').pop()));
        const cachePath = path.join(CACHE_DIR, item.cat, `${path.parse(sourcePath).name}.jpg`);
        if (await optimizePhoto(sourcePath, cachePath)) optimized += 1;
      }
      // Video posters are already generated inside buildWorkList above,
      // since we need to read the poster's dimensions there anyway.
    } catch (err) {
      console.error(`Startup optimization failed for ${item.title}:`, err.message);
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Photo/video API listening on http://0.0.0.0:${PORT}`);
    console.log(`Media served from: ${PHOTOS_DIR}`);
    console.log(`Optimized ${optimized} photo${optimized === 1 ? '' : 's'} at startup`);
  });
}

startServer().catch(err => {
  console.error('Failed to prepare media cache:', err);
  process.exitCode = 1;
});