# Mangalam Catering Services — Web App

A single-page catering management app with an admin panel, menu management, and **server-side image uploads**.

## Project Structure

```
mangalam/
├── server.js          ← Express server (run this)
├── package.json
├── public/
│   ├── index.html     ← The full frontend
│   └── uploads/       ← Uploaded images are saved here (auto-created)
└── README.md
```

## Setup & Run

### 1. Install Node.js
Download from https://nodejs.org (v16 or newer recommended).

### 2. Install dependencies
```bash
npm install
```

### 3. Start the server
```bash
npm start
# or
node server.js
```

### 4. Open the app
Visit **http://localhost:3000** in your browser.

To use a different port:
```bash
PORT=8080 node server.js
```

---

## Image Upload Features

In the **Admin Panel → Menu Items**, when adding or editing an item you can:

| Tab | What it does |
|-----|-------------|
| **Upload from Device** | Pick a JPG/PNG/WebP/GIF from your computer. It uploads to `public/uploads/` on the server and the path (`/uploads/filename.jpg`) is stored. |
| **Paste URL** | Enter any external image URL (e.g. from the web). Stored as-is. |
| **Library** | Browse all previously uploaded images and re-use them. |

Uploaded images are served as static files by Express, so they work both in the admin panel and on the customer-facing menu page.

### Limits
- Max file size: **5 MB**
- Allowed types: JPG, PNG, WebP, GIF

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/upload-image` | Upload an image (field: `image`) |
| `GET`  | `/api/images` | List all uploaded images |
| `DELETE` | `/api/delete-image` | Delete an image by filename |

---

## Production Notes

- For production, put Nginx or Apache in front of Node and serve `public/uploads/` directly.
- Consider moving uploads to a cloud bucket (S3, Cloudinary) if you need to scale.
- The rest of the app data (orders, menu items, etc.) uses browser `localStorage` — for a real multi-user setup, wire those to a database (e.g. SQLite or MongoDB).
