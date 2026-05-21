/**
 * Mangalam Catering Services – Node.js/Express Server
 * ----------------------------------------------------
 * 100% Free Tier Cloud Architecture: Render.com + Cloudinary.
 * ZERO LOCAL STORAGE REQUIREMENT: No Disks or Databases needed.
 * Cross-device data sync using Cloudinary Custom Context Tracking.
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;

// Serves static frontend assets directly from the root project directory
app.use(express.static(__dirname));
app.use(express.json());

// ── Cloudinary Configuration ───────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ── Cloudinary Engine Storage Engine ───────────────────────────
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'mangalam_catering',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    public_id: (req, file) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeName = path.basename(file.originalname, ext)
                         .replace(/[^a-z0-9_\-]/gi, '-')
                         .slice(0, 60)
                         .toLowerCase();
      return Date.now() + '-' + safeName;
    },
    // Intercepts structural text details during upload streaming from any device
    context: (req, file) => {
      return {
        name: req.body.name || 'Unnamed Item',
        price: req.body.price || '0',
        category: req.body.category || 'General',
        description: req.body.description || ''
      };
    }
  }
});

const MAX_SIZE_MB = 5;
const upload = multer({
  storage: storage,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 }
});

/* ── POST /api/upload-image ─────────────────────────────────────
   Streams both image bytes and textual properties directly into cloud memory.
─────────────────────────────────────────────────────────────── */
app.post('/api/upload-image', function (req, res) {
  upload.single('image')(req, res, function (err) {
    if (err) return res.status(400).json({ success: false, error: err.message });
    if (!req.file) return res.status(400).json({ success: false, error: 'No image asset detected.' });

    res.json({
      success: true,
      filename: req.file.filename,
      url: req.file.path
    });
  });
});

/* ── GET /api/menu ──────────────────────────────────────────────
   Queries Cloudinary, pulls the text context, and feeds cross-device viewers.
─────────────────────────────────────────────────────────────── */
app.get('/api/menu', function (req, res) {
  cloudinary.search
    .expression('folder:mangalam_catering')
    .with_field('context') // Crucial: Commands Cloudinary to return attached menu properties
    .sort_by('public_id', 'desc')
    .max_results(100)
    .execute()
    .then(result => {
      // Maps cloud properties cleanly back into your frontend's layout array pattern
      const menuItems = result.resources.map(resource => {
        const ctx = resource.context || {};
        return {
          id: resource.public_id,
          name: ctx.name || 'Unnamed Item',
          price: parseFloat(ctx.price) || 0,
          category: ctx.category || 'General',
          description: ctx.description || '',
          image: resource.secure_url,
          cloudinary_id: resource.public_id
        };
      });
      res.json({ success: true, menuItems: menuItems });
    })
    .catch(err => {
      console.error("Cloudinary data retrieval error:", err);
      res.json({ success: false, menuItems: [] });
    });
});

/* ── DELETE /api/delete-image ───────────────────────────────────
   Purges both image asset and item details from existence globally.
─────────────────────────────────────────────────────────────── */
app.delete('/api/delete-image', function (req, res) {
  const filename = (req.body && req.body.filename) ? req.body.filename : '';
  if (!filename) return res.status(400).json({ success: false, error: 'Invalid identifier.' });

  cloudinary.uploader.destroy(filename, function (err, result) {
    if (err || result.result !== 'ok') {
      return res.status(404).json({ success: false, error: 'Asset removal execution failed.' });
    }
    res.json({ success: true });
  });
});

/* ── Safe Catch-all fallback middleware ────────────────────────── 
   Using app.use ensures that whether users hit '/', '/admin', or refresh 
   the page, the application loads safely without breaking your layout.
─────────────────────────────────────────────────────────────── */
app.use(function (req, res) {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, function() {
  console.log('Mangalam Free-Tier Engine running cleanly on port ' + PORT);
});
