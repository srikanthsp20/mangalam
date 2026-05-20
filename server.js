/**
 * Mangalam Catering Services – Node.js/Express Server
 * ----------------------------------------------------
 * Serves the frontend (public/) and handles image uploads.
 * Images are saved to public/uploads/ and served as static files.
 *
 * Usage:
 *   node server.js          (port 3000 by default)
 *   PORT=8080 node server.js
 */

const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── Ensure uploads folder exists ─────────────────────────────── */
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/* ── Multer storage config ─────────────────────────────────────── */
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    // e.g.  1716123456789-idli-sambar.jpg
    const ext      = path.extname(file.originalname).toLowerCase();
    const safeName = path.basename(file.originalname, ext)
                       .replace(/[^a-z0-9_\-]/gi, '-')
                       .slice(0, 60)
                       .toLowerCase();
    cb(null, Date.now() + '-' + safeName + ext);
  }
});

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE_MB   = 5;

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, WebP and GIF images are allowed.'));
    }
  }
});

/* ── Serve static frontend files ───────────────────────────────── */
app.use(express.static(path.join(__dirname, 'public')));

/* ── POST /api/upload-image ─────────────────────────────────────
   Accepts:  multipart/form-data  field name: "image"
   Returns:  { success: true, url: "/uploads/filename.jpg" }
             { success: false, error: "..." }
─────────────────────────────────────────────────────────────── */
app.post('/api/upload-image', function (req, res) {
  upload.single('image')(req, res, function (err) {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'File too large (max ' + MAX_SIZE_MB + ' MB).'
        : err.message || 'Upload failed.';
      return res.status(400).json({ success: false, error: msg });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file received.' });
    }
    const url = '/uploads/' + req.file.filename;
    res.json({ success: true, url });
  });
});

/* ── DELETE /api/delete-image ───────────────────────────────────
   Body (JSON):  { "filename": "1716123456789-idli.jpg" }
   Only deletes files that live inside public/uploads/ (safe).
─────────────────────────────────────────────────────────────── */
app.use(express.json());

app.delete('/api/delete-image', function (req, res) {
  const filename = (req.body && req.body.filename) ? req.body.filename : '';
  if (!filename || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ success: false, error: 'Invalid filename.' });
  }
  const filePath = path.join(UPLOADS_DIR, filename);
  fs.unlink(filePath, function (err) {
    if (err) {
      return res.status(404).json({ success: false, error: 'File not found.' });
    }
    res.json({ success: true });
  });
});

/* ── GET /api/images ────────────────────────────────────────────
   Returns list of all uploaded images (for image picker).
─────────────────────────────────────────────────────────────── */
app.get('/api/images', function (req, res) {
  fs.readdir(UPLOADS_DIR, function (err, files) {
    if (err) return res.json({ images: [] });
    const images = files
      .filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f))
      .map(f => ({ filename: f, url: '/uploads/' + f }));
    res.json({ images });
  });
});

/* ── Catch-all: serve index.html for any unknown route ─────────── */
app.get('*', function (req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ── Start ─────────────────────────────────────────────────────── */
app.listen(PORT, function () {
  console.log('✅  Mangalam server running at http://localhost:' + PORT);
  console.log('📁  Images stored in: ' + UPLOADS_DIR);
});
