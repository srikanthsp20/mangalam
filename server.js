/**
 * Mangalam Catering Services – Node.js/Express Server
 * ----------------------------------------------------
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

// ── Cloudinary Configuration ───────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ── Cloudinary Storage Engine ───────────────────────────────
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
      const timestamp = Date.now();
      return `item_${timestamp}_${safeName}`;
    },
    context: (req, file) => {
      return {
        name: req.body.name || 'Unnamed Item',
        price: req.body.price || '0',
        category: req.body.category || 'General',
        description: req.body.description || '',
        mealType: req.body.mealType || req.body.category || 'General',
        isCombo: (req.body.isCombo === 'true') ? 'true' : 'false'
      };
    }
  }
});

const MAX_SIZE_MB = 5;
const upload = multer({
  storage: storage,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 }
});

// ── API ROUTES (Must come BEFORE the catch-all) ─────────────────

// Upload Menu Item
app.post('/api/upload-item', function (req, res) {
  upload.single('image')(req, res, async function (err) {
    if (err) {
      console.error('Upload error:', err);
      return res.status(400).json({ success: false, error: err.message });
    }
    
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image asset detected.' });
    }

    try {
      const context = {
        name: req.body.name || 'Unnamed Item',
        price: req.body.price || '0',
        category: req.body.category || 'General',
        description: req.body.description || '',
        mealType: req.body.mealType || req.body.category || 'General'
      };
      
      const contextString = Object.entries(context)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('|');
      
      if (contextString) {
        await cloudinary.uploader.add_context(contextString, req.file.filename);
      }
      
      res.json({
        success: true,
        filename: req.file.filename,
        url: req.file.path,
        public_id: req.file.filename
      });
    } catch (contextError) {
      console.error('Context update error:', contextError);
      res.json({
        success: true,
        filename: req.file.filename,
        url: req.file.path,
        public_id: req.file.filename
      });
    }
  });
});

// Get All Menu Items
app.get('/api/menu-items', async function (req, res) {
  try {
    let allResources = [];
    let nextCursor = null;
    
    do {
      const result = await cloudinary.search
        .expression('folder:mangalam_catering AND resource_type:image')
        .with_field('context')
        .sort_by('created_at', 'desc')
        .max_results(50)
        .execute();
      
      if (result.resources && result.resources.length > 0) {
        allResources = allResources.concat(result.resources);
      }
      
      nextCursor = result.next_cursor;
    } while (nextCursor);
    
    const menuItems = allResources.map(resource => {
      let contextData = {};
      
      if (resource.context) {
        if (resource.context.custom) {
          contextData = resource.context.custom;
        } else {
          contextData = resource.context;
        }
      }
      
      const decodeValue = (value) => {
        if (!value) return '';
        try {
          return decodeURIComponent(value);
        } catch {
          return value;
        }
      };
      
      return {
        id: resource.public_id,
        name: decodeValue(contextData.name) || 'Unnamed Item',
        price: parseFloat(contextData.price) || 0,
        category: decodeValue(contextData.category) || 'General',
        description: decodeValue(contextData.description) || '',
        mealType: decodeValue(contextData.mealType) || decodeValue(contextData.category) || 'General',
        isCombo: contextData.isCombo === 'true',
        image: resource.secure_url,
        cloudinary_id: resource.public_id,
        createdAt: resource.created_at
      };
    });
    
    console.log(`Fetched ${menuItems.length} menu items`);
    res.json({ success: true, menuItems: menuItems });
  } catch (err) {
    console.error("Cloudinary error:", err);
    res.json({ success: false, menuItems: [], error: err.message });
  }
});

// Delete Menu Item
app.delete('/api/delete-item', function (req, res) {
  const { itemId } = req.body;
  
  if (!itemId) {
    return res.status(400).json({ success: false, error: 'Missing itemId' });
  }
  
  cloudinary.uploader.destroy(itemId, (error, result) => {
    if (error) {
      console.error('Delete error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
    if (result.result !== 'ok') {
      return res.status(500).json({ success: false, error: 'Delete failed' });
    }
    res.json({ success: true });
  });
});

// Update Admin Password
app.post('/api/update-admin-password', function (req, res) {
  const { newPassword } = req.body;
  // Simple storage - in production use proper encryption
  res.json({ success: true });
});

// ── SERVE INDEX.HTML FOR ALL NON-API ROUTES ───────────────────
// This must be the LAST route
app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/index.html', function (req, res) {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Catch-all for client-side routing - but don't intercept API calls
app.get('*', function (req, res) {
  // Skip API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, function() {
  console.log('Server running on port ' + PORT);
  console.log('Access the app at http://localhost:' + PORT);
});
