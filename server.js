/**
 * Mangalam Catering Services – Node.js/Express Server
 * ----------------------------------------------------
 * Modified for Deployment on Render.com with Cloudinary Storage.
 * Handles menu item image uploads and assets via Cloudinary Cloud API.
 * Ensures data persistency and retrieval from any device online.
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve public static frontend elements (index.html, styles, etc.)
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ── Cloudinary Configuration ───────────────────────────────────
// These will load securely via environment variables defined on Render
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ── Cloudinary Multer Engine Definition ───────────────────────
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'mangalam_catering', // Creates/uses this folder in your Cloudinary Dashboard
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    public_id: (req, file) => {
      // Strips whitespace and characters to form a clean asset identifier filename
      const ext = path.extname(file.originalname).toLowerCase();
      const safeName = path.basename(file.originalname, ext)
                         .replace(/[^a-z0-9_\-]/gi, '-')
                         .slice(0, 60)
                         .toLowerCase();
      // Prefixing timestamp prevents overwrite collisions
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
   Streams uploads straight into Cloudinary over HTTPS.
─────────────────────────────────────────────────────────────── */
app.post('/api/upload-image', function (req, res) {
  upload.single('image')(req, res, function (err) {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded.' });
    }
    
    // req.file.path returns the secure, static "https://res.cloudinary.com/..." URL
    // req.file.filename keeps track of the public_id needed to execute remote deletes
    res.json({
      success: true,
      filename: req.file.filename,
      url: req.file.path 
    });
  });
});

/* ── DELETE /api/delete-image ───────────────────────────────────
   Erases target media files instantly from your cloud storage account.
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
   Retrieves all images from the cloud folder to populate your "Library" tab.
   Allows choosing existing images from any device, anywhere.
─────────────────────────────────────────────────────────────── */
app.get('/api/images', function (req, res) {
  cloudinary.search
    .expression('folder:mangalam_catering')
    .sort_by('public_id', 'desc')
    .max_results(50)
    .execute()
    .then(result => {
      // Map properties to match the schema expected by index.html frontend scripts
      const images = result.resources.map(file => ({
        filename: file.public_id,
        url: file.secure_url
      }));
      res.json({ images });
    })
    .catch(err => {
      // Return an empty array smoothly if cloud search permissions aren't initialized yet
      res.json({ images: [] });
    });
});

/* ── Catch-all: serve index.html for Single Page Routing ──────── */
/*app.get('*', function (req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});*/

/* ── Catch-all: serve index.html for Single Page Routing ──────── */
app.get('(*)', function (req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, function() {
  console.log('Mangalam Catering Application listening on port ' + PORT);
});
