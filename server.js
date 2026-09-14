// Minimal JSON API for a folder of photos on the NAS.
//
// Layout expected on disk:
//
//   photos/
//     video/
//       Meridian Wireless -- Brand film, dir. -- 2023.jpg
//       ...
//     lifestyle/
//       Sara.jpg                         <- client/year are optional
//     beauty/
//     editorial/
//     personal/
//
// Filename convention (all parts after the title are optional):
//   "Title -- Client -- Year.jpg"
//   "Title.jpg"
//
// The folder name becomes the "cat" field used by the site's nav filter.
// Orientation ("tall"/"wide") is detected from the actual image, not guessed.

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs/promises');
const sizeOf = require('image-size');

const PORT = process.env.PORT || 4000;
const PHOTOS_DIR = path.join(__dirname, 'photos');
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const app = express();

// Allow the site (served from a different origin/port) to fetch this API.
// Lock this down to your actual site origin once it has a fixed URL, e.g.:
// app.use(cors({ origin: 'http://your-site.local' }));
app.use(cors());

// Serve the raw image files at /photos/<category>/<file>
app.use('/photos', express.static(PHOTOS_DIR, { maxAge: '1d' }));

function parseFilename(filename) {
  const base = path.parse(filename).name; // strips extension
  const parts = base.split('--').map(s => s.trim());
  const [title, client, year] = parts;
  return {
    title: title || base,
    client: client || null,
    year: year ? Number(year) : null,
  };
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

      const { title, client, year } = parseFilename(file);

      items.push({
        title,
        client,
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
    const items = await buildWorkList();
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to read photos directory' });
  }
});

app.get('/', (req, res) => {
  res.send('Photo API running. Try GET /api/work');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Photo API listening on http://0.0.0.0:${PORT}`);
  console.log(`Photos served from: ${PHOTOS_DIR}`);
});