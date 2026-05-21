/**
 * Mangalam Catering Services – Node.js/Express Server
 * ----------------------------------------------------
 * Deployment Ready: Render.com + Cloudinary Storage.
 * Flat-directory structure (index.html located in the root folder).
 * Synchronizes menu item structures globally across all network devices.
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;

// Central file path to preserve structural JSON menu arrays natively on the server instance
const MENU_FILE_PATH = path.join(__dirname, 'menu.json');

// Serve your root project folder directly for styles, configurations or assets
app.use(express.static(__dirname));
app.use(express.json());

// ── Shared Synchronization Data Engine ──────────────────────────
function readMenuData() {
  try {
    if (fs.existsSync(MENU_FILE_PATH)) {
      const rawData = fs.readFileSync(MENU_FILE_PATH, 'utf8');
      return JSON.parse(rawData);
    }
  } catch (error) {
    console.error("Error reading shared menu data:", error);
  }
  return null; // Signals the frontend to fallback to local defaults if empty
}

function writeMenuData(data) {
  try {
    fs.writeFileSync(MENU_FILE_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error("Error writing shared menu data:", error);
  }
}

// ── Cloudinary Configuration ───────────────────────────────────
// These parameters load securely via environment variables defined on Render
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ── Cloudinary Storage Engine ──────────────────────────────────
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'mangalam_catering', // Remote container directory in Cloudinary
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    public_id: (req, file) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeName = path.basename(file.originalname, ext)
                         .replace(/[^a-z0-9_\-]/gi, '-')
                         .slice(0, 60)
                         .toLowerCase();
      return Date.now() + '-' + safeName; // Collision-proof naming
    }
  }
});

const MAX_SIZE_MB = 5;
const upload = multer({
  storage: storage,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 }
});

/* ── GET /api/menu ──────────────────────────────────────────────
   Called by any device loading the page to fetch the uniform active menu list.
─────────────────────────────────────────────────────────────── */
app.get('/api/menu', function (req, res) {
  const data = readMenuData();
  if (!data) {
    // If the file doesn't exist yet, return success: false so client uses native hardcoded items
    return res.json({ success: false });
  }
  res.json({ success: true, menuItems: data });
});

/* ── POST /api/menu ─────────────────────────────────────────────
   Called by admin devices instantly whenever an item is added, updated, or removed.
─────────────────────────────────────────────────────────────── */
app.post('/api/menu', function (req, res) {
  if (Array.isArray(req.body)) {
    writeMenuData(req.body);
    return res.json({ success: true });
  }
  res.status(400).json({ success: false, error: 'Invalid data format.' });
});

/* ── POST /api/upload-image ───────────────────────────────────── */
app.post('/api/upload-image', function (req, res) {
  upload.single('image')(req, res, function (err) {
    if (err) return res.status(400).json({ success: false, error: err.message });
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded.' });
    
    // Returns global https:// paths out-of-the-box
    res.json({
      success: true,
      filename: req.file.filename,
      url: req.file.path 
    });
  });
});

/* ── DELETE /api/delete-image ─────────────────────────────────── */
app.delete('/api/delete-image', function (req, res) {
  const filename = (req.body && req.body.filename) ? req.body.filename : '';
  if (!filename) return res.status(400).json({ success: false, error: 'Invalid filename.' });

  cloudinary.uploader.destroy(filename, function (err, result) {
    if (err || result.result !== 'ok') {
      return res.status(404).json({ success: false, error: 'Asset not found or already deleted.' });
    }
    res.json({ success: true });
  });
});

/* ── GET /api/images ──────────────────────────────────────────── */
app.get('/api/images', function (req, res) {
  cloudinary.search
    .expression('folder:mangalam_catering')
    .sort_by('public_id', 'desc')
    .max_results(50)
    .execute()
    .then(result => {
      const images = result.resources.map(file => ({
        filename: file.public_id,
        url: file.secure_url
      }));
      res.json({ images });
    })
    .catch(err => res.json({ images: [] }));
});

/* ── Catch-all: serve index.html for Single Page Routing ──────── */
app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, function() {
  console.log('Mangalam Catering Application listening on port ' + PORT);
});
