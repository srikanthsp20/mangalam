/**
 * Mangalam Catering Services – Node.js/Express Server
 * ----------------------------------------------------
 * Modified for Deployment on Render.com with Cloudinary Storage.
 * Configured for flat-directory layout (index.html in the root folder).
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Static Asset & Body Parser Settings ────────────────────────
// Serves static assets directly from the root project directory
app.use(express.static(__dirname));
app.use(express.json());

// ── Cloudinary Configuration ───────────────────────────────────
// These parameters will be securely extracted via Environment Variables on Render
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ── Cloudinary Storage Engine for Multer ───────────────────────
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'mangalam_catering', // Target folder name inside your Cloudinary Media Library
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    public_id: (req, file) => {
      // Create a clean, url-friendly file descriptor prefixing timestamps to prevent duplicates
      const ext = path.extname(file.originalname).toLowerCase();
      const safeName = path.basename(file.originalname, ext)
                         .replace(/[^a-z0-9_\-]/gi, '-')
                         .slice(0, 60)
                         .toLowerCase();
      return Date.now() + '-' + safeName;
    }
  }
});

const MAX_SIZE_MB = 5;
const upload = multer({
  storage: storage,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 }
});

/* ── POST /api/upload-image ─────────────────────────────────────
   Intercepts files and pushes them securely to the Cloudinary network.
─────────────────────────────────────────────────────────────── */
app.post('/api/upload-image', function (req, res) {
  upload.single('image')(req, res, function (err) {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded.' });
    }
    
    // req.file.path contains the direct web url (https://res.cloudinary.com/...)
    // req.file.filename keeps track of the public_id identifier needed for deletions
    res.json({
      success: true,
      filename: req.file.filename,
      url: req.file.path 
    });
  });
});

/* ── DELETE /api/delete-image ───────────────────────────────────
   Deletes target assets straight from your Cloudinary storage media account.
─────────────────────────────────────────────────────────────── */
app.delete('/api/delete-image', function (req, res) {
  const filename = (req.body && req.body.filename) ? req.body.filename : '';
  if (!filename) {
    return res.status(400).json({ success: false, error: 'Invalid filename.' });
  }

  // Uses Cloudinary's uploader interface to instantly clear the remote asset
  cloudinary.uploader.destroy(filename, function (err, result) {
    if (err || result.result !== 'ok') {
      return res.status(404).json({ success: false, error: 'Asset not found or already deleted.' });
    }
    res.json({ success: true });
  });
});

/* ── GET /api/images ────────────────────────────────────────────
   Fetches uploaded image paths from your active Cloudinary media index.
─────────────────────────────────────────────────────────────── */
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
    .catch(err => {
      // Safely fall back to an empty library slice if things fail
      res.json({ images: [] });
    });
});

/* ── Catch-all: serve index.html for Single Page Routing ──────── 
   Uses Express v5 compatible routing syntax '(*)' to prevent PathErrors
─────────────────────────────────────────────────────────────── */
app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, function() {
  console.log('Mangalam Catering Application listening on port ' + PORT);
});
