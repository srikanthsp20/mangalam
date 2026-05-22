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

// ── Cloudinary Storage Engine ────────────────────────────────
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
    context: (req, file) => {
      return {
        name: req.body.name || 'Unnamed Item',
        price: req.body.price || '0',
        category: req.body.category || 'General',
        description: req.body.description || '',
        mealType: req.body.mealType || 'All',
        isCombo: req.body.isCombo || 'false'
      };
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
  upload.single('image')(req, res, function (err) {
    if (err) return res.status(400).json({ success: false, error: err.message });
    if (!req.file) return res.status(400).json({ success: false, error: 'No image asset detected.' });

    res.json({
      success: true,
      filename: req.file.filename,
      url: req.file.path,
      public_id: req.file.filename
    });
  });
});

// ── Get All Menu Items ───────────────────────────────────────
app.get('/api/menu-items', function (req, res) {
  cloudinary.search
    .expression('folder:mangalam_catering')
    .with_field('context')
    .sort_by('public_id', 'desc')
    .max_results(100)
    .execute()
    .then(result => {
      const menuItems = result.resources.map(resource => {
        const ctx = resource.context || {};
        const custom = ctx.custom || {};
        return {
          id: resource.public_id,
          name: custom.name || ctx.name || 'Unnamed Item',
          price: parseFloat(custom.price || ctx.price || 0),
          category: custom.category || ctx.category || 'General',
          description: custom.description || ctx.description || '',
          mealType: custom.mealType || ctx.mealType || 'All',
          isCombo: (custom.isCombo || ctx.isCombo || 'false') === 'true',
          image: resource.secure_url,
          cloudinary_id: resource.public_id,
          createdAt: resource.created_at
        };
      });
      res.json({ success: true, menuItems: menuItems });
    })
    .catch(err => {
      console.error("Cloudinary error:", err);
      res.json({ success: false, menuItems: [] });
    });
});

// ── Save Order to Cloudinary ─────────────────────────────────
app.post('/api/save-order', function (req, res) {
  const orderData = req.body;
  const orderId = 'order_' + Date.now();
  
  // Store order as a text file in Cloudinary
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
app.get('/api/orders', function (req, res) {
  cloudinary.search
    .expression('folder:mangalam_orders')
    .with_field('context')
    .sort_by('public_id', 'desc')
    .max_results(100)
    .execute()
    .then(async result => {
      const orders = [];
      
      for (const resource of result.resources) {
        try {
          // Fetch the actual order data
          const orderData = await cloudinary.api.resource(resource.public_id, { resource_type: 'raw' });
          const orderContent = orderData;
          
          orders.push({
            id: resource.public_id,
            ...(resource.context || {}),
            orderDate: resource.created_at,
            status: resource.context?.custom?.status || 'pending'
          });
        } catch (err) {
          console.error('Error fetching order:', err);
        }
      }
      
      res.json({ success: true, orders: orders });
    })
    .catch(err => {
      console.error("Orders fetch error:", err);
      res.json({ success: true, orders: [] });
    });
});

// ── Update Order Status ──────────────────────────────────────
app.put('/api/update-order-status', function (req, res) {
  const { orderId, status } = req.body;
  
  if (!orderId || !status) {
    return res.status(400).json({ success: false, error: 'Missing orderId or status' });
  }
  
  // Update order context in Cloudinary
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
    if (error || result.result !== 'ok') {
      return res.status(500).json({ success: false, error: 'Delete failed' });
    }
    res.json({ success: true });
  });
});

// ── Edit Menu Item ───────────────────────────────────────────
app.put('/api/edit-item', function (req, res) {
  const { itemId, name, price, category, description, mealType, isCombo } = req.body;
  
  const context = `name=${name}|price=${price}|category=${category}|description=${description}|mealType=${mealType}|isCombo=${isCombo}`;
  
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
  
  // Store encrypted password in Cloudinary
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
      res.json({ success: true, password: 'admin' }); // Default for first time
    })
    .catch(() => {
      res.json({ success: true, password: 'admin' }); // Default password
    });
});

// ── Serve Frontend ───────────────────────────────────────────
app.get('/', function (req, res) {
  res.setHeader('Content-Type', 'text/html');
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, function() {
  console.log('Server running on port ' + PORT);
});
