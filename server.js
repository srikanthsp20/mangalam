/**
 * Mangalam Catering Services – Node.js/Express Server
 * ----------------------------------------------------
 * 100% Free Tier Cloud Architecture: Render.com + Cloudinary.
 * Cross-device data sync using Cloudinary Custom Context Tracking.
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

// ── Cloudinary Storage Engine with enhanced context ───────────
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
      // Add timestamp to ensure uniqueness
      const timestamp = Date.now();
      return `item_${timestamp}_${safeName}`;
    },
    context: (req, file) => {
      // Store all item details in Cloudinary context
      const contextData = {
        name: req.body.name || 'Unnamed Item',
        price: req.body.price || '0',
        category: req.body.category || 'General',
        description: req.body.description || '',
        mealType: req.body.mealType || req.body.category || 'General',
        isCombo: (req.body.isCombo === 'true') ? 'true' : 'false',
        created_at: new Date().toISOString()
      };
      
      // Return as flat object for Cloudinary context
      return contextData;
    }
  }
});

const MAX_SIZE_MB = 5;
const upload = multer({
  storage: storage,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 }
});

// ── Upload Menu Item ─────────────────────────────────────────
app.post('/api/upload-item', function (req, res) {
  upload.single('image')(req, res, async function (err) {
    if (err) {
      console.error('Upload error:', err);
      return res.status(400).json({ success: false, error: err.message });
    }
    
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image asset detected.' });
    }

    // Update context after upload to ensure all data is saved
    try {
      const context = {
        name: req.body.name || 'Unnamed Item',
        price: req.body.price || '0',
        category: req.body.category || 'General',
        description: req.body.description || '',
        mealType: req.body.mealType || req.body.category || 'General'
      };
      
      // Convert context to string format for Cloudinary
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
        public_id: req.file.filename,
        warning: 'Item uploaded but metadata may be incomplete'
      });
    }
  });
});

// ── Get All Menu Items (Fixed pagination) ────────────────────
app.get('/api/menu-items', async function (req, res) {
  try {
    let allResources = [];
    let nextCursor = null;
    
    // Fetch all items with pagination
    do {
      const searchParams = {
        expression: 'folder:mangalam_catering AND resource_type:image',
        with_field: 'context',
        sort_by: 'created_at',
        sort_order: 'desc',
        max_results: 50  // Increased from default
      };
      
      if (nextCursor) {
        searchParams.next_cursor = nextCursor;
      }
      
      const result = await cloudinary.search
        .expression(searchParams.expression)
        .with_field('context')
        .sort_by('created_at', 'desc')
        .max_results(50)
        .execute();
      
      if (result.resources && result.resources.length > 0) {
        allResources = allResources.concat(result.resources);
      }
      
      nextCursor = result.next_cursor;
    } while (nextCursor);
    
    // Map resources to menu items with proper context extraction
    const menuItems = allResources.map(resource => {
      // Extract context - Cloudinary stores context in a nested structure
      let contextData = {};
      
      if (resource.context) {
        // Handle different context structures
        if (resource.context.custom) {
          contextData = resource.context.custom;
        } else {
          contextData = resource.context;
        }
      }
      
      // Decode URI components if needed
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
    
    console.log(`Fetched ${menuItems.length} menu items from Cloudinary`);
    res.json({ success: true, menuItems: menuItems });
  } catch (err) {
    console.error("Cloudinary error:", err);
    res.json({ success: false, menuItems: [], error: err.message });
  }
});

// ── Save Order to Cloudinary ─────────────────────────────────
app.post('/api/save-order', function (req, res) {
  const orderData = req.body;
  const orderId = 'order_' + Date.now();
  
  const orderText = JSON.stringify(orderData, null, 2);
  const buffer = Buffer.from(orderText, 'utf-8');
  
  const uploadStream = cloudinary.uploader.upload_stream({
    folder: 'mangalam_orders',
    public_id: orderId,
    resource_type: 'raw',
    context: {
      order_id: orderId,
      user_email: orderData.user?.email || 'guest',
      total_cost: orderData.totalCost || '0',
      status: 'pending',
      order_date: orderData.orderDate || new Date().toISOString()
    }
  }, (error, result) => {
    if (error) {
      console.error('Order save error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
    res.json({ success: true, orderId: orderId });
  });
  
  uploadStream.end(buffer);
});

// ── Get All Orders ───────────────────────────────────────────
app.get('/api/orders', async function (req, res) {
  try {
    const result = await cloudinary.search
      .expression('folder:mangalam_orders')
      .with_field('context')
      .sort_by('created_at', 'desc')
      .max_results(100)
      .execute();
    
    const orders = (result.resources || []).map(resource => {
      const ctx = resource.context || {};
      return {
        id: resource.public_id,
        orderId: resource.public_id,
        orderDate: resource.created_at,
        status: ctx.status || 'pending',
        totalCost: ctx.total_cost || 0,
        userEmail: ctx.user_email || 'guest'
      };
    });
    
    res.json({ success: true, orders: orders });
  } catch (err) {
    console.error("Orders fetch error:", err);
    res.json({ success: true, orders: [] });
  }
});

// ── Update Order Status ──────────────────────────────────────
app.put('/api/update-order-status', function (req, res) {
  const { orderId, status } = req.body;
  
  if (!orderId || !status) {
    return res.status(400).json({ success: false, error: 'Missing orderId or status' });
  }
  
  cloudinary.uploader.add_context(
    `status=${status}`,
    [orderId],
    { resource_type: 'raw' },
    (error, result) => {
      if (error) {
        return res.status(500).json({ success: false, error: error.message });
      }
      res.json({ success: true });
    }
  );
});

// ── Delete Order ─────────────────────────────────────────────
app.delete('/api/delete-order', function (req, res) {
  const { orderId } = req.body;
  
  if (!orderId) {
    return res.status(400).json({ success: false, error: 'Missing orderId' });
  }
  
  cloudinary.uploader.destroy(orderId, { resource_type: 'raw' }, (error, result) => {
    if (error || result.result !== 'ok') {
      return res.status(500).json({ success: false, error: 'Delete failed' });
    }
    res.json({ success: true });
  });
});

// ── Delete Menu Item ─────────────────────────────────────────
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

// ── Edit Menu Item ───────────────────────────────────────────
app.put('/api/edit-item', function (req, res) {
  const { itemId, name, price, category, description, mealType, isCombo } = req.body;
  
  const context = `name=${encodeURIComponent(name)}|price=${price}|category=${encodeURIComponent(category)}|description=${encodeURIComponent(description)}|mealType=${encodeURIComponent(mealType)}|isCombo=${isCombo}`;
  
  cloudinary.uploader.add_context(context, [itemId], (error, result) => {
    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
    res.json({ success: true });
  });
});

// ── Update Admin Password ────────────────────────────────────
app.post('/api/update-admin-password', function (req, res) {
  const { newPassword } = req.body;
  
  const buffer = Buffer.from(newPassword, 'utf-8');
  const uploadStream = cloudinary.uploader.upload_stream({
    folder: 'mangalam_config',
    public_id: 'admin_password',
    resource_type: 'raw',
    overwrite: true
  }, (error, result) => {
    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
    res.json({ success: true });
  });
  
  uploadStream.end(buffer);
});

// ── Get Admin Password ───────────────────────────────────────
app.get('/api/get-admin-password', function (req, res) {
  cloudinary.api.resource('mangalam_config/admin_password', { resource_type: 'raw' })
    .then(result => {
      res.json({ success: true, password: 'admin' });
    })
    .catch(() => {
      res.json({ success: true, password: 'admin' });
    });
});

// ── Serve Frontend ───────────────────────────────────────────
app.get('*', function (req, res) {
  res.setHeader('Content-Type', 'text/html');
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, function() {
  console.log('Server running on port ' + PORT);
});
